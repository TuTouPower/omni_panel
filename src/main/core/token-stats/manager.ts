import { app, utilityProcess, type UtilityProcess } from "electron";
import * as fs from "node:fs";
import { join } from "node:path";
import { createLogger } from "../../../shared/lib/logger";
import type { TokenStatsConfig, TokenStatsUpdate } from "../../../shared/types/token-stats";
import type { TokenStatsStore } from "./token-stats-store";

const log = createLogger("token-stats-manager");

export interface TokenStatsManager {
    start(config: TokenStatsConfig): void;
    update_config(config: TokenStatsConfig): void;
    is_running(): boolean;
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
    const RAPID_EXIT_THRESHOLD_MS = 5 * 60 * 1000;
    const MAX_RAPID_FAILURES = 5;

    function start(config: TokenStatsConfig): void {
        if (child) {
            log.warn("Manager already running, stopping first");
            stop();
        }

        current_config = config;
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
            }) => {
                if (msg.type !== "token_stats_update") return;
                try {
                    deps.store.upsert_sessions(
                        (msg.sessions ?? []) as TokenStatsUpdate["sessions"],
                        (msg.daily ?? []) as TokenStatsUpdate["daily"],
                    );
                    deps.store.upsert_records((msg.records ?? []) as TokenStatsUpdate["records"]);
                    log.debug(
                        `Stored ${String(msg.sessions?.length ?? 0)} session deltas, ${String(msg.daily?.length ?? 0)} daily rows, ${String(msg.records?.length ?? 0)} records`,
                    );
                    deps.on_update?.();
                } catch (err: unknown) {
                    const msg_str = err instanceof Error ? err.message : String(err);
                    log.error(`Failed to store token stats: ${msg_str}`);
                }
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
        log.info("Collector subprocess started");
    }

    function update_config(config: TokenStatsConfig): void {
        current_config = config;
        if (child) {
            child.postMessage({ type: "config", config });
            log.info("Updated collector config");
        }
    }

    function is_running(): boolean {
        return child !== null;
    }

    function stop(): void {
        current_config = null;
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

    return { start, update_config, is_running, stop };
}

export type { TokenStatsUpdate };
