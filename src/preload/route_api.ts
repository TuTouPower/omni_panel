import type {
    GrokReadonlyApi,
    GrokSettingsApi,
    KimiReadonlyApi,
    KimiSettingsApi,
    SessionHistoryApi,
    TrendApi,
} from "../shared/types/ipc";

export function select_grok_api(
    route: string,
    readonly_api: GrokReadonlyApi,
    settings_api: GrokSettingsApi,
): GrokReadonlyApi | GrokSettingsApi {
    return route === "setting" ? settings_api : readonly_api;
}

/**
 * Kimi OAuth mirrors Grok's route split: settings page gets the full flow
 * (start/poll/cancel/logout/refresh), other windows only get login_status.
 */
export function select_kimi_api(
    route: string,
    readonly_api: KimiReadonlyApi,
    settings_api: KimiSettingsApi,
): KimiReadonlyApi | KimiSettingsApi {
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

/**
 * 会话历史 API 分权（t210 AC9 + t212 打开入口）。
 *
 * - `history` / `agent` → full_api（真实 IPC：打开 / 订阅 / 查询 / 最近）
 * - `usage`（托盘 popup / 用量面板）→ open_api（t212：仅打开历史窗口，
 *   订阅 / 查询等数据通道不放行，避免 popup 意外获得历史数据能力）
 * - 其余 route（setting/tray 等）→ disabled_api（noop / 空回调）
 *
 * 与 select_grok_api / select_trend_api 一样函数化，便于单测覆盖分权矩阵。
 */
export function select_session_history_api<T extends SessionHistoryApi>(
    route: string,
    full_api: T,
    open_api: T,
    disabled_api: T,
): T {
    if (route === "history" || route === "agent") return full_api;
    if (route === "usage") return open_api;
    return disabled_api;
}
