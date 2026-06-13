import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { PluginConfiguration } from "../config/types";
import type { AppConfigStore } from "../config/config-store";
import type { RuntimeStore } from "./runtime-store";
import type { VaultBackend } from "../vault/vault-backend";
import type { Observation } from "../../../shared/types/observation";
import type { UsageItem, UsageSource } from "../../../shared/schemas/plugin-output";
import { usageProviderSchema } from "../../../shared/schemas/plugin-output";
import { createLogger } from "../../../shared/lib/logger";
import type { ConnectorDefinition } from "../connector/manifest-loader";
import { create_connector_context } from "../connector/net-client";
import { execute_poll } from "../connector/tier1-poll-executor";
import { run_connector } from "../connector/runtime";
import type { ObservationStore } from "../observation/observation-store";
import type { PluginSnapshotState } from "./types";

export interface RefreshServiceDeps {
    definitions: readonly ConnectorDefinition[];
    observationStore: ObservationStore;
    runtimeStore: RuntimeStore;
    configStore: AppConfigStore;
    vault: VaultBackend;
}

export interface PluginRefreshService {
    refresh(instanceId: string, options?: { force?: boolean }): Promise<void>;
    refreshAll(): Promise<void>;
}

function previous_ready(state: PluginSnapshotState) {
    if (state.status !== "ready") return undefined;
    return {
        updatedAt: state.updatedAt.toISOString(),
        items: state.items,
        ...(state.badge !== undefined && { badge: state.badge }),
        ...(state.chart !== undefined && { chart: state.chart }),
    };
}

function source_for_observation(obs: Observation, definition: ConnectorDefinition): UsageSource {
    if (definition.manifest.id === "cpa" || obs.source === "gateway") return "cpa";
    if (obs.source === "local") return "local";
    if (obs.source === "session") return "oauth";
    if (definition.manifest.parameters.some((param) => param.type === "secret")) return "api_key";
    return "direct";
}

function resolve_script_path(definition: ConnectorDefinition): string {
    if (!definition.manifest.script) throw new Error("Connector script is missing");
    const connector_dir = resolve(definition.directory);
    const script_path = resolve(connector_dir, definition.manifest.script);
    const relative_path = relative(connector_dir, script_path);
    if (relative_path.startsWith("..") || isAbsolute(relative_path)) {
        throw new Error(
            `Connector ${definition.manifest.id} script path escapes connector directory`,
        );
    }
    return script_path;
}

function observation_to_usage_item(
    obs: Observation,
    definition: ConnectorDefinition,
): UsageItem | null {
    const provider = usageProviderSchema.safeParse(obs.provider);
    if (!provider.success) return null;

    return {
        id: `${obs.source_instance_id}:${obs.account_id}:${obs.metric_id}`,
        provider: provider.data,
        source: source_for_observation(obs, definition),
        sourceInstanceId: obs.source_instance_id,
        accountId: obs.account_id,
        accountLabel: obs.account_label,
        name: obs.name,
        used: obs.used,
        limit: obs.limit ?? 0,
        displayStyle: obs.display_style,
        resetAt: obs.reset_at === null ? null : new Date(obs.reset_at).toISOString(),
        status: obs.status,
        observedAt: new Date(obs.observed_at).toISOString(),
        stale: obs.stale,
    };
}

async function build_params(
    plugin: PluginConfiguration,
    definition: ConnectorDefinition,
    vault: VaultBackend,
): Promise<Record<string, string>> {
    const params: Record<string, string> = {};
    for (const param of definition.manifest.parameters) {
        const configured = plugin.parameterValues[param.name] ?? param.default ?? "";
        if (param.type !== "secret") {
            params[param.name] = configured;
            continue;
        }
        if (!param.exposeToScript) continue;
        const stored = await vault.get(`${plugin.instanceId}:${param.name}`);
        if (stored !== null) {
            params[param.name] = stored;
            continue;
        }
        if (configured !== "") {
            params[param.name] = configured;
            continue;
        }
        // Required secret is genuinely missing (no vault entry, no configured
        // value, no default). Failing here is deliberate: silently sending an
        // empty credential would produce an unauthenticated API request that
        // usually returns a misleading 401/403 instead of a clear "missing
        // secret" error. Optional secrets with no value are allowed through as
        // empty strings — some connectors have genuinely optional auth.
        if (param.required) {
            throw new Error(
                `Missing required secret: ${param.name} (instance ${plugin.instanceId})`,
            );
        }
        params[param.name] = "";
    }
    return params;
}

async function execute_connector(
    plugin: PluginConfiguration,
    definition: ConnectorDefinition,
    vault: VaultBackend,
): Promise<Observation[]> {
    const params = await build_params(plugin, definition, vault);
    const ctx = create_connector_context(definition.manifest, vault, plugin.instanceId, {
        endpoint_overrides: { ...plugin.endpointOverrides },
        params,
    });

    if (definition.manifest.script) {
        const script_code = await readFile(resolve_script_path(definition), "utf8");
        const result = await run_connector(definition.manifest, script_code, ctx);
        if (result.error) throw new Error(result.error);
        return result.observations;
    }

    if (definition.manifest.poll) {
        return execute_poll(definition.manifest, plugin.instanceId, ctx);
    }

    throw new Error(`Connector ${definition.manifest.id} has no executable capability`);
}

export function createRefreshService(deps: RefreshServiceDeps): PluginRefreshService {
    const log = createLogger("refresh-service");
    const locks = new Set<string>();

    async function refresh(instanceId: string, options?: { force?: boolean }): Promise<void> {
        log.debug(`Refresh start: ${instanceId} (force=${String(options?.force === true)})`);
        if (locks.has(instanceId)) {
            log.debug(`Refresh skipped for ${instanceId} (already in progress)`);
            return;
        }
        locks.add(instanceId);

        try {
            const config = await deps.configStore.load();
            const plugin = config.plugins.find(
                (p: PluginConfiguration) => p.instanceId === instanceId,
            );
            if (!plugin) {
                log.warn(`Refresh requested for unknown instanceId: ${instanceId}`);
                return;
            }
            const definition = deps.definitions.find(
                (item) => item.executablePath === plugin.executablePath,
            );
            if (!definition) {
                log.warn(`Refresh requested for connector without definition: ${instanceId}`);
                return;
            }

            const prior = previous_ready(deps.runtimeStore.getSnapshot(instanceId));
            deps.runtimeStore.updateState(instanceId, {
                status: "loading",
                ...(prior !== undefined && { lastSuccess: prior }),
            });

            try {
                const observations = await execute_connector(plugin, definition, deps.vault);
                for (const obs of observations) {
                    try {
                        deps.observationStore.insert(obs);
                    } catch (insert_error: unknown) {
                        const insert_message =
                            insert_error instanceof Error
                                ? insert_error.message
                                : String(insert_error);
                        log.error(
                            `Failed to insert observation for ${instanceId} (${plugin.name}): ${insert_message}`,
                        );
                        throw insert_error;
                    }
                }
                const items = observations
                    .map((obs) => observation_to_usage_item(obs, definition))
                    .filter((item): item is UsageItem => item !== null);
                const updated_at = observations.reduce(
                    (latest, obs) => Math.max(latest, obs.observed_at),
                    Date.now(),
                );
                deps.runtimeStore.updateState(instanceId, {
                    status: "ready",
                    items,
                    updatedAt: new Date(updated_at),
                });
                log.info(
                    `Connector ${instanceId} (${plugin.name}) refreshed: ${String(items.length)} items`,
                );
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                log.error(`Connector ${instanceId} (${plugin.name}) failed: ${message}`);
                deps.runtimeStore.updateState(instanceId, {
                    status: "failed",
                    error: message,
                    ...(prior !== undefined && { lastSuccess: prior }),
                });
            }
        } finally {
            locks.delete(instanceId);
        }
    }

    async function refreshAll(): Promise<void> {
        const config = await deps.configStore.load();
        const enabledPlugins = config.plugins.filter((p: PluginConfiguration) => p.enabled);
        log.info(`Refreshing all ${String(enabledPlugins.length)} enabled connectors`);
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
