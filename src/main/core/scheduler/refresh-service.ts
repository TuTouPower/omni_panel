import type { PluginConfiguration } from "../config/types";
import type { AppConfigStore } from "../config/config-store";
import type { CacheStore } from "../cache/cache-store";
import type { RuntimeStore } from "./runtime-store";
import type { PluginExecutionResult } from "../plugin/runner";
import type { PluginCommand } from "../plugin/command-builder";
import type { PluginOutput } from "../../../shared/schemas/plugin-output";
import type { AppLanguage } from "../../../shared/types/plugin";
import type { SecretsStore } from "../config/secrets-store";
import { createLogger } from "../../../shared/lib/logger";

export interface RefreshServiceDeps {
    runner: (
        command: PluginCommand,
        options?: { timeoutMs?: number },
    ) => Promise<PluginExecutionResult>;
    outputParser: (stdout: string) => PluginOutput;
    commandBuilder: (
        executablePath: string,
        parameterValues: Record<string, string>,
        language: AppLanguage,
    ) => PluginCommand;
    cacheStore: CacheStore;
    runtimeStore: RuntimeStore;
    configStore: AppConfigStore;
    secretsStore: SecretsStore;
    secretParamKeys: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface PluginRefreshService {
    refresh(instanceId: string, options?: { force?: boolean }): Promise<void>;
    refreshAll(): Promise<void>;
}

function isCacheExpired(updatedAt: string, intervalSeconds: number): boolean {
    const interval = Math.max(intervalSeconds, 5);
    const elapsed = (Date.now() - new Date(updatedAt).getTime()) / 1000;
    return elapsed > interval;
}

export function createRefreshService(deps: RefreshServiceDeps): PluginRefreshService {
    const log = createLogger("refresh-service");
    const locks = new Set<string>();

    async function mergeSecrets(
        instanceId: string,
        parameterValues: Readonly<Record<string, string>>,
    ): Promise<Record<string, string>> {
        const secretKeys = deps.secretParamKeys.get(instanceId);
        if (!secretKeys || secretKeys.size === 0) {
            return { ...parameterValues };
        }
        const merged = { ...parameterValues };
        for (const key of secretKeys) {
            const value = await deps.secretsStore.get(`${instanceId}:${key}`);
            if (value !== null) {
                merged[key] = value;
            }
        }
        return merged;
    }

    async function refresh(instanceId: string, options?: { force?: boolean }): Promise<void> {
        if (locks.has(instanceId)) return;
        locks.add(instanceId);

        try {
            const config = await deps.configStore.load();
            const plugin = config.plugins.find(
                (p: PluginConfiguration) => p.instanceId === instanceId,
            );
            if (!plugin) return;

            if (!options?.force) {
                const cached = await deps.cacheStore.load(instanceId);
                if (cached && !isCacheExpired(cached.updatedAt, plugin.refreshIntervalSeconds)) {
                    log.debug(`Cache hit for ${instanceId}, skipping refresh`);
                    deps.runtimeStore.updateState(instanceId, {
                        status: "ready",
                        items: cached.items,
                        updatedAt: new Date(cached.updatedAt),
                        ...(cached.badge !== undefined && { badge: cached.badge }),
                        ...(cached.chart !== undefined && { chart: cached.chart }),
                    });
                    return;
                }
            }

            deps.runtimeStore.updateState(instanceId, { status: "loading" });

            const mergedParams = await mergeSecrets(instanceId, plugin.parameterValues);
            const command = deps.commandBuilder(
                plugin.executablePath,
                mergedParams,
                config.language,
            );

            try {
                log.debug(`Executing plugin ${instanceId}`);
                const result = await deps.runner(command, { timeoutMs: 15_000 });
                const output = deps.outputParser(result.stdout);
                log.info(`Plugin ${instanceId} refreshed: ${String(output.items.length)} items`);

                await deps.cacheStore.save(instanceId, {
                    updatedAt: output.updatedAt,
                    items: output.items,
                    ...(output.badge !== undefined && { badge: output.badge }),
                    ...(output.chart !== undefined && { chart: output.chart }),
                });

                deps.runtimeStore.updateState(instanceId, {
                    status: "ready",
                    items: output.items,
                    updatedAt: new Date(output.updatedAt),
                    ...(output.badge !== undefined && { badge: output.badge }),
                    ...(output.chart !== undefined && { chart: output.chart }),
                });
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                log.error(`Plugin ${instanceId} failed: ${message}`);
                const lastSuccess = await deps.cacheStore.load(instanceId);
                deps.runtimeStore.updateState(instanceId, {
                    status: "failed",
                    error: message,
                    ...(lastSuccess !== null && { lastSuccess }),
                });
            }
        } finally {
            locks.delete(instanceId);
        }
    }

    async function refreshAll(): Promise<void> {
        const config = await deps.configStore.load();
        const enabledPlugins = config.plugins.filter((p: PluginConfiguration) => p.enabled);
        await Promise.allSettled(
            enabledPlugins.map((p: PluginConfiguration) => refresh(p.instanceId)),
        );
    }

    return { refresh, refreshAll };
}
