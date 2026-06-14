import type { ConnectorConfiguration, AppConfiguration } from "../../../shared/types/config";

export interface ResolvedRuntimeEnv {
    readonly endpoints?: string | undefined; // JSON serialized OMNI_PLUGIN_ENDPOINTS
    readonly proxy?: string | undefined; // JSON serialized OMNI_PLUGIN_PROXY
}

/**
 * Merge plugin's endpointOverrides on top of metadata defaults,
 * then serialize as JSON strings for subprocess env injection.
 */
export function resolveRuntimeEnv(
    metadataEndpoints: Record<string, string | null> | undefined,
    pluginConfig: ConnectorConfiguration,
    appConfig: AppConfiguration,
): ResolvedRuntimeEnv {
    const merged: Record<string, string> = {};

    // Layer 1: metadata defaults (only non-null strings)
    const defaults = metadataEndpoints ?? {};
    for (const [k, v] of Object.entries(defaults)) {
        if (typeof v === "string" && v.length > 0) merged[k] = v;
    }

    // Layer 2: user overrides
    for (const [k, v] of Object.entries(pluginConfig.endpointOverrides)) {
        if (v.trim()) merged[k] = v.trim();
    }

    const endpoints = Object.keys(merged).length > 0 ? JSON.stringify(merged) : undefined;
    const proxy = appConfig.proxy?.url ? JSON.stringify(appConfig.proxy) : undefined;
    return { endpoints, proxy };
}
