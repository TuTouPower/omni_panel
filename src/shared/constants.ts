export const DEFAULT_TIMEOUT_MS = 15_000;
export const MIN_REFRESH_INTERVAL_SECONDS = 5;
export const METADATA_MAX_LINES = 80;

/** 每 origin 最大 TCP 连接数（Agent 连接池上限）。 */
export const MAX_CONNECTIONS_PER_ORIGIN = 6;
/** keepAlive 超时（ms），连接在此时间内复用而非每次新建 TLS。 */
export const KEEPALIVE_TIMEOUT_MS = 30_000;
/** 登录成功捕获 Cookie 后自动关闭登录窗口延迟（ms）。跨进程单一来源（t360）。 */
export const SESSION_LOGIN_AUTO_CLOSE_MS = 1500;

/**
 * 登录窗口需保持打开、不自动关闭的 provider（t464）：页面存活期间才会把续期材料
 * （Bearer / refresh token）写入会话，过早关窗会捕获旧凭据。
 */
export const LOGIN_WINDOW_KEEP_OPEN_PROVIDERS: ReadonlySet<string> = new Set(["kimi_web"]);

/** 登录成功后自动关窗延迟；undefined 表示不自动关闭，由用户手动关窗。 */
export function login_auto_close_ms(provider: string): number | undefined {
    return LOGIN_WINDOW_KEEP_OPEN_PROVIDERS.has(provider) ? undefined : SESSION_LOGIN_AUTO_CLOSE_MS;
}
