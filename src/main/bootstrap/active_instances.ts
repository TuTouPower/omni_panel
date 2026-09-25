import type { ConnectorDefinition } from "../core/connector/manifest-loader";
import type { AppConfiguration } from "../../shared/types/config";

/** t360: 取某 provider 的所有启用实例 id（enabled && manifestId 匹配该 def）。 */
export function active_instance_ids_for_provider(
    allDefinitions: ConnectorDefinition[],
    plugins: AppConfiguration["plugins"],
    provider: string,
): string[] {
    const def = allDefinitions.find((d) => d.manifest.provider === provider);
    if (!def) return [];
    return plugins
        .filter((plugin) => plugin.enabled && plugin.manifestId === def.manifest.id)
        .map((plugin) => plugin.instanceId);
}
