import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { ConnectorConfiguration } from "../config/types";
import type { AppConfigStore } from "../config/config-store";
import type { RuntimeStore } from "./runtime-store";
import type { VaultBackend } from "../vault/vault-backend";
import type { Observation } from "../../../shared/types/observation";
import type { MetricRecord, UsageSource } from "../../../shared/schemas/plugin-output";
import { usageProviderSchema } from "../../../shared/schemas/plugin-output";
import { createLogger } from "../../../shared/lib/logger";
import type { ConnectorDefinition } from "../connector/manifest-loader";
import { create_connector_context } from "../connector/net-client";
import { execute_poll } from "../connector/tier1-poll-executor";
import { execute_probe } from "../connector/probe-executor";
import { run_connector } from "../connector/runtime";
import type { ObservationStore } from "../observation/observation-store";
import type { ConnectorSnapshotState } from "./types";

export interface RefreshServiceDeps {
    definitions: readonly ConnectorDefinition[];
    observationStore: ObservationStore;
    runtimeStore: RuntimeStore;
    configStore: AppConfigStore;
    vault: VaultBackend;
    sessionLogin?: (instanceId: string) => Promise<{ saved: boolean }>;
}

export interface ConnectorRefreshService {
    refresh(instanceId: string, options?: { force?: boolean }): Promise<void>;
    refreshAll(): Promise<void>;
}

function previous_ready(state: ConnectorSnapshotState) {
    if (state.status !== "ready") return undefined;
    return {
        updatedAt: state.updatedAt.toISOString(),
        items: state.items,
        ...(state.badge !== undefined && { badge: state.badge }),
        ...(state.chart !== undefined && { chart: state.chart }),
    };
}

function is_auth_error(message: string): boolean {
    const lower = message.toLowerCase();
    return (
        lower.includes("401") ||
        lower.includes("unauthorized") ||
        lower.includes("token") ||
        lower.includes("credential") ||
        lower.includes("auth")
    );
}

function source_for_observation(obs: Observation, definition: ConnectorDefinition): UsageSource {
    if (definition.manifest.id === "cpa" || obs.source === "gateway") return "cpa";
    if (obs.source === "local") return "local";
    if (obs.source === "session") return "oauth";
    if (obs.source === "probe") return "direct";
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
): MetricRecord | null {
    const provider = usageProviderSchema.safeParse(obs.provider);
    if (!provider.success) return null;

    return {
        id: `${obs.source_instance_id}:${obs.account_id}:${obs.metric_id}`,
        provider: provider.data,
        source: source_for_observation(obs, definition),
        sourceInstanceId: obs.source_instance_id,
        accountId: obs.account_id,
        accountLabel: obs.account_label,
        raw_label: obs.raw_label,
        normalized_label: obs.normalized_label,
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
    connector_config: ConnectorConfiguration,
    definition: ConnectorDefinition,
    vault: VaultBackend,
): Promise<Record<string, string>> {
    const params: Record<string, string> = {};
    for (const param of definition.manifest.parameters) {
        const configured = connector_config.parameterValues[param.name] ?? param.default ?? "";
        if (param.type !== "secret") {
            params[param.name] = configured;
            continue;
        }
        if (!param.exposeToScript) continue;
        const stored = await vault.get(`${connector_config.instanceId}:${param.name}`);
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
            throw new Error(`Missing required secret: ${param.name}`);
        }
        params[param.name] = "";
    }
    return params;
}

async function execute_connector(
    connector_config: ConnectorConfiguration,
    definition: ConnectorDefinition,
    vault: VaultBackend,
    proxy_url?: string,
): Promise<Observation[]> {
    const params = await build_params(connector_config, definition, vault);
    const ctx = create_connector_context(definition.manifest, vault, connector_config.instanceId, {
        endpoint_overrides: { ...connector_config.endpointOverrides },
        params,
        ...(proxy_url ? { proxy_url } : {}),
    });

    if (definition.manifest.script) {
        const script_code = await readFile(resolve_script_path(definition), "utf8");
        const result = await run_connector(definition.manifest, script_code, ctx);
        if (result.error) throw new Error(result.error);
        return result.observations;
    }

    if (definition.manifest.poll) {
        return execute_poll(definition.manifest, connector_config.instanceId, ctx);
    }

    if (definition.manifest.observe?.probe) {
        return execute_probe(definition.manifest, connector_config.instanceId, ctx);
    }

    throw new Error(`Connector ${definition.manifest.id} has no executable capability`);
}

export function createRefreshService(deps: RefreshServiceDeps): ConnectorRefreshService {
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
            const connector_config = config.plugins.find(
                (p: ConnectorConfiguration) => p.instanceId === instanceId,
            );
            if (!connector_config) {
                log.warn(`Refresh requested for unknown instanceId: ${instanceId}`);
                return;
            }
            const definition = deps.definitions.find(
                (item) => item.executablePath === connector_config.executablePath,
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
                const observations = await execute_connector(
                    connector_config,
                    definition,
                    deps.vault,
                    config.proxy?.url,
                );
                for (const obs of observations) {
                    try {
                        deps.observationStore.insert(obs);
                    } catch (insert_error: unknown) {
                        const insert_message =
                            insert_error instanceof Error
                                ? insert_error.message
                                : String(insert_error);
                        log.error(
                            `Failed to insert observation for ${instanceId} (${connector_config.name}): ${insert_message}`,
                        );
                        throw insert_error;
                    }
                }
                const items = observations
                    .map((obs) => observation_to_usage_item(obs, definition))
                    .filter((item): item is MetricRecord => item !== null);
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
                    `Connector ${instanceId} (${connector_config.name}) refreshed: ${String(items.length)} items`,
                );
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                log.error(`Connector ${instanceId} (${connector_config.name}) failed: ${message}`);

                // Auto re-login for session-based connectors on auth errors
                if (
                    deps.sessionLogin &&
                    definition.manifest.capabilities.includes("session") &&
                    is_auth_error(message)
                ) {
                    log.info(`Auto-triggering re-login for ${connector_config.name}`);
                    try {
                        const result = await deps.sessionLogin(instanceId);
                        if (result.saved) {
                            log.info(
                                `Re-login succeeded for ${connector_config.name}, retrying refresh`,
                            );
                            // Re-run the connector with fresh cookies
                            const retry_observations = await execute_connector(
                                connector_config,
                                definition,
                                deps.vault,
                                config.proxy?.url,
                            );
                            for (const obs of retry_observations) {
                                deps.observationStore.insert(obs);
                            }
                            const retry_items = retry_observations
                                .map((obs) => observation_to_usage_item(obs, definition))
                                .filter((item): item is MetricRecord => item !== null);
                            const retry_updated_at = retry_observations.reduce(
                                (latest, obs) => Math.max(latest, obs.observed_at),
                                Date.now(),
                            );
                            deps.runtimeStore.updateState(instanceId, {
                                status: "ready",
                                items: retry_items,
                                updatedAt: new Date(retry_updated_at),
                            });
                            log.info(
                                `Connector ${connector_config.name} refreshed after re-login: ${String(retry_items.length)} items`,
                            );
                            return;
                        }
                    } catch (login_error: unknown) {
                        log.error(
                            `Auto re-login failed for ${connector_config.name}: ${login_error instanceof Error ? login_error.message : String(login_error)}`,
                        );
                    }
                }

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
        const enabled_connectors = config.plugins.filter((p: ConnectorConfiguration) => p.enabled);
        log.info(`Refreshing all ${String(enabled_connectors.length)} enabled connectors`);
        const results = await Promise.allSettled(
            enabled_connectors.map((p: ConnectorConfiguration) => refresh(p.instanceId)),
        );
        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed > 0) {
            log.warn(
                `RefreshAll complete: ${String(enabled_connectors.length - failed)}/${String(enabled_connectors.length)} succeeded, ${String(failed)} rejected`,
            );
        }
    }

    return { refresh, refreshAll };
}
