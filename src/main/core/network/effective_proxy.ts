import type { ProxyConfiguration } from "../../../shared/types/config";

export function resolve_effective_proxy_url(
    configured_proxy_url: string | undefined,
    detected_proxy_url: string | undefined,
): string | undefined {
    return configured_proxy_url ?? detected_proxy_url;
}

/**
 * Whether the user-configured proxy block changed between two config snapshots
 * (t195 AC5). onConfigSaved uses this to trigger system-proxy re-detection only
 * when the proxy config actually changed, instead of on every save.
 */
export function proxy_config_changed(
    prev: ProxyConfiguration | undefined,
    next: ProxyConfiguration | undefined,
): boolean {
    return JSON.stringify(prev ?? null) !== JSON.stringify(next ?? null);
}
