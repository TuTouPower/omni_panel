import { randomUUID } from "node:crypto";
import type { ConnectorConfiguration } from "../../../shared/types/config";
import type { ConnectorDefinition } from "../connector/manifest-loader";

// Sentinel: refreshIntervalSeconds <= 0 means "follow global refresh interval".
// Kept as a plain number (not nullable) to avoid serialization/compat issues
// with persisted config.json.
export const FOLLOW_GLOBAL_REFRESH_SENTINEL = 0;
export const DEFAULT_FALLBACK_REFRESH_SECONDS = 300;

interface AutoSeedResult {
    seeded: ConnectorConfiguration[];
    updatedExisting: ConnectorConfiguration[];
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
    const existing_by_id = new Map<string, ConnectorConfiguration[]>();
    for (const connector of existing) {
        // manifestId is the only identity key. Paths and display names are
        // platform-local/user-editable and must never resurrect or merge an
        // instance after a move.
        const matches = existing_by_id.get(connector.manifestId) ?? [];
        matches.push(connector);
        existing_by_id.set(connector.manifestId, matches);
    }

    const seeded: ConnectorConfiguration[] = [];
    const updatedExisting: ConnectorConfiguration[] = [];
    let changed = false;
    for (const def of definitions) {
        // t038：tombstone 内的 manifest id 不复活。删除内置连接器后记 id 到
        // config.removedConnectorIds，重启 auto-seed 跳过，避免账号"复活"。
        if (removed_ids?.has(def.manifest.id)) continue;
        const existing_matches = existing_by_id.get(def.manifest.id);
        if (existing_matches && existing_matches.length > 0) {
            for (const existing_match of existing_matches) {
                if (existing_match.executablePath === def.executablePath) continue;
                updatedExisting.push({
                    ...existing_match,
                    manifestId: def.manifest.id,
                    executablePath: def.executablePath,
                });
                changed = true;
            }
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

    return { seeded, updatedExisting, changed };
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
