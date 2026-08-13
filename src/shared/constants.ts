export const DEFAULT_TIMEOUT_MS = 15_000;
export const MIN_REFRESH_INTERVAL_SECONDS = 5;
export const METADATA_MAX_LINES = 80;

/** 每 origin 最大 TCP 连接数（Agent 连接池上限）。 */
export const MAX_CONNECTIONS_PER_ORIGIN = 6;
/** keepAlive 超时（ms），连接在此时间内复用而非每次新建 TLS。 */
export const KEEPALIVE_TIMEOUT_MS = 30_000;
/** 登录成功捕获 Cookie 后自动关闭登录窗口延迟（ms）。跨进程单一来源（t360）。 */
export const SESSION_LOGIN_AUTO_CLOSE_MS = 1500;
