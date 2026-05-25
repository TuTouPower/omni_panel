import type { PluginConfiguration } from "../../../shared/types/config";
import type { PluginMetadata } from "../../../shared/schemas/plugin-metadata";

function getLocalizedName(metadata: PluginMetadata | null): string | null {
    if (!metadata) return null;
    const meta = metadata as Record<string, unknown>;
    return (meta["name@zh-Hans"] as string | undefined) ?? metadata.name ?? null;
}

export function resolveDisplayNames(
    plugins: readonly { config: PluginConfiguration; metadata: PluginMetadata | null }[],
): Map<string, string> {
    const rawNames = plugins.map((p) => {
        const name = getLocalizedName(p.metadata) ?? p.config.name;
        return { instanceId: p.config.instanceId, rawName: name };
    });

    // Count occurrences of each raw name
    const nameCounts = new Map<string, number>();
    for (const entry of rawNames) {
        nameCounts.set(entry.rawName, (nameCounts.get(entry.rawName) ?? 0) + 1);
    }

    // Assign display names with de-duplication
    const seenCounts = new Map<string, number>();
    const result = new Map<string, string>();
    for (const entry of rawNames) {
        const total = nameCounts.get(entry.rawName) ?? 1;
        if (total === 1) {
            result.set(entry.instanceId, entry.rawName);
        } else {
            const count = (seenCounts.get(entry.rawName) ?? 0) + 1;
            seenCounts.set(entry.rawName, count);
            result.set(
                entry.instanceId,
                count === 1 ? entry.rawName : `${entry.rawName} ${String(count)}`,
            );
        }
    }

    return result;
}
