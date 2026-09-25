import type {
    GrokReadonlyApi,
    GrokSettingsApi,
    KimiReadonlyApi,
    KimiSettingsApi,
    GrokBotReadonlyApi,
    GrokBotSettingsApi,
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
 * Grok Bot OAuth 分权 (A144 / 原 D7)：仅设置窗口具有高阶操作权限，低权窗口使用 disabled 存根。
 */
export function select_grok_bot_api(
    route: string,
    readonly_api: GrokBotReadonlyApi,
    settings_api: GrokBotSettingsApi,
): GrokBotReadonlyApi | GrokBotSettingsApi {
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
 * - `session` / `agent` → full_api（真实 IPC：打开 / 订阅 / 查询 / 最近）
 * - `usage`（托盘 popup / 用量面板）/ `tray`（托盘菜单，t?：会话面板入口）
 *   → open_api（t212：仅打开会话窗口，订阅 / 查询等数据通道不放行，
 *     避免 popup 意外获得历史数据能力）
 * - 其余 route（setting 等）→ disabled_api（noop / 空回调）
 *
 * 与 select_grok_api / select_trend_api 一样函数化，便于单测覆盖分权矩阵。
 */
export function select_session_history_api<T extends SessionHistoryApi>(
    route: string,
    full_api: T,
    open_api: T,
    disabled_api: T,
): T {
    if (route === "session" || route === "agent") return full_api;
    if (route === "usage" || route === "tray") return open_api;
    return disabled_api;
}

/**
 * Config API 分权工厂 (A95 & A140)。
 * - setting: 完整管理能力 (full)
 * - popup (usage): 受白名单保护的持久化能力 (popup)
 * - tray / session: 纯只读存根 (readonly)
 */
export function select_config_api<T>(route: string, full_api: T, popup_api: T, readonly_api: T): T {
    if (route === "setting") return full_api;
    if (route === "tray" || route === "session") return readonly_api;
    return popup_api;
}

/**
 * Session 登录 API 分权 (A144)。
 * - setting: 具备交互式登录与静默重登能力
 * - 其他窗口: 禁用
 */
export function select_session_api<T>(route: string, settings_api: T, disabled_api: T): T {
    return route === "setting" ? settings_api : disabled_api;
}
