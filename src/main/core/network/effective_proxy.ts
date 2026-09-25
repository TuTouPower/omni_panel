import type { ProxyConfiguration } from "../../../shared/types/config";
import { createLogger } from "../../../shared/lib/logger";

const log = createLogger("effective-proxy");

export function is_valid_proxy_url(url_str: string): boolean {
    try {
        const u = new URL(url_str);
        return u.protocol === "http:" || u.protocol === "https:" || u.protocol === "socks5:";
    } catch {
        return false;
    }
}

/**
 * 解析 PAC 格式的代理结果（如 session.resolveProxy 输出）。
 * 支持 PROXY / HTTP / HTTPS 及 SOCKS / SOCKS5 协议。
 */
export function parse_pac_proxy_result(proxy_info: string): string | undefined {
    if (!proxy_info || (/DIRECT/i.test(proxy_info) && !/PROXY|SOCKS/i.test(proxy_info))) {
        return undefined;
    }
    const socks_match = /(?:SOCKS5|SOCKS)\s+([^\s;]+)/i.exec(proxy_info);
    if (socks_match?.[1]) {
        return `socks5://${socks_match[1]}`;
    }
    const http_match = /(?:PROXY|HTTP|HTTPS)\s+([^\s;]+)/i.exec(proxy_info);
    if (http_match?.[1]) {
        return `http://${http_match[1]}`;
    }
    return undefined;
}

export function resolve_effective_proxy_url(
    configured_proxy_url: string | undefined,
    detected_proxy_url: string | undefined,
    use_system_proxy = true,
): string | undefined {
    if (configured_proxy_url) {
        if (is_valid_proxy_url(configured_proxy_url)) {
            return configured_proxy_url;
        }
        log.warn(`Invalid configured proxy URL rejected: ${configured_proxy_url}`);
        return undefined;
    }
    if (use_system_proxy && detected_proxy_url) {
        if (is_valid_proxy_url(detected_proxy_url)) {
            return detected_proxy_url;
        }
        log.warn(`Invalid system detected proxy URL rejected: ${detected_proxy_url}`);
        return undefined;
    }
    return undefined;
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
