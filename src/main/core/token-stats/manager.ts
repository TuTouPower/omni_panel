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
            // Auto-restart after 30 seconds
            if (current_config) {
                setTimeout(() => {
                    if (current_config) {
                        log.info("Restarting collector subprocess");
                        start(current_config);
                    }
                }, 30_000);
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
        if (child) {
            child.kill();
            child = null;
            log.info("Collector subprocess stopped");
        }
    }

    return { start, update_config, is_running, stop };
}

export type { TokenStatsUpdate };
