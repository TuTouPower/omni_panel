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
 * 会话历史 API 仅在 history 与 agent route 暴露（AC9）。
 *
 * - `history` / `agent` → 返回 full_api（真实 IPC）
 * - 其他 route（usage/setting/tray 等）→ 返回 disabled_api（noop / 空回调）
 *
 * 与 select_grok_api / select_trend_api 一样函数化，便于单测覆盖分权矩阵。
 */
export function select_session_history_api<T extends SessionHistoryApi>(
    route: string,
    full_api: T,
    disabled_api: T,
): T {
    return route === "history" || route === "agent" ? full_api : disabled_api;
}
