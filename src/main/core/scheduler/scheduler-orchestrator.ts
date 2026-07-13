import { createLogger } from "../../../shared/lib/logger";
import { resolve_refresh_interval } from "../config/auto-seed";
import type { ConnectorScheduler } from "./connector-scheduler";
import type { AppConfigStore } from "../config/config-store";

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

type PauseReason = "user" | "system";

interface ConnectorListConfig {
    plugins: readonly {
        enabled: boolean;
        instanceId: string;
        refreshIntervalSeconds: number;
        manualRefreshOnly?: boolean;
    }[];
    globalRefreshIntervalSeconds?: number;
}

interface SchedulerOrchestratorDeps {
    scheduler: ConnectorScheduler;
    configStore: AppConfigStore;
}

interface SchedulerOrchestrator {
    startAll(config: ConnectorListConfig): void;
    rebuild(config: ConnectorListConfig): void;
    reconcile(previousConfig: ConnectorListConfig, nextConfig: ConnectorListConfig): void;
    suspend(reason: PauseReason): void;
    resume(reason: PauseReason): void;
    shutdown(): void;
}

interface ScheduleEntry {
    instanceId: string;
    interval: number;
}

function build_schedule(config: ConnectorListConfig): ScheduleEntry[] {
    const schedule = new Map<string, number>();
    for (const connector of config.plugins) {
        if (!connector.enabled || connector.manualRefreshOnly) continue;
        schedule.set(
            connector.instanceId,
            resolve_refresh_interval(
                connector.refreshIntervalSeconds,
                config.globalRefreshIntervalSeconds,
            ),
        );
    }
    return [...schedule.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([instanceId, interval]) => ({ instanceId, interval }));
}

function schedules_equal(left: readonly ScheduleEntry[], right: readonly ScheduleEntry[]): boolean {
    return (
        left.length === right.length &&
        left.every((entry, index) => {
            const other = right[index];
            return entry.instanceId === other?.instanceId && entry.interval === other.interval;
        })
    );
}

export function createSchedulerOrchestrator(
    deps: SchedulerOrchestratorDeps,
): SchedulerOrchestrator {
    const log = createLogger("orchestrator");
    const pauseReasons = new Set<PauseReason>();
    let safetyNetTimer: ReturnType<typeof setTimeout> | null = null;
    let generation = 0;
    let shutdownStarted = false;

    function apply_schedule(schedule: readonly ScheduleEntry[], immediate: boolean): number {
        for (const entry of schedule) {
            deps.scheduler.start(entry.instanceId, entry.interval, { immediate });
        }
        return schedule.length;
    }

    function startAll(config: ConnectorListConfig): void {
        if (shutdownStarted || pauseReasons.size > 0) return;
        log.info(`startAll: ${String(apply_schedule(build_schedule(config), true))} connectors`);
    }

    function rebuild(config: ConnectorListConfig): void {
        if (shutdownStarted || pauseReasons.size > 0) {
            log.info("rebuild: deferred while suspended");
            return;
        }
        log.info("rebuild: stopping all and restarting enabled (no immediate refresh)");
        deps.scheduler.stopAll();
        log.info(
            `rebuild: restarted ${String(apply_schedule(build_schedule(config), false))} connectors`,
        );
    }

    function reconcile(previousConfig: ConnectorListConfig, nextConfig: ConnectorListConfig): void {
        if (schedules_equal(build_schedule(previousConfig), build_schedule(nextConfig))) return;
        rebuild(nextConfig);
    }

    function clear_system_safety_net(): void {
        if (!safetyNetTimer) return;
        clearTimeout(safetyNetTimer);
        safetyNetTimer = null;
    }

    function suspend(reason: PauseReason): void {
        log.info(`suspend(${reason}): stopping all schedulers`);
        pauseReasons.add(reason);
        deps.scheduler.stopAll();
        generation++;
        if (reason !== "system") return;
        clear_system_safety_net();
        safetyNetTimer = setTimeout(() => {
            resume("system");
        }, FOUR_HOURS_MS);
    }

    function resume(reason: PauseReason): void {
        if (reason === "system") clear_system_safety_net();
        pauseReasons.delete(reason);
        if (shutdownStarted || pauseReasons.size > 0) return;

        const resumeGen = generation;
        void deps.configStore
            .load()
            .then((latestConfig) => {
                if (shutdownStarted || pauseReasons.size > 0 || generation !== resumeGen) {
                    log.info("resume: state changed, skipping startAll");
                    return;
                }
                log.info("resume: restarting enabled connectors");
                startAll(latestConfig);
            })
            .catch((error: unknown) => {
                const message = error instanceof Error ? error.message : String(error);
                log.error(`resume: failed to load config: ${message}`);
            });
    }

    function shutdown(): void {
        shutdownStarted = true;
        generation++;
        clear_system_safety_net();
        deps.scheduler.stopAll();
    }

    return { startAll, rebuild, reconcile, suspend, resume, shutdown };
}
