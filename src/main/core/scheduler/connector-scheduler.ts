import {
    MIN_REFRESH_INTERVAL_SECONDS,
    SCHEDULER_MAX_BACKOFF_SECONDS,
} from "../../../shared/constants";
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
    getFailureCount?(instanceId: string): number;
}

export function createConnectorScheduler(deps: ConnectorSchedulerDeps): ConnectorScheduler {
    const log = createLogger("scheduler");
    const timers = new Map<string, { timer: ReturnType<typeof setTimeout>; interval: number }>();
    // First-fire jitter timers (applied when peers are already running). Tracked
    // separately so stop()/stopAll() can cancel them — otherwise a shutdown that
    // races the stagger window still fires one last refresh (A12).
    const jitter_timers = new Map<string, ReturnType<typeof setTimeout>>();
    // A145: 记录每个实例的连续失败次数，用于计算指数退避
    const failure_counts = new Map<string, number>();

    function calculate_next_interval(base_interval_ms: number, failures: number): number {
        if (failures <= 0) return base_interval_ms;
        // 指数退避：base * 2^failures，最大不超过 SCHEDULER_MAX_BACKOFF_SECONDS
        const max_ms = SCHEDULER_MAX_BACKOFF_SECONDS * 1000;
        const multiplier = Math.min(Math.pow(2, failures), max_ms / base_interval_ms);
        const backoff_base = Math.min(max_ms, base_interval_ms * multiplier);
        // 随机抖动 (jitter): 0 ~ 20%
        const jitter = Math.floor(Math.random() * (0.2 * backoff_base));
        return Math.min(max_ms, backoff_base + jitter);
    }

    function start(
        instanceId: string,
        intervalSeconds: number,
        options?: { immediate?: boolean },
    ): void {
        stop(instanceId);
        // A145 / AC-002: 下限不小于 MIN_REFRESH_INTERVAL_SECONDS (30s)
        const interval = Math.max(intervalSeconds, MIN_REFRESH_INTERVAL_SECONDS) * 1000;

        log.debug(
            `Starting scheduler for ${instanceId} (every ${String(intervalSeconds)}s, min clamped to ${String(interval / 1000)}s)`,
        );

        // 占位注册使 isRunning 和 has_peers 立即同步可见
        timers.set(instanceId, {
            timer: undefined as unknown as ReturnType<typeof setTimeout>,
            interval,
        });

        const has_peers = timers.size > 1;
        function schedule_next(): void {
            const current_failures = failure_counts.get(instanceId) ?? 0;
            const next_interval = calculate_next_interval(interval, current_failures);
            if (current_failures > 0) {
                log.info(
                    `Exponential backoff for ${instanceId}: next refresh in ${String(Math.round(next_interval / 1000))}s (failures=${String(current_failures)})`,
                );
            }

            const timer = setTimeout(() => {
                trigger_cycle();
            }, next_interval);
            timers.set(instanceId, { timer, interval });
        }

        function trigger_cycle(): void {
            // 立即排入下一次默认周期，确保 hanging 任务绝不卡死调度器
            schedule_next();

            void Promise.resolve(deps.refresh(instanceId))
                .then(() => {
                    failure_counts.delete(instanceId);
                })
                .catch((err: unknown) => {
                    const count = (failure_counts.get(instanceId) ?? 0) + 1;
                    failure_counts.set(instanceId, count);
                    log.error(
                        `refresh failed for ${instanceId} (failures=${String(count)}): ${err instanceof Error ? err.message : String(err)}`,
                    );
                    // A145: 遇到失败后立即升级为指数退避定时器，取消刚排入的普通周期
                    const backoff_delay = calculate_next_interval(interval, count);
                    const current_entry = timers.get(instanceId);
                    if (current_entry) {
                        clearTimeout(current_entry.timer);
                        const backoff_timer = setTimeout(() => {
                            trigger_cycle();
                        }, backoff_delay);
                        timers.set(instanceId, { timer: backoff_timer, interval });
                    }
                });
        }

        if (options?.immediate !== false) {
            const jitter = has_peers ? Math.floor(Math.random() * STAGGER_MAX_MS) : 0;
            const do_refresh = (): void => {
                trigger_cycle();
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
        } else {
            schedule_next();
        }
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
        for (const id of [...new Set([...timers.keys(), ...jitter_timers.keys()])]) {
            stop(id);
        }
        failure_counts.clear();
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

    function getFailureCount(instanceId: string): number {
        return failure_counts.get(instanceId) ?? 0;
    }

    return { start, stop, stopAll, refreshNow, isRunning, getFailureCount };
}
