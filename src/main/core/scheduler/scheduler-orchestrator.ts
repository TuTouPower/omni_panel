import { createLogger } from "../../../shared/lib/logger";
import { resolve_refresh_interval } from "../config/auto-seed";
import type { ConnectorScheduler } from "./connector-scheduler";
import type { AppConfigStore } from "../config/config-store";

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

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
    suspend(): void;
    resume(): void;
    shutdown(): void;
}

export function createSchedulerOrchestrator(
    deps: SchedulerOrchestratorDeps,
): SchedulerOrchestrator {
    const log = createLogger("orchestrator");
    let safetyNetTimer: ReturnType<typeof setTimeout> | null = null;
    let generation = 0;

    // The single enabled-connector loop. startAll and rebuild previously
    // duplicated this; a config-change bug in one would silently desync from
    // the other. Now written once.
    function applyEnabled(config: ConnectorListConfig, immediate: boolean): number {
        let count = 0;
        for (const connector of config.plugins) {
            if (connector.enabled && !connector.manualRefreshOnly) {
                const interval = resolve_refresh_interval(
                    connector.refreshIntervalSeconds,
                    config.globalRefreshIntervalSeconds,
                );
                deps.scheduler.start(connector.instanceId, interval, {
                    immediate,
                });
                count++;
            }
        }
        return count;
    }

    function startAll(config: ConnectorListConfig): void {
        log.info(`startAll: ${String(applyEnabled(config, true))} connectors`);
    }

    function rebuild(config: ConnectorListConfig): void {
        log.info("rebuild: stopping all and restarting enabled (no immediate refresh)");
        deps.scheduler.stopAll();
        log.info(`rebuild: restarted ${String(applyEnabled(config, false))} connectors`);
    }

    function suspend(): void {
        log.info("suspend: stopping all schedulers");
        deps.scheduler.stopAll();
        generation++;
        if (safetyNetTimer) {
            clearTimeout(safetyNetTimer);
        }
        safetyNetTimer = setTimeout(resume, FOUR_HOURS_MS);
    }

    function resume(): void {
        if (safetyNetTimer) {
            clearTimeout(safetyNetTimer);
            safetyNetTimer = null;
        }
        const resumeGen = generation;
        void deps.configStore
            .load()
            .then((latestConfig) => {
                if (generation !== resumeGen) {
                    log.info("resume: generation mismatch, skipping startAll");
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
        generation++;
        if (safetyNetTimer) {
            clearTimeout(safetyNetTimer);
            safetyNetTimer = null;
        }
        deps.scheduler.stopAll();
    }

    return { startAll, rebuild, suspend, resume, shutdown };
}
