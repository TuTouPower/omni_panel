import { randomUUID } from "node:crypto";
import type { AppConfiguration, ConnectorConfiguration } from "../../../shared/types/config";
import type { ConnectorDefinition } from "../connector/manifest-loader";

// Sentinel: refreshIntervalSeconds <= 0 means "follow global refresh interval".
// Kept as a plain number (not nullable) to avoid serialization/compat issues
// with persisted config.json.
export const FOLLOW_GLOBAL_REFRESH_SENTINEL = 0;
export const DEFAULT_FALLBACK_REFRESH_SECONDS = 300;

interface AutoSeedResult {
    seeded: ConnectorConfiguration[];
    updatedExisting: ConnectorConfiguration[];
    cleanedInstanceIds?: string[];
    changed: boolean;
}

export interface AutoSeedOptions {
    readonly schema_version?: number | undefined;
    readonly known_secret_instance_ids?: ReadonlySet<string> | undefined;
}

/**
 * Merge discovered connector definitions into existing config. New connectors
 * are seeded with `refreshIntervalSeconds: 0` (follow-global sentinel) so the
 * global interval setting actually controls them. Existing entries keep their
 * configured interval; only their local executablePath cache is updated if it
 * moved.
 */
export function auto_seed_connectors(
    existing: readonly ConnectorConfiguration[],
    definitions: readonly ConnectorDefinition[],
    removed_ids?: ReadonlySet<string>,
    options?: AutoSeedOptions,
): AutoSeedResult {
    const definitions_by_id = new Map(definitions.map((def) => [def.manifest.id, def]));
    const cleanedInstanceIds: string[] = [];
    const valid_existing: ConnectorConfiguration[] = [];

    // t510 / A79: 清理存量未配置的交互式登录空实例（仅针对 schemaVersion < 2 历史遗留版本一次性迁移）
    const should_clean_empty = (options?.schema_version ?? 1) < 2;
    if (should_clean_empty) {
        for (const connector of existing) {
            const def = definitions_by_id.get(connector.manifestId);
            if (!def) {
                valid_existing.push(connector);
                continue;
            }
            const auth_method = def.manifest.auth?.method;
            const is_interactive =
                auth_method === "oauth_pkce" ||
                auth_method === "oauth_device" ||
                auth_method === "web_login" ||
                auth_method === "cpa_mgmt";

            if (!is_interactive) {
                valid_existing.push(connector);
                continue;
            }

            // 1. 用户自定义了备注 displayName，绝非自动生成的空壳
            if (connector.displayName && connector.displayName.trim() !== "") {
                valid_existing.push(connector);
                continue;
            }

            // 2. 实例在 Vault 中有凭据，绝非空壳
            if (options?.known_secret_instance_ids?.has(connector.instanceId)) {
                valid_existing.push(connector);
                continue;
            }

            // 3. 用户修改了 endpointOverrides，绝非空壳
            if (Object.keys(connector.endpointOverrides).length > 0) {
                valid_existing.push(connector);
                continue;
            }

            // 4. 用户修改了 name，绝非空壳
            if (connector.name !== def.manifest.id.toUpperCase()) {
                valid_existing.push(connector);
                continue;
            }

            // 5. 若存在非密钥参数，且已被用户配置非默认值，保留
            const non_secret_params = def.manifest.parameters.filter((p) => p.type !== "secret");
            const has_configured_params = non_secret_params.some(
                (p) => (connector.parameterValues[p.name] ?? "") !== (p.default ?? ""),
            );
            if (has_configured_params) {
                valid_existing.push(connector);
                continue;
            }

            // 6. 若所有非密钥参数值非空（且无默认值），保留
            const has_any_param_value = Object.values(connector.parameterValues).some(
                (v) => v !== "",
            );
            if (has_any_param_value) {
                valid_existing.push(connector);
                continue;
            }

            cleanedInstanceIds.push(connector.instanceId);
        }
    } else {
        valid_existing.push(...existing);
    }

    const existing_by_id = new Map<string, ConnectorConfiguration[]>();
    for (const connector of valid_existing) {
        const matches = existing_by_id.get(connector.manifestId) ?? [];
        matches.push(connector);
        existing_by_id.set(connector.manifestId, matches);
    }

    const seeded: ConnectorConfiguration[] = [];
    const updatedExisting: ConnectorConfiguration[] = [];
    let changed = cleanedInstanceIds.length > 0;
    for (const def of definitions) {
        if (removed_ids?.has(def.manifest.id)) continue;
        const existing_matches = existing_by_id.get(def.manifest.id);
        if (existing_matches && existing_matches.length > 0) {
            for (const existing_match of existing_matches) {
                // A63: Win / macOS 下可执行路径比较忽略大小写差异
                const is_same_path =
                    process.platform === "win32" || process.platform === "darwin"
                        ? existing_match.executablePath.toLowerCase() ===
                          def.executablePath.toLowerCase()
                        : existing_match.executablePath === def.executablePath;
                if (is_same_path) continue;
                updatedExisting.push({
                    ...existing_match,
                    manifestId: def.manifest.id,
                    executablePath: def.executablePath,
                });
                changed = true;
            }
            continue;
        }
        // 交互式登录类连接器（网页授权/设备码/网页登录）无预置密钥，不自动生成未配置空实例，避免报错与重复账号
        const auth_method = def.manifest.auth?.method;
        if (
            auth_method === "oauth_pkce" ||
            auth_method === "oauth_device" ||
            auth_method === "web_login" ||
            auth_method === "cpa_mgmt"
        ) {
            continue;
        }

        seeded.push({
            instanceId: randomUUID(),
            stateId: randomUUID(),
            manifestId: def.manifest.id,
            name: def.manifest.id.toUpperCase(),
            enabled: true,
            executablePath: def.executablePath,
            refreshIntervalSeconds: FOLLOW_GLOBAL_REFRESH_SENTINEL,
            ...(def.manifest.manualDefault === true && { manualRefreshOnly: true }),
            parameterValues: Object.fromEntries(
                def.manifest.parameters
                    .filter((param) => param.type !== "secret" && param.default !== undefined)
                    .map((param) => [param.name, param.default ?? ""]),
            ),
            endpointOverrides: {},
        });
    }

    return { seeded, updatedExisting, cleanedInstanceIds, changed };
}

/**
 * Resolve the effective per-connector refresh interval.
 *
 * Connectors with `refreshIntervalSeconds <= 0` (follow-global sentinel) fall
 * back to `globalRefreshIntervalSeconds`. If the global value is also missing
 * or <= 0, `DEFAULT_FALLBACK_REFRESH_SECONDS` (300) is used. This is the only
 * place the scheduler consumes the global interval — keeping the resolution
 * logic in one function makes the follow-global semantics explicit.
 */
export function resolve_refresh_interval(
    connector_interval_seconds: number,
    global_refresh_interval_seconds: number | undefined,
): number {
    if (connector_interval_seconds > 0) return connector_interval_seconds;
    if (global_refresh_interval_seconds && global_refresh_interval_seconds > 0) {
        return global_refresh_interval_seconds;
    }
    return DEFAULT_FALLBACK_REFRESH_SECONDS;
}

export interface ApplyAutoSeedOptions {
    readonly known_secret_instance_ids?: ReadonlySet<string> | undefined;
}

/**
 * 执行 auto_seed 与存量空实例清理迁移，并在发生数据结构变动时安全递增 schemaVersion。
 */
export function apply_auto_seed_and_migrate(
    latest_config: AppConfiguration,
    definitions: readonly ConnectorDefinition[],
    options?: ApplyAutoSeedOptions,
): {
    updatedConfig: AppConfiguration;
    seededPlugins: ConnectorConfiguration[];
    changed: boolean;
} {
    const schema_version = latest_config.schemaVersion;
    const { seeded, updatedExisting, cleanedInstanceIds } = auto_seed_connectors(
        latest_config.plugins,
        definitions,
        new Set(latest_config.removedConnectorIds ?? []),
        {
            schema_version,
            known_secret_instance_ids: options?.known_secret_instance_ids,
        },
    );
    const has_cleaned = Boolean(cleanedInstanceIds && cleanedInstanceIds.length > 0);
    if (seeded.length === 0 && updatedExisting.length === 0 && !has_cleaned) {
        return { updatedConfig: latest_config, seededPlugins: [], changed: false };
    }
    const cleaned_set = new Set(cleanedInstanceIds ?? []);
    const updatedById = new Map(updatedExisting.map((p) => [p.instanceId, p]));
    const filtered = latest_config.plugins.filter((p) => !cleaned_set.has(p.instanceId));
    const merged = filtered.map((p) => updatedById.get(p.instanceId) ?? p);
    const next_schema_version = Math.max(schema_version, 2);
    return {
        updatedConfig: {
            ...latest_config,
            schemaVersion: next_schema_version,
            plugins: [...merged, ...seeded],
        },
        seededPlugins: seeded,
        changed: true,
    };
}
