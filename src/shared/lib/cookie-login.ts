/** Shared cookie-login lifecycle and user-facing error copy. */

export type CookieLoginLifecycle = "running" | "succeeded" | "canceled" | "failed" | "timeout";

export type CookieLoginErrorCode =
    | "CONFLICT"
    | "TIMEOUT"
    | "NO_COOKIE"
    | "INVALID_COOKIE"
    | "INTERNAL_ERROR"
    | "VALIDATION_ERROR";

export const COOKIE_LOGIN_MESSAGES = {
    timeout: "网页登录超时，请重试",
    conflict: "已有登录正在进行中，请等待当前登录完成",
    no_cookie: "未捕获到 Cookie，请完成登录后再关闭窗口",
    invalid_cookie: "登录态无效，请重新登录或手动粘贴 Cookie",
    failed: "网页登录失败，请重试",
} as const;
