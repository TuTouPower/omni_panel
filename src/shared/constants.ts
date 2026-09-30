export const DEFAULT_EXECUTION_BUDGET_MS = 15_000;
export const MAX_HOST_CONCURRENCY = 6;
// A145: 调度器最小刷新间隔提至 30s，避免频繁请求风暴
export const MIN_REFRESH_INTERVAL_SECONDS = 30;
export const METADATA_MAX_LINES = 80;

// A132: 集中管理的刷新调度常量
export const REFRESH_LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5分钟
export const REFRESH_DEFAULT_MAX_ATTEMPTS = 3;
export const REFRESH_RETRY_BASE_DELAY_MS = 1000;
export const REFRESH_RELOGIN_WAIT_MS = 2000;
export const SCHEDULER_MAX_BACKOFF_SECONDS = 600; // 10分钟上限

/** 每 origin 最大 TCP 连接数（Agent 连接池上限）。 */
export const MAX_CONNECTIONS_PER_ORIGIN = 6;
/** keepAlive 超时（ms），连接在此时间内复用而非每次新建 TLS。 */
export const KEEPALIVE_TIMEOUT_MS = 30_000;
/** 登录成功捕获 Cookie 后自动关闭登录窗口延迟（ms）。跨进程单一来源（t360）。 */
export const SESSION_LOGIN_AUTO_CLOSE_MS = 1500;

/**
 * 会话凭据不体现在裸 cookie 上的 provider：凭据/数据在页面 localStorage 或完整
 * 页面 DOM 里（kimi_web 的 refresh token、花云的用量页面）。这是下面几条策略的
 * 同一根因，新增此类 provider 只需登记这一处。
 */
export const PAGE_BOUND_CREDENTIAL_PROVIDERS: ReadonlySet<string> = new Set([
    "kimi_web",
    "flowercloud",
]);

/**
 * 登录窗口需保持打开、不自动关闭的 provider（t464）：页面存活期间才会把续期材料
 * （Bearer / refresh token）写入会话，过早关窗会捕获旧凭据。
 */
export const LOGIN_WINDOW_KEEP_OPEN_PROVIDERS: ReadonlySet<string> = new Set(
    // 独立拷贝：ReadonlySet 只拦编译期写入，运行时共用同一 Set 会被任一处 add 互相污染（A9 同类）。
    PAGE_BOUND_CREDENTIAL_PROVIDERS,
);

/**
 * 数据只存在于登录后页面 DOM 中的 provider：cookie 不足以取数，宿主必须在连接器
 * 执行前重抓页面。新增此类 provider 时，只需在此登记并实现对应 connector 的
 * DOM 解析；会话/刷新链路上的分支都查这张表。
 */
export const DOM_SNAPSHOT_PROVIDERS: ReadonlySet<string> = new Set(["flowercloud"]);

/**
 * 花云 DOM 快照的新鲜期。宿主侧与 connectors/flowercloud/connector.ts 的
 * SNAPSHOT_FRESH_MS 必须保持一致（connector 是独立脚本，不能 import 本文件）。
 */
export const FLOWERCLOUD_SNAPSHOT_FRESH_MS = 5 * 60 * 1000;

/** 登录成功后自动关窗延迟；undefined 表示不自动关闭，由用户手动关窗。 */
export function login_auto_close_ms(provider: string): number | undefined {
    return LOGIN_WINDOW_KEEP_OPEN_PROVIDERS.has(provider) ? undefined : SESSION_LOGIN_AUTO_CLOSE_MS;
}
