import { createLogger } from "../../../shared/lib/logger";
import type { PluginScheduler } from "./plugin-scheduler";
import type { AppConfigStore } from "../config/config-store";

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

export interface PluginListConfig {
    plugins: readonly {
        enabled: boolean;
        instanceId: string;
        refreshIntervalSeconds: number;
    }[];
}

export interface SchedulerOrchestratorDeps {
    scheduler: PluginScheduler;
    configStore: AppConfigStore;
}

export interface SchedulerOrchestrator {
    startAll(config: PluginListConfig): void;
    rebuild(config: PluginListConfig): void;
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

    function startAll(config: PluginListConfig): void {
        let count = 0;
        for (const plugin of config.plugins) {
            if (plugin.enabled) {
                deps.scheduler.start(plugin.instanceId, plugin.refreshIntervalSeconds);
                count++;
            }
        }
        log.info(`startAll: ${String(count)} plugins`);
    }

    function rebuild(config: PluginListConfig): void {
        log.info("rebuild: stopping all and restarting enabled");
        deps.scheduler.stopAll();
        startAll(config);
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
        void deps.configStore.load().then((latestConfig) => {
            if (generation !== resumeGen) {
                log.info("resume: generation mismatch, skipping startAll");
                return;
            }
            log.info("resume: restarting enabled plugins");
            startAll(latestConfig);
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
