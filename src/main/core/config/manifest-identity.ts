import type { ConnectorDefinition } from "../connector/manifest-loader";
import type { ConnectorConfiguration } from "../../../shared/types/config";

export type ManifestMigrationReason = "unknown-manifest" | "no-tail-match";

export interface ManifestMigrationDrop {
    readonly instanceId: string;
    readonly manifestId?: string;
    readonly executablePath?: string;
    readonly reason: ManifestMigrationReason;
}

export interface ManifestMigrationResult {
    readonly plugins: Record<string, unknown>[];
    readonly changed: boolean;
    readonly dropped: readonly ManifestMigrationDrop[];
}

/**
 * Extract a connector directory name without relying on the host OS path
 * separator. Persisted configs can move between Windows, macOS and Linux, and
 * may contain mixed separators or a trailing separator.
 */
export function extract_manifest_id_from_path(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    const without_trailing_separators = trimmed.replace(/[\\/]+$/, "");
    if (!without_trailing_separators || /^[A-Za-z]:$/.test(without_trailing_separators)) {
        return null;
    }
    const match = /([^\\/]+)$/.exec(without_trailing_separators);
    return match?.[1] ?? null;
}

function non_empty_string(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

function same_string(a: unknown, b: unknown): boolean {
    return a === b;
}

/**
 * Resolve the current local executable path for already-validated manifest
 * identities. Importers call this after schema and manifest validation so a
 * path from another machine is never persisted as the local path cache.
 */
export function remap_connector_paths(
    plugins: readonly ConnectorConfiguration[],
    definitions: readonly ConnectorDefinition[],
): ConnectorConfiguration[] {
    const definitions_by_id = new Map(
        definitions.map((definition) => [definition.manifest.id, definition]),
    );
    return plugins.map((plugin) => {
        const definition = definitions_by_id.get(plugin.manifestId);
        return definition && plugin.executablePath !== definition.executablePath
            ? { ...plugin, executablePath: definition.executablePath }
            : plugin;
    });
}

/**
 * Add the platform-independent manifest identity to legacy connector entries.
 * When definitions are supplied, the executable path is always refreshed from
 * the local definition. Without definitions (unit/test callers), a valid
 * manifest id or path tail is retained and health pruning remains the caller's
 * responsibility.
 */
export function migrate_connector_plugins(
    raw_plugins: unknown,
    definitions?: readonly ConnectorDefinition[],
): ManifestMigrationResult {
    if (!Array.isArray(raw_plugins)) {
        return { plugins: [], changed: false, dropped: [] };
    }

    const definitions_by_id = new Map(
        (definitions ?? []).map((definition) => [definition.manifest.id, definition]),
    );
    const dropped: ManifestMigrationDrop[] = [];
    const plugins: Record<string, unknown>[] = [];
    let changed = false;

    for (const raw_plugin of raw_plugins) {
        if (raw_plugin === null || typeof raw_plugin !== "object" || Array.isArray(raw_plugin)) {
            changed = true;
            dropped.push({
                instanceId: "unknown",
                reason: "no-tail-match",
            });
            continue;
        }

        const plugin = { ...(raw_plugin as Record<string, unknown>) };
        const existing_manifest_id = non_empty_string(plugin["manifestId"]);
        const path_tail = extract_manifest_id_from_path(plugin["executablePath"]);
        const existing_definition = existing_manifest_id
            ? definitions_by_id.get(existing_manifest_id)
            : undefined;
        const tail_definition = path_tail ? definitions_by_id.get(path_tail) : undefined;
        const definition =
            definitions === undefined ? undefined : (existing_definition ?? tail_definition);
        const candidate_id =
            definition?.manifest.id ??
            (definitions === undefined ? (existing_manifest_id ?? path_tail) : undefined);

        if (definitions !== undefined && candidate_id === undefined) {
            changed = true;
            dropped.push({
                instanceId: non_empty_string(plugin["instanceId"]) ?? "unknown",
                ...(existing_manifest_id !== undefined && { manifestId: existing_manifest_id }),
                ...(typeof plugin["executablePath"] === "string" && {
                    executablePath: plugin["executablePath"],
                }),
                reason: existing_manifest_id ? "unknown-manifest" : "no-tail-match",
            });
            continue;
        }

        if (!candidate_id) {
            changed = true;
            dropped.push({
                instanceId: non_empty_string(plugin["instanceId"]) ?? "unknown",
                reason: "no-tail-match",
            });
            continue;
        }

        if (!same_string(plugin["manifestId"], candidate_id)) {
            plugin["manifestId"] = candidate_id;
            changed = true;
        }
        if (definition && !same_string(plugin["executablePath"], definition.executablePath)) {
            plugin["executablePath"] = definition.executablePath;
            changed = true;
        }
        plugins.push(plugin);
    }

    if (plugins.length !== raw_plugins.length) changed = true;
    return { plugins, changed, dropped };
}
