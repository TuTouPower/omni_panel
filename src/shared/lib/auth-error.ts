/**
 * 凭证失效类错误唯一判定口径（t172）。
 *
 * renderer 与 refresh-service 共用一份，避免两套规则漂移。规则合并了调度层
 * 的 401/403/invalid_* 与渲染层的中文凭证词，并保留 A11 防误报语义：
 * 不用裸 `token`/`auth` 子串（"Unexpected token"、"oauth preflight skipped"
 * 不得误判为认证错误）。
 */
export function is_auth_error(message: string): boolean {
    const lower = message.toLowerCase();
    return (
        lower.includes("401") ||
        lower.includes("403") ||
        lower.includes("unauthorized") ||
        lower.includes("forbidden") ||
        lower.includes("invalid_token") ||
        lower.includes("invalid_grant") ||
        /\binvalid\b.*\b(?:key|token)\b/.test(lower) ||
        lower.includes("ip banned") ||
        lower.includes("credential") ||
        lower.includes("凭证") ||
        lower.includes("登录") ||
        lower.includes("密钥") ||
        /(?:cookie|会话|session).*(?:失效|过期|invalid|expired)/i.test(lower) ||
        /(?:失效|过期|invalid|expired).*(?:cookie|会话|session)/i.test(lower) ||
        lower.includes("未跳转到 workspace")
    );
}

/** 凭证失效类错误的统一用户文案（t492 AC-006）。 */
export const AUTH_ERROR_DISPLAY_TEXT = "凭证失效，请重新登录";

/**
 * 用户可见错误文案：凭证失效类不暴露内部细节（HTTP 状态码、字节数等），
 * 其余错误原样透出，便于用户与支持判断问题。
 */
export function auth_error_display_text(message: string): string {
    return is_auth_error(message) ? AUTH_ERROR_DISPLAY_TEXT : message;
}
