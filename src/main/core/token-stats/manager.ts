import { app, utilityProcess, type UtilityProcess } from "electron";
import * as fs from "node:fs";
import { join } from "node:path";
import { createLogger } from "../../../shared/lib/logger";
import type {
    TokenStatsConfig,
    TokenStatsSourceStatus,
    TokenStatsUpdate,
} from "../../../shared/types/token-stats";
import type { TokenStatsStore } from "./token-stats-store";

const log = createLogger("token-stats-manager");

export interface TokenStatsManager {
    start(config: TokenStatsConfig): void;
    update_config(config: TokenStatsConfig): void;
    is_running(): boolean;
    /** 是否处于熔断跳闸态（t396 AC-002）：连续快速崩溃后已停止自动重启，
     * 与显式 stop() 区分——跳闸可经 update_config 恢复，stop 后需显式 start。 */
    is_tripped(): boolean;
    stop(): void;
}

/**
 * Resolve the collector entry built by electron-vite (out/main/collector.js).
 * Packaged: prefer the real file in app.asar.unpacked when present; the
 * utilityProcess child also handles asar paths, so the asar path is the
 * fallback.
 */
function resolve_collector_path(): string {
    const candidate = join(__dirname, "collector.js");
    if (!app.isPackaged) {
        return candidate;
    }
    const unpacked = candidate.replace("app.asar", "app.asar.unpacked");
    return fs.existsSync(unpacked) ? unpacked : candidate;
}

/**
 * 规范化比较两个 token-stats 配置（t347 AC-004）：递归按 key 排序后序列化，
 * 使 `{a:1,b:2}` 与 `{b:2,a:1}` 判等（原 JSON.stringify 序相关，注释与实际不符）。
 * 配置是扁平原始值对象，键数固定且少，排序开销可忽略。
 */
function same_config(a: TokenStatsConfig, b: TokenStatsConfig): boolean {
    return JSON.stringify(sort_keys(a)) === JSON.stringify(sort_keys(b));
}

/** 按 key 排序的规范化副本（递归，数组按元素序）。 */
function sort_keys(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sort_keys);
    }
    if (typeof value === "object" && value !== null) {
        const record = value as Record<string, unknown>;
        const sorted: Record<string, unknown> = {};
        for (const key of Object.keys(record).sort()) {
            sorted[key] = sort_keys(record[key]);
        }
        return sorted;
    }
    return value;
}

export function create_token_stats_manager(deps: {
    store: TokenStatsStore;
    on_update?: () => void;
}): TokenStatsManager {
    let child: UtilityProcess | null = null;
    let current_config: TokenStatsConfig | null = null;
    // Pending auto-restart timer - tracked so stop()/shutdown can clear it
    // instead of leaving it pending to fire after the app is gone (A13).
    let restart_timer: ReturnType<typeof setTimeout> | null = null;
    // Crash-circuit-breaker (A14): if the collector repeatedly exits shortly
    // after start (native binding missing, WSL path error, ...), an unbounded
    // 30s restart loop wastes CPU and floods logs. After MAX_RAPID_FAILURES
    // rapid exits we give up and surface the error.
    let rapid_failure_count = 0;
    let last_started_at = 0;
    let tripped = false;
    const RAPID_EXIT_THRESHOLD_MS = 5 * 60 * 1000;
    const MAX_RAPID_FAILURES = 5;

    /** 每批记录数上限：批次间 setImmediate 让出事件循环（t256）。 */
    const UPDATE_BATCH_SIZE = 2000;

    /** 分批应用 collector update，每批间 setImmediate 让出，避免长阻塞主进程。
     * 循环边界取三数组最大长度（collector 的 records/daily 可数倍于 sessions），
     * 每数组独立切片，越界 slice 自然返回剩余，保证不丢数据（t256 f001）。 */
    function apply_batches(
        sessions: TokenStatsUpdate["sessions"],
        daily: TokenStatsUpdate["daily"],
        records: TokenStatsUpdate["records"],
    ): void {
        const total = Math.max(sessions.length, daily.length, records.length);
        let offset = 0;
        const step = (): void => {
            const chunk_sessions = sessions.slice(offset, offset + UPDATE_BATCH_SIZE);
            const chunk_daily = daily.slice(offset, offset + UPDATE_BATCH_SIZE);
            const chunk_records = records.slice(offset, offset + UPDATE_BATCH_SIZE);
            try {
                // t347 AC-001: 仅最后一批触发 buckets 重建（否则每批全表聚合）。
                const is_last = offset + UPDATE_BATCH_SIZE >= total;
                deps.store.upsert_sessions(chunk_sessions, chunk_daily, is_last);
                deps.store.upsert_records(chunk_records);
                log.debug(
                    `Stored ${String(chunk_sessions.length)} session deltas, ${String(chunk_daily.length)} daily rows, ${String(chunk_records.length)} records (batch ${String(Math.min(offset + UPDATE_BATCH_SIZE, total))}/${String(total)})`,
                );
            } catch (err: unknown) {
                // t347 AC-002: 单批 DB 失败不丢弃剩余批次——记断点继续下一批
                // （本批数据丢失由 collector 增量重发兜底），最后仍回调 on_update。
                const msg_str = err instanceof Error ? err.message : String(err);
                log.error(`Failed to store token stats: ${msg_str}`);
            }
            // 成功与失败批次都推进 offset（失败不中断剩余批次）。
            offset += UPDATE_BATCH_SIZE;
            if (offset < total) {
                setImmediate(step);
            } else {
                deps.on_update?.();
            }
        };
        step();
    }

    function start(config: TokenStatsConfig): void {
        if (child) {
            log.warn("Manager already running, stopping first");
            stop();
        }

        current_config = config;
        tripped = false;
        const collector_path = resolve_collector_path();

        log.info(`Starting collector subprocess: ${collector_path}`);
        // utilityProcess (not child_process.fork): the packaged app sets the
        // runAsNode fuse to false, which disables ELECTRON_RUN_AS_NODE and
        // silently breaks child_process.fork.
        child = utilityProcess.fork(collector_path, [], {
            stdio: ["ignore", "pipe", "pipe"],
            serviceName: "token-stats-collector",
        });
        last_started_at = Date.now();

        child.on(
            "message",
            (msg: {
                type?: string;
                sessions?: unknown[];
                daily?: unknown[];
                records?: unknown[];
                sources_status?: unknown[];
                level?: string;
                module?: string;
                message?: string;
            }) => {
                // D7: structured log forwarded from the collector subprocess -
                // route through the main logger so collector logs get scrubber
                // redaction + 7-day rotation instead of landing on stderr only.
                if (msg.type === "collector_log") {
                    const level = msg.level === "error" ? "error" : "warn";
                    const module_name = msg.module ?? "collector";
                    const text = msg.message ?? "";
                    const collector_log = createLogger(
                        module_name.startsWith("collector")
                            ? module_name
                            : `collector:${module_name}`,
                    );
                    collector_log[level](text);
                    return;
                }
                if (msg.type !== "token_stats_update") return;
                // 分批让路：collector 每轮发一条含全部数据的 update，主进程一次
                // upsert 含全量 buckets 重建会长时间阻塞事件循环。按批拆分处理，
                // 每批间 setImmediate 让出，供面板查询即时响应（t256 / spike s021）。
                const sessions = (msg.sessions ?? []) as TokenStatsUpdate["sessions"];
                const daily = (msg.daily ?? []) as TokenStatsUpdate["daily"];
                const records = (msg.records ?? []) as TokenStatsUpdate["records"];
                // t309: 源级采集状态随 update 上抛，落到 store 供面板读取。
                const sources_status = (msg.sources_status ?? []) as TokenStatsSourceStatus[];
                deps.store.set_sources_status(sources_status);
                apply_batches(sessions, daily, records);
            },
        );

        child.on("exit", (code) => {
            log.warn(`Collector subprocess exited: code=${String(code)}`);
            child = null;
            // A14: detect rapid crash loops. If the process lived less than the
            // threshold, count it against the breaker; on a clean long run reset.
            const uptime_ms = Date.now() - last_started_at;
            if (uptime_ms < RAPID_EXIT_THRESHOLD_MS) {
                rapid_failure_count += 1;
            } else {
                rapid_failure_count = 0;
            }
            if (rapid_failure_count >= MAX_RAPID_FAILURES) {
                log.error(
                    `Collector crashed ${String(rapid_failure_count)} times within ${String(RAPID_EXIT_THRESHOLD_MS / 1000)}s; stopping auto-restart. Check native bindings / WSL paths.`,
                );
                current_config = null;
                rapid_failure_count = 0;
                tripped = true;
                return;
            }
            // Auto-restart after 30 seconds
            if (current_config) {
                const cfg = current_config;
                restart_timer = setTimeout(() => {
                    restart_timer = null;
                    if (current_config) {
                        log.info("Restarting collector subprocess");
                        start(cfg);
                    }
                }, 30_000);
                // A13: don't keep the event loop alive solely for a restart timer.
                restart_timer.unref();
            }
        });

        child.stderr?.on("data", (data: Buffer) => {
            log.error(`[collector] ${data.toString().trim()}`);
        });

        // Send initial config
        child.postMessage({ type: "config", config });
        // t192: backfill the hour rollup once, off the start path. The rebuild
        // is a synchronous SQL transaction, so defer it to the next tick;
        // until `hour_rollup_ready` flips, dashboard reads keep using the
        // records path, then switch to the aggregate. Databases that already
        // have a ready rollup skip this (incremental upserts keep it current).
        if (!deps.store.is_hour_rollup_ready()) {
            setImmediate(() => {
                try {
                    deps.store.backfill_hour_rollup();
                    log.info("Hour rollup backfilled; dashboard reads switched to aggregate path");
                } catch (err: unknown) {
                    const msg_str = err instanceof Error ? err.message : String(err);
                    log.error(`Hour rollup backfill failed: ${msg_str}`);
                }
            });
        }
        log.info("Collector subprocess started");
    }

    function update_config(config: TokenStatsConfig): void {
        // Debounce (D): index.ts calls update_config on EVERY config save
        // (card reorder, expansion toggle, ...), and the collector re-runs a
        // full collect() on each config message. Skip the postMessage when the
        // token-stats-relevant fields are byte-identical to the current config.
        if (current_config && same_config(current_config, config)) {
            return;
        }
        current_config = config;
        if (child) {
            child.postMessage({ type: "config", config });
            log.info("Updated collector config");
        } else {
            // t347 AC-003: 熔断跳闸后 child 为 null（current_config 被清）——
            // 配置更新即恢复路径：复位熔断计数并重新 spawn（否则只能重启应用）。
            // t347 f002: 先清 pending restart_timer，防旧 timer 用旧 config 重新
            // fork（非熔断退出后的 30s 窗口内改配置会回退新配置 + 多余重启）。
            if (restart_timer) {
                clearTimeout(restart_timer);
                restart_timer = null;
            }
            log.info("Collector not running; restarting on config update");
            start(config);
        }
    }

    function is_running(): boolean {
        return child !== null;
    }

    function is_tripped(): boolean {
        return tripped;
    }

    function stop(): void {
        current_config = null;
        tripped = false;
        if (restart_timer) {
            clearTimeout(restart_timer);
            restart_timer = null;
        }
        rapid_failure_count = 0;
        if (child) {
            child.kill();
            child = null;
            log.info("Collector subprocess stopped");
        }
    }

    return { start, update_config, is_running, is_tripped, stop };
}

export type { TokenStatsUpdate };
