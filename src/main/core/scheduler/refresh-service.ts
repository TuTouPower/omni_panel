import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { ConnectorConfiguration } from "../config/types";
import type { AppConfigStore } from "../config/config-store";
import type { RuntimeStore } from "./runtime-store";
import type { VaultBackend } from "../vault/vault-backend";
import type { Observation } from "../../../shared/types/observation";
import type { MetricRecord, UsageSource } from "../../../shared/schemas/plugin-output";
import { usageProviderSchema } from "../../../shared/schemas/plugin-output";
import { createLogger, createTraceId, withLogContext } from "../../../shared/lib/logger";
import type { ConnectorDefinition } from "../connector/manifest-loader";
import { create_connector_context } from "../connector/net-client";
import { execute_poll } from "../connector/tier1-poll-executor";
import { execute_probe } from "../connector/probe-executor";
import { run_connector } from "../connector/runtime";
import type { AsyncObservationStore } from "../observation/observation-store-async";
import type { ConnectorSnapshotState, SnapshotSuccess } from "./types";

export interface RefreshServiceDeps {
    definitions: readonly ConnectorDefinition[];
    observationStore: AsyncObservationStore;
    runtimeStore: RuntimeStore;
    configStore: AppConfigStore;
    vault: VaultBackend;
    sessionLogin?: (instanceId: string) => Promise<{ saved: boolean }>;
}

export interface ConnectorRefreshService {
    refresh(instanceId: string, options?: { force?: boolean }): Promise<void>;
    refreshAll(): Promise<void>;
}

/** Extract the last known-good data from any state (ready or failed with lastSuccess). */
function last_success_snapshot(state: ConnectorSnapshotState): SnapshotSuccess | undefined {
    if (state.status === "ready") {
        return {
            updatedAt: state.updatedAt.toISOString(),
            items: state.items,
            ...(state.badge !== undefined && { badge: state.badge }),
            ...(state.chart !== undefined && { chart: state.chart }),
        };
    }
    if (state.status === "loading" || state.status === "failed") {
        return state.lastSuccess;
    }
    return undefined;
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

function source_for_observation(obs: Observation): UsageSource {
    return obs.source;
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

const observation_to_usage_log = createLogger("refresh-service");

function observation_to_usage_item(obs: Observation): MetricRecord | null {
    const provider = usageProviderSchema.safeParse(obs.provider);
    if (!provider.success) {
        observation_to_usage_log.warn(
            `Skipping observation with invalid provider: ${obs.provider} (${obs.metric_id})`,
        );
        return null;
    }

    return {
        id: `${obs.source_instance_id}:${obs.account_id}:${obs.metric_id}`,
        provider: provider.data,
        source: source_for_observation(obs),
        sourceInstanceId: obs.source_instance_id,
        accountId: obs.account_id,
        accountLabel: obs.account_label,
        raw_label: obs.raw_label,
        normalized_label: obs.normalized_label,
        used: obs.used,
        limit: obs.limit,
        displayStyle: obs.display_style,
        resetAt: obs.reset_at,
        status: obs.status,
        observedAt: obs.observed_at,
        stale: obs.stale,
    };
}

const build_params_log = createLogger("refresh-service");

async function build_params(
    connector_config: ConnectorConfiguration,
    definition: ConnectorDefinition,
    vault: VaultBackend,
    trace_id?: string,
): Promise<Record<string, string>> {
    const secret_names = new Set(
        definition.manifest.parameters.filter((p) => p.type === "secret").map((p) => p.name),
    );
    const params: Record<string, string> = {};
    for (const param of definition.manifest.parameters) {
        const configured = String(
            connector_config.parameterValues[param.name] ?? param.default ?? "",
        );
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
    const safe_params: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
        safe_params[key] = secret_names.has(key) ? "***" : value;
    }
    const log = trace_id ? withLogContext(build_params_log, { trace_id }) : build_params_log;
    log.debug(`Params for ${connector_config.instanceId}: ${JSON.stringify(safe_params)}`);
    return params;
}

async function execute_connector(
    connector_config: ConnectorConfiguration,
    definition: ConnectorDefinition,
    vault: VaultBackend,
    proxy_url?: string,
    trace_id?: string,
): Promise<Observation[]> {
    const params = await build_params(connector_config, definition, vault, trace_id);
    const ctx = create_connector_context(definition.manifest, vault, connector_config.instanceId, {
        endpoint_overrides: { ...connector_config.endpointOverrides },
        params,
        ...(proxy_url ? { proxy_url } : {}),
        ...(trace_id ? { trace_id } : {}),
    });

    let raw_observations: Observation[];
    if (definition.manifest.script) {
        const script_code = await readFile(resolve_script_path(definition), "utf8");
        const result = await run_connector(definition.manifest, script_code, ctx);
        if (result.error) throw new Error(result.error);
        raw_observations = result.observations;
    } else if (definition.manifest.poll) {
        raw_observations = await execute_poll(
            definition.manifest,
            connector_config.instanceId,
            ctx,
        );
    } else if (definition.manifest.observe?.probe) {
        raw_observations = await execute_probe(
            definition.manifest,
            connector_config.instanceId,
            ctx,
        );
    } else {
        throw new Error(`Connector ${definition.manifest.id} has no executable capability`);
    }

    // Host-authority identity: the connector instance id is established by the
    // host, not by the (untrusted) connector script. Stamp it on every
    // observation so two instances of the same direct provider (e.g. two
    // Firecrawl accounts) do not collapse into one account downstream.
    return raw_observations.map((obs) => ({
        ...obs,
        source_instance_id: connector_config.instanceId,
    }));
}

export function createRefreshService(deps: RefreshServiceDeps): ConnectorRefreshService {
    const log = createLogger("refresh-service");
    const locks = new Map<string, number>();
    const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

    function is_locked(instanceId: string): boolean {
        const locked_at = locks.get(instanceId);
        if (locked_at === undefined) return false;
        if (Date.now() - locked_at < LOCK_TIMEOUT_MS) return true;
        log.warn(
            `Stale lock removed for ${instanceId} (held for ${String(Math.round((Date.now() - locked_at) / 1000))}s)`,
        );
        locks.delete(instanceId);
        return false;
    }

    async function refresh(instanceId: string, options?: { force?: boolean }): Promise<void> {
        const trace_id = createTraceId("refresh");
        const trace_log = withLogContext(log, { trace_id });
        trace_log.debug(`Refresh start: ${instanceId} (force=${String(options?.force === true)})`);
        if (is_locked(instanceId)) {
            trace_log.debug(`Refresh skipped for ${instanceId} (already in progress)`);
            return;
        }
        locks.set(instanceId, Date.now());

        try {
            const config = await deps.configStore.load();
            const connector_config = config.plugins.find(
                (p: ConnectorConfiguration) => p.instanceId === instanceId,
            );
            if (!connector_config) {
                trace_log.warn(`Refresh requested for unknown instanceId: ${instanceId}`);
                return;
            }
            const definition = deps.definitions.find(
                (item) => item.executablePath === connector_config.executablePath,
            );
            if (!definition) {
                trace_log.warn(`Refresh requested for connector without definition: ${instanceId}`);
                return;
            }

            const prior = last_success_snapshot(deps.runtimeStore.getSnapshot(instanceId));
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
                    trace_id,
                );
                for (const obs of observations) {
                    try {
                        await deps.observationStore.insert(obs);
                    } catch (insert_error: unknown) {
                        const insert_message =
                            insert_error instanceof Error
                                ? insert_error.message
                                : String(insert_error);
                        trace_log.error(
                            `Failed to insert observation for ${instanceId} (${connector_config.name}): ${insert_message}`,
                        );
                        throw insert_error;
                    }
                }
                const items = observations
                    .map((obs) => observation_to_usage_item(obs))
                    .filter((item): item is MetricRecord => item !== null);
                const updated_at =
                    observations.length > 0
                        ? observations.reduce((latest, obs) => Math.max(latest, obs.observed_at), 0)
                        : Date.now();
                deps.runtimeStore.updateState(instanceId, {
                    status: "ready",
                    items,
                    updatedAt: new Date(updated_at),
                });
                trace_log.info(
                    `Connector ${instanceId} (${connector_config.name}) refreshed: ${String(items.length)} items`,
                );
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                trace_log.error(
                    `Connector ${instanceId} (${connector_config.name}) failed: ${message}`,
                );

                // Auto re-login for session-based connectors on auth errors
                if (
                    deps.sessionLogin &&
                    definition.manifest.capabilities.includes("session") &&
                    is_auth_error(message)
                ) {
                    trace_log.info(`Auto-triggering re-login for ${connector_config.name}`);
                    try {
                        const result = await deps.sessionLogin(instanceId);
                        if (result.saved) {
                            trace_log.info(
                                `Re-login succeeded for ${connector_config.name}, waiting before retry`,
                            );
                            await new Promise((resolve) => setTimeout(resolve, 2000));
                            // Re-run the connector with fresh cookies
                            const retry_observations = await execute_connector(
                                connector_config,
                                definition,
                                deps.vault,
                                config.proxy?.url,
                                trace_id,
                            );
                            for (const obs of retry_observations) {
                                await deps.observationStore.insert(obs);
                            }
                            const retry_items = retry_observations
                                .map((obs) => observation_to_usage_item(obs))
                                .filter((item): item is MetricRecord => item !== null);
                            const retry_updated_at =
                                retry_observations.length > 0
                                    ? retry_observations.reduce(
                                          (latest, obs) => Math.max(latest, obs.observed_at),
                                          0,
                                      )
                                    : Date.now();
                            deps.runtimeStore.updateState(instanceId, {
                                status: "ready",
                                items: retry_items,
                                updatedAt: new Date(retry_updated_at),
                            });
                            trace_log.info(
                                `Connector ${connector_config.name} refreshed after re-login: ${String(retry_items.length)} items`,
                            );
                            return;
                        }
                    } catch (login_error: unknown) {
                        trace_log.error(
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

    async function with_concurrency<T>(
        items: T[],
        fn: (item: T) => Promise<void>,
        limit: number,
    ): Promise<void> {
        const executing = new Set<Promise<void>>();
        for (const item of items) {
            const p = fn(item).then(() => {
                executing.delete(p);
            });
            executing.add(p);
            if (executing.size >= limit) {
                await Promise.race(executing);
            }
        }
        await Promise.allSettled(executing);
    }

    async function refreshAll(): Promise<void> {
        const config = await deps.configStore.load();
        const enabled_connectors = config.plugins.filter((p: ConnectorConfiguration) => p.enabled);
        log.info(`Refreshing all ${String(enabled_connectors.length)} enabled connectors`);
        await with_concurrency(
            enabled_connectors,
            (p: ConnectorConfiguration) => refresh(p.instanceId),
            5,
        );
    }

    return { refresh, refreshAll };
}
