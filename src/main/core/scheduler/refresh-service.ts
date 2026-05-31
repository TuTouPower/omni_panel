import type { PluginConfiguration } from "../config/types";
import type { AppConfigStore } from "../config/config-store";
import type { CacheStore } from "../cache/cache-store";
import type { RuntimeStore } from "./runtime-store";
import type { PluginExecutionResult } from "../plugin/runner";
import type { PluginCommand } from "../plugin/command-builder";
import type { PluginResult } from "../../../shared/schemas/plugin-output";
import type { AppLanguage } from "../../../shared/types/plugin";
import type { SecretsStore } from "../config/secrets-store";
import { createLogger } from "../../../shared/lib/logger";
import { resolveRuntimeEnv } from "./endpoint-resolver";
import {
    PluginOutputParseError,
    PluginSchemaError,
    PluginExecutionError,
} from "../../../shared/errors/plugin-errors";

export interface RefreshServiceDeps {
    runner: (
        command: PluginCommand,
        options?: { timeoutMs?: number },
    ) => Promise<PluginExecutionResult>;
    outputParser: (stdout: string) => PluginResult;
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
    getMetadataEndpoints: (instanceId: string) => Record<string, string | null> | undefined;
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
        const foundKeys: string[] = [];
        const missingKeys: string[] = [];
        for (const key of secretKeys) {
            const value = await deps.secretsStore.get(`${instanceId}:${key}`);
            if (value !== null) {
                foundKeys.push(key);
                merged[key] = value;
            } else {
                missingKeys.push(key);
                log.debug(`Secret not found: ${instanceId}:${key}`);
            }
        }
        log.debug(
            `Secret merge for ${instanceId}: found=${foundKeys.join(",") || "none"} missing=${missingKeys.join(",") || "none"}`,
        );
        return merged;
    }

    async function refresh(instanceId: string, options?: { force?: boolean }): Promise<void> {
        log.debug(`Refresh start: ${instanceId} (force=${String(options?.force === true)})`);
        if (locks.has(instanceId)) {
            log.debug(`Refresh skipped for ${instanceId} (already in progress)`);
            return;
        }
        locks.add(instanceId);

        try {
            const config = await deps.configStore.load();
            log.debug(`Config loaded for ${instanceId}: ${String(config.plugins.length)} plugins`);
            const plugin = config.plugins.find(
                (p: PluginConfiguration) => p.instanceId === instanceId,
            );
            if (!plugin) {
                log.warn(`Refresh requested for unknown instanceId: ${instanceId}`);
                return;
            }

            if (!options?.force) {
                const cached = await deps.cacheStore.load(instanceId);
                if (cached) {
                    const expired = isCacheExpired(cached.updatedAt, plugin.refreshIntervalSeconds);
                    log.debug(
                        `Cache check for ${instanceId}: updatedAt=${cached.updatedAt} interval=${String(plugin.refreshIntervalSeconds)}s expired=${String(expired)}`,
                    );
                    if (!expired) {
                        log.debug(`Cache hit for ${instanceId} (${plugin.name}), skipping refresh`);
                        deps.runtimeStore.updateState(instanceId, {
                            status: "ready",
                            items: cached.items,
                            updatedAt: new Date(cached.updatedAt),
                            ...(cached.badge !== undefined && { badge: cached.badge }),
                            ...(cached.chart !== undefined && { chart: cached.chart }),
                        });
                        log.debug(`Runtime state ready for ${instanceId} from cache`);
                        return;
                    }
                } else {
                    log.debug(`Cache miss for ${instanceId}`);
                }
            } else {
                log.debug(`Cache skipped for ${instanceId}: force refresh`);
            }

            deps.runtimeStore.updateState(instanceId, { status: "loading" });
            log.debug(`Runtime state loading for ${instanceId}`);

            const mergedParams = await mergeSecrets(instanceId, plugin.parameterValues);
            const command = deps.commandBuilder(
                plugin.executablePath,
                mergedParams,
                config.language,
            );

            const metadataEndpoints = deps.getMetadataEndpoints(instanceId);
            const runtimeEnv = resolveRuntimeEnv(metadataEndpoints, plugin, config);
            const commandWithEnv: PluginCommand = {
                ...command,
                env: {
                    ...(command.env ?? {}),
                    OMNI_SOURCE_INSTANCE_ID: plugin.instanceId,
                    ...(runtimeEnv.endpoints
                        ? { OMNI_PLUGIN_ENDPOINTS: runtimeEnv.endpoints }
                        : {}),
                    ...(runtimeEnv.proxy ? { OMNI_PLUGIN_PROXY: runtimeEnv.proxy } : {}),
                },
            };
            log.debug(
                `Command built for ${instanceId}: args=${String(commandWithEnv.args.length)} env=${String(Object.keys(commandWithEnv.env ?? {}).length)}`,
            );

            try {
                log.debug(`Executing plugin ${instanceId} (${plugin.name})`);
                const result = await deps.runner(commandWithEnv, { timeoutMs: 15_000 });

                if (result.exitCode !== 0) {
                    throw new PluginExecutionError(
                        `Plugin exited with code ${String(result.exitCode)}`,
                        result.exitCode,
                        result.stderr,
                    );
                }

                log.debug(
                    `Plugin ${instanceId} (${plugin.name}) stdout [${String(result.stdout.length)}B]`,
                );
                if (result.stderr.length > 0) {
                    log.debug(
                        `Plugin ${instanceId} (${plugin.name}) stderr [${String(result.stderr.length)}B]`,
                    );
                }
                log.debug(`Parsing plugin output for ${instanceId}`);
                const output = deps.outputParser(result.stdout);
                if (!output.success) {
                    log.warn(
                        `Plugin ${instanceId} (${plugin.name}) reported error: ${output.error.code} - ${output.error.message}`,
                    );
                    deps.runtimeStore.updateState(instanceId, {
                        status: "failed",
                        error: output.error.message,
                    });
                    log.debug(`Runtime state failed for ${instanceId}`);
                    return;
                }
                log.info(
                    `Plugin ${instanceId} (${plugin.name}) refreshed: ${String(output.items.length)} items in ${String(result.durationMs)}ms`,
                );

                log.debug(`Saving cache for ${instanceId}`);
                await deps.cacheStore.save(instanceId, {
                    updatedAt: output.updatedAt,
                    items: output.items,
                    ...(output.badge !== undefined && { badge: output.badge }),
                    ...(output.chart !== undefined && { chart: output.chart }),
                });
                log.debug(`Cache saved for ${instanceId}`);

                deps.runtimeStore.updateState(instanceId, {
                    status: "ready",
                    items: output.items,
                    updatedAt: new Date(output.updatedAt),
                    ...(output.badge !== undefined && { badge: output.badge }),
                    ...(output.chart !== undefined && { chart: output.chart }),
                });
                log.debug(`Runtime state ready for ${instanceId}`);
            } catch (error: unknown) {
                let message: string;
                if (error instanceof PluginExecutionError) {
                    message = error.stderr.trim() || error.message;
                    log.error(
                        `Plugin ${instanceId} (${plugin.name}) failed (exit ${String(error.exitCode)}): ${message}`,
                    );
                } else {
                    message = error instanceof Error ? error.message : String(error);
                    if (error instanceof PluginSchemaError) {
                        log.error(
                            `Plugin ${instanceId} (${plugin.name}) schema mismatch: ${message}`,
                            { issues: error.issues },
                        );
                    } else if (error instanceof PluginOutputParseError) {
                        log.error(`Plugin ${instanceId} (${plugin.name}) parse error: ${message}`);
                    } else {
                        log.error(`Plugin ${instanceId} (${plugin.name}) failed: ${message}`);
                    }
                }
                const lastSuccess = await deps.cacheStore.load(instanceId);
                deps.runtimeStore.updateState(instanceId, {
                    status: "failed",
                    error: message,
                    ...(lastSuccess !== null && { lastSuccess }),
                });
                log.debug(`Runtime state failed for ${instanceId}`);
            }
        } finally {
            locks.delete(instanceId);
        }
    }

    async function refreshAll(): Promise<void> {
        const config = await deps.configStore.load();
        const enabledPlugins = config.plugins.filter((p: PluginConfiguration) => p.enabled);
        log.info(`Refreshing all ${String(enabledPlugins.length)} enabled plugins`);
        const results = await Promise.allSettled(
            enabledPlugins.map((p: PluginConfiguration) => refresh(p.instanceId)),
        );
        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed > 0) {
            log.warn(
                `RefreshAll complete: ${String(enabledPlugins.length - failed)}/${String(enabledPlugins.length)} succeeded, ${String(failed)} rejected`,
            );
        }
    }

    return { refresh, refreshAll };
}
