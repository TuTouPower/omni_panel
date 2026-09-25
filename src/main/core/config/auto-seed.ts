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
): AutoSeedResult {
    const definitions_by_id = new Map(definitions.map((def) => [def.manifest.id, def]));
    const cleanedInstanceIds: string[] = [];
    const valid_existing: ConnectorConfiguration[] = [];

    // t510 / A79: 清理存量未配置的交互式登录空实例（早期误自动生成的空壳）
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
            auth_method === "web_login";
        const is_default_empty =
            is_interactive &&
            connector.name === def.manifest.id.toUpperCase() &&
            Object.values(connector.parameterValues).every((v) => v === "") &&
            Object.keys(connector.endpointOverrides).length === 0;

        if (is_default_empty) {
            cleanedInstanceIds.push(connector.instanceId);
            continue;
        }
        valid_existing.push(connector);
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
            auth_method === "web_login"
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

/**
 * 执行 auto_seed 与存量空实例清理迁移，并在发生数据结构变动时安全递增 schemaVersion。
 */
export function apply_auto_seed_and_migrate(
    latest_config: AppConfiguration,
    definitions: readonly ConnectorDefinition[],
): {
    updatedConfig: AppConfiguration;
    seededPlugins: ConnectorConfiguration[];
    changed: boolean;
} {
    const { seeded, updatedExisting, cleanedInstanceIds } = auto_seed_connectors(
        latest_config.plugins,
        definitions,
        new Set(latest_config.removedConnectorIds ?? []),
    );
    const has_cleaned = Boolean(cleanedInstanceIds && cleanedInstanceIds.length > 0);
    if (seeded.length === 0 && updatedExisting.length === 0 && !has_cleaned) {
        return { updatedConfig: latest_config, seededPlugins: [], changed: false };
    }
    const cleaned_set = new Set(cleanedInstanceIds ?? []);
    const updatedById = new Map(updatedExisting.map((p) => [p.instanceId, p]));
    const filtered = latest_config.plugins.filter((p) => !cleaned_set.has(p.instanceId));
    const merged = filtered.map((p) => updatedById.get(p.instanceId) ?? p);
    const next_schema_version = Math.max(latest_config.schemaVersion, 2);
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
