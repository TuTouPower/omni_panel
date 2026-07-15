export function resolve_effective_proxy_url(
    configured_proxy_url: string | undefined,
    detected_proxy_url: string | undefined,
): string | undefined {
    return configured_proxy_url ?? detected_proxy_url;
}
