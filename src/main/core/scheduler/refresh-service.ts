import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { ConnectorConfiguration, AppConfiguration } from "../config/types";
import type { AppConfigStore } from "../config/config-store";
import type { RuntimeStore } from "./runtime-store";
import type { VaultBackend } from "../vault/vault-backend";
import type {
    Observation,
    ScriptObservation,
    FailedAccount,
} from "../../../shared/types/observation";
import { observations_to_ready_state } from "./observation-mapping";
import { keyFor } from "../config/secrets-store";
import { createLogger, createTraceId, withLogContext } from "../../../shared/lib/logger";
import type { ConnectorDefinition } from "../connector/manifest-loader";
import { create_connector_context } from "../connector/net-client";
import { execute_poll } from "../connector/tier1-poll-executor";
import { execute_probe } from "../connector/probe-executor";
import { run_connector } from "../connector/runtime";
import type { ObservationStore } from "../observation/observation-store";
import type { ConnectorSnapshotState, SnapshotSuccess } from "./types";

export interface RefreshServiceDeps {
    definitions: readonly ConnectorDefinition[];
    observationStore: ObservationStore;
    runtimeStore: RuntimeStore;
    configStore: AppConfigStore;
    vault: VaultBackend;
    sessionLogin?: (instanceId: string) => Promise<{ saved: boolean }>;
    resolve_proxy_url?: (config: AppConfiguration) => string | undefined;
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
        const stored = await vault.get(keyFor(connector_config.instanceId, param.name));
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
): Promise<{ observations: Observation[]; failed_accounts: FailedAccount[] }> {
    const params = await build_params(connector_config, definition, vault, trace_id);
    const endpoint_overrides = { ...connector_config.endpointOverrides };
    if (definition.manifest.provider === "grok") {
        delete endpoint_overrides["grok_billing"];
    }
    const ctx = create_connector_context(definition.manifest, vault, connector_config.instanceId, {
        endpoint_overrides,
        params,
        ...(proxy_url ? { proxy_url } : {}),
        ...(trace_id ? { trace_id } : {}),
    });

    let raw_observations: ScriptObservation[];
    let failed_accounts: FailedAccount[] = [];
    if (definition.manifest.script) {
        const script_code = await readFile(resolve_script_path(definition), "utf8");
        const result = await run_connector(definition.manifest, script_code, ctx);
        if (result.error) throw new Error(result.error);
        raw_observations = result.observations;
        failed_accounts = result.failed_accounts;
    } else if (definition.manifest.poll) {
        raw_observations = await execute_poll(definition.manifest, ctx);
    } else if (definition.manifest.observe?.probe) {
        raw_observations = await execute_probe(definition.manifest, ctx);
    } else {
        throw new Error(`Connector ${definition.manifest.id} has no executable capability`);
    }

    // Host-authority identity: the connector instance id is established by the
    // host, not by the (untrusted) connector script. Stamp it on every
    // observation so two instances of the same direct provider (e.g. two
    // Firecrawl accounts) do not collapse into one account downstream.
    const observations: Observation[] = raw_observations.map((obs) => ({
        ...obs,
        source_instance_id: connector_config.instanceId,
    }));
    return { observations, failed_accounts };
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

            let last_error = "";
            let session_relogin_done = false;
            const max_attempts = 3;
            const retry_delay_ms = 1000;

            for (let attempt = 0; attempt < max_attempts; attempt++) {
                try {
                    const { observations, failed_accounts } = await execute_connector(
                        connector_config,
                        definition,
                        deps.vault,
                        deps.resolve_proxy_url?.(config) ?? config.proxy?.url,
                        trace_id,
                    );
                    for (const obs of observations) {
                        try {
                            deps.observationStore.insert(obs);
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

                    // invariant 5 / P0-2: 脚本成功返回但内部有单账号失败时，
                    // 复制失败账号的上次成功观测为 stale 副本插入。成功账号的
                    // 观测已正常插入，不受影响。失败账号无上次观测时跳过
                    // （UI 显示"无数据"而非"stale"）。
                    const stale_observations: Observation[] = [];
                    if (failed_accounts.length > 0) {
                        const stale_observed_at = Date.now();
                        const prior = deps.observationStore.list_by_source_instance_id(instanceId);
                        for (const failed of failed_accounts) {
                            for (const obs of prior) {
                                if (obs.account_id !== failed.account_id) continue;
                                const stale_obs: Observation = {
                                    ...obs,
                                    stale: true,
                                    last_error: failed.error,
                                    observed_at: stale_observed_at,
                                };
                                deps.observationStore.insert(stale_obs);
                                stale_observations.push(stale_obs);
                            }
                        }
                        if (stale_observations.length > 0) {
                            trace_log.info(
                                `Marked ${String(stale_observations.length)} observation(s) stale for ${String(failed_accounts.length)} failed account(s) on ${instanceId}`,
                            );
                        }
                    }

                    const { items, updatedAt } = observations_to_ready_state([
                        ...observations,
                        ...stale_observations,
                    ]);
                    deps.runtimeStore.updateState(instanceId, {
                        status: "ready",
                        items,
                        updatedAt,
                    });
                    trace_log.info(
                        `Connector ${instanceId} (${connector_config.name}) refreshed: ${String(items.length)} items`,
                    );
                    return;
                } catch (error: unknown) {
                    last_error = error instanceof Error ? error.message : String(error);
                    trace_log.error(
                        `Connector ${instanceId} (${connector_config.name}) attempt ${String(attempt + 1)}/${String(max_attempts)} failed: ${last_error}`,
                    );

                    // Auto re-login for session-based connectors on first auth error
                    if (
                        !session_relogin_done &&
                        deps.sessionLogin &&
                        definition.manifest.capabilities.includes("session") &&
                        is_auth_error(last_error)
                    ) {
                        session_relogin_done = true;
                        trace_log.info(`Auto-triggering re-login for ${connector_config.name}`);
                        try {
                            const result = await deps.sessionLogin(instanceId);
                            if (result.saved) {
                                trace_log.info(
                                    `Re-login succeeded for ${connector_config.name}, waiting before retry`,
                                );
                                await new Promise((resolve) => setTimeout(resolve, 2000));
                            }
                        } catch (login_error: unknown) {
                            trace_log.error(
                                `Auto re-login failed for ${connector_config.name}: ${login_error instanceof Error ? login_error.message : String(login_error)}`,
                            );
                        }
                    }

                    if (attempt < max_attempts - 1) {
                        await new Promise((resolve) => setTimeout(resolve, retry_delay_ms));
                    }
                }
            }

            // invariant 2: 采集失败保留上次成功观测，挂 stale:true + lastError。
            // 为该 instance 下的每条最新观测插入一份 stale 副本，UI 据此显示"数据过期"。
            // 首次即失败（无上次观测）时跳过——UI 应显示"无数据"而非"stale"。
            const prior_observations = deps.observationStore.list_by_source_instance_id(instanceId);
            const stale_observed_at = Date.now();
            for (const obs of prior_observations) {
                deps.observationStore.insert({
                    ...obs,
                    stale: true,
                    last_error: last_error,
                    observed_at: stale_observed_at,
                });
            }
            trace_log.info(
                `Marked ${String(prior_observations.length)} observation(s) stale for ${instanceId}`,
            );

            deps.runtimeStore.updateState(instanceId, {
                status: "failed",
                error: last_error,
                ...(prior !== undefined && { lastSuccess: prior }),
            });
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
