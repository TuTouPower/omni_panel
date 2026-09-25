/**
 * Cookie 安全校验工具函数。
 * 防御 CRLF 头部注入与极端超大 Cookie 攻击。
 */
export const MAX_COOKIE_LENGTH = 8192;

export function is_safe_cookie_string(cookie: unknown): cookie is string {
    if (typeof cookie !== "string") return false;
    if (cookie.length === 0 || cookie.length > MAX_COOKIE_LENGTH) return false;
    if (/[\r\n]/.test(cookie)) return false;
    return true;
}
