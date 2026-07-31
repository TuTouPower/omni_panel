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
        lower.includes("密钥")
    );
}
