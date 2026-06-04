import { MIN_REFRESH_INTERVAL_SECONDS } from "../../../shared/constants";
import { createLogger } from "../../../shared/lib/logger";

interface PluginSchedulerDeps {
    refresh: (instanceId: string) => Promise<void>;
}

export interface PluginScheduler {
    start(instanceId: string, intervalSeconds: number): void;
    stop(instanceId: string): void;
    stopAll(): void;
    refreshNow(instanceId: string): void;
    isRunning(instanceId: string): boolean;
}

export function createPluginScheduler(deps: PluginSchedulerDeps): PluginScheduler {
    const log = createLogger("scheduler");
    const timers = new Map<string, { timer: ReturnType<typeof setInterval>; interval: number }>();

    function start(instanceId: string, intervalSeconds: number): void {
        stop(instanceId);
        const interval = Math.max(intervalSeconds, MIN_REFRESH_INTERVAL_SECONDS) * 1000;

        log.debug(`Starting scheduler for ${instanceId} (every ${String(intervalSeconds)}s)`);
        void deps.refresh(instanceId);

        const timer = setInterval(() => {
            void deps.refresh(instanceId);
        }, interval);

        timers.set(instanceId, { timer, interval });
    }

    function stop(instanceId: string): void {
        const entry = timers.get(instanceId);
        if (entry) {
            clearInterval(entry.timer);
            timers.delete(instanceId);
            log.debug(`Stopped scheduler for ${instanceId}`);
        }
    }

    function stopAll(): void {
        for (const [id] of timers) {
            stop(id);
        }
    }

    function refreshNow(instanceId: string): void {
        void deps.refresh(instanceId);
    }

    function isRunning(instanceId: string): boolean {
        return timers.has(instanceId);
    }

    return { start, stop, stopAll, refreshNow, isRunning };
}
