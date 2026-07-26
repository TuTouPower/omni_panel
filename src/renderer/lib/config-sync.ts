import type { AppConfiguration } from "../../shared/types/config";

/**
 * Structural signature of the configured plugin list: any change to
 * `config.plugins` (add/remove/toggle/rename/params) changes it, while
 * UI-level config saves (provider order, collapse state, floating bounds)
 * leave it unchanged. Consumers reload the plugin list only when the
 * signature changes; `use_plugins.reload` additionally keeps the previous
 * array reference when the fetched list is value-equal, so a redundant
 * reload costs one IPC and no re-render (t153).
 *
 * Deliberately serializes the whole entry instead of enumerating fields:
 * `connector:list` output depends on more than instanceId/enabled (display
 * name, CPA monitor params, …), and a missed field means a stale panel.
 */
export function plugins_structure_signature(
    plugins: AppConfiguration["plugins"] | undefined,
): string {
    if (!plugins || plugins.length === 0) return "";
    return JSON.stringify(plugins);
}
