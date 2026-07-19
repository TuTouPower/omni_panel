import { MIN_REFRESH_INTERVAL_SECONDS } from "../../../shared/constants";
import { createLogger } from "../../../shared/lib/logger";

const STAGGER_MAX_MS = 3000;

interface ConnectorSchedulerDeps {
    refresh: (instanceId: string) => Promise<void>;
}

export interface ConnectorScheduler {
    start(instanceId: string, intervalSeconds: number, options?: { immediate?: boolean }): void;
    stop(instanceId: string): void;
    stopAll(): void;
    refreshNow(instanceId: string): void;
    isRunning(instanceId: string): boolean;
}

export function createConnectorScheduler(deps: ConnectorSchedulerDeps): ConnectorScheduler {
    const log = createLogger("scheduler");
    const timers = new Map<string, { timer: ReturnType<typeof setTimeout>; interval: number }>();
    // First-fire jitter timers (applied when peers are already running). Tracked
    // separately so stop()/stopAll() can cancel them — otherwise a shutdown that
    // races the stagger window still fires one last refresh (A12).
    const jitter_timers = new Map<string, ReturnType<typeof setTimeout>>();

    function start(
        instanceId: string,
        intervalSeconds: number,
        options?: { immediate?: boolean },
    ): void {
        stop(instanceId);
        const interval = Math.max(intervalSeconds, MIN_REFRESH_INTERVAL_SECONDS) * 1000;

        log.debug(`Starting scheduler for ${instanceId} (every ${String(intervalSeconds)}s)`);
        if (options?.immediate !== false) {
            // 同 host 多实例同时启动会触发 TLS 握手限流（如 10 个 OpenCode Go → opencode.ai），
            // 有其他实例运行时随机错开，避免服务端拒绝连接。
            const has_peers = timers.size > 0;
            const jitter = has_peers ? Math.floor(Math.random() * STAGGER_MAX_MS) : 0;
            const do_refresh = (): void => {
                void deps.refresh(instanceId).catch((err: unknown) => {
                    log.error(
                        `refresh failed for ${instanceId}: ${err instanceof Error ? err.message : String(err)}`,
                    );
                });
            };
            if (jitter > 0) {
                const jitter_timer = setTimeout(() => {
                    jitter_timers.delete(instanceId);
                    do_refresh();
                }, jitter);
                jitter_timers.set(instanceId, jitter_timer);
            } else {
                do_refresh();
            }
        }

        function schedule_next(): void {
            const timer = setTimeout(() => {
                // Fire refresh without waiting for completion.
                // Decoupled so a hanging connector never kills the scheduler.
                void deps.refresh(instanceId).catch((err: unknown) => {
                    log.error(
                        `refresh failed for ${instanceId}: ${err instanceof Error ? err.message : String(err)}`,
                    );
                });
                schedule_next();
            }, interval);
            timers.set(instanceId, { timer, interval });
        }

        schedule_next();
    }

    function stop(instanceId: string): void {
        const entry = timers.get(instanceId);
        if (entry) {
            clearTimeout(entry.timer);
            timers.delete(instanceId);
            log.debug(`Stopped scheduler for ${instanceId}`);
        }
        const jitter_timer = jitter_timers.get(instanceId);
        if (jitter_timer) {
            clearTimeout(jitter_timer);
            jitter_timers.delete(instanceId);
        }
    }

    function stopAll(): void {
        // Snapshot keys first (D17): a schedule_next callback could otherwise
        // mutate the map during iteration. Single-threaded JS protects the
        // synchronous case, but the snapshot is cheap insurance.
        for (const id of [...new Set([...timers.keys(), ...jitter_timers.keys()])]) {
            stop(id);
        }
    }

    function refreshNow(instanceId: string): void {
        void deps.refresh(instanceId).catch((err: unknown) => {
            log.error(
                `refresh failed for ${instanceId}: ${err instanceof Error ? err.message : String(err)}`,
            );
        });
    }

    function isRunning(instanceId: string): boolean {
        return timers.has(instanceId);
    }

    return { start, stop, stopAll, refreshNow, isRunning };
}
