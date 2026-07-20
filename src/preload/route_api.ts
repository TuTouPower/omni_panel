import type { GrokReadonlyApi, GrokSettingsApi, TrendApi } from "../shared/types/ipc";

export function select_grok_api(
    route: string,
    readonly_api: GrokReadonlyApi,
    settings_api: GrokSettingsApi,
): GrokReadonlyApi | GrokSettingsApi {
    return route === "setting" ? settings_api : readonly_api;
}

/**
 * Sparkline trend 仅在主面板(usage/agent)消费;setting/tray 不放行。
 *
 * - `usage` / `agent` / 未识别 hash → 返回 full_api(走真实 IPC)
 * - `setting` / `tray` → 返回 disabled_api(noop,解析为 Promise<[]>)
 *
 * 与 select_grok_api 一样,函数化的目的是便于单测覆盖分权矩阵。
 */
export function select_trend_api<T extends TrendApi>(
    route: string,
    full_api: T,
    disabled_api: T,
): T {
    return route === "setting" || route === "tray" ? disabled_api : full_api;
}
