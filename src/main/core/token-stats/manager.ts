import { fork, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { createLogger } from "../../../shared/lib/logger";
import type { TokenStatsConfig, TokenStatsUpdate } from "../../../shared/types/token-stats";
import type { TokenStatsStore } from "./token-stats-store";

const log = createLogger("token-stats-manager");

export interface TokenStatsManager {
    start(config: TokenStatsConfig): void;
    update_config(config: TokenStatsConfig): void;
    stop(): void;
}

export function create_token_stats_manager(deps: {
    store: TokenStatsStore;
    on_update?: () => void;
}): TokenStatsManager {
    let child: ChildProcess | null = null;
    let current_config: TokenStatsConfig | null = null;

    function start(config: TokenStatsConfig): void {
        if (child) {
            log.warn("Manager already running, stopping first");
            stop();
        }

        current_config = config;
        const collector_path = join(__dirname, "collector.js");

        log.info(`Starting collector subprocess: ${collector_path}`);
        child = fork(collector_path, [], {
            stdio: ["pipe", "pipe", "pipe", "ipc"],
        });

        child.on("message", (msg: { type?: string; buckets?: unknown[]; sessions?: unknown[] }) => {
            if (msg.type !== "token_stats_update") return;
            try {
                deps.store.upsert_buckets((msg.buckets ?? []) as TokenStatsUpdate["buckets"]);
                deps.store.upsert_sessions((msg.sessions ?? []) as TokenStatsUpdate["sessions"]);
                log.debug(
                    `Stored ${String(msg.buckets.length)} buckets, ${String(msg.sessions.length)} sessions`,
                );
                deps.on_update?.();
            } catch (err: unknown) {
                const msg_str = err instanceof Error ? err.message : String(err);
                log.error(`Failed to store token stats: ${msg_str}`);
            }
        });

        child.on("error", (err) => {
            log.error(`Collector subprocess error: ${err.message}`);
        });

        child.on("exit", (code, signal) => {
            log.warn(`Collector subprocess exited: code=${String(code)} signal=${String(signal)}`);
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

        // Send initial config
        child.send({ type: "config", config });

        // Capture subprocess stderr
        child.stderr?.on("data", (data: Buffer) => {
            log.error(`[collector] ${data.toString().trim()}`);
        });

        log.info("Collector subprocess started");
    }

    function update_config(config: TokenStatsConfig): void {
        current_config = config;
        if (child?.connected) {
            child.send({ type: "config", config });
            log.info("Updated collector config");
        }
    }

    function stop(): void {
        current_config = null;
        if (child) {
            child.kill();
            child = null;
            log.info("Collector subprocess stopped");
        }
    }

    return { start, update_config, stop };
}
