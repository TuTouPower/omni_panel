/**
 * Shared cookie-login trigger + status poll for SettingsForm and WebLoginSection.
 * Web edit-instance path uses auth.cookieLogin / cookieLoginStatus (vault-backed).
 */

export const COOKIE_LOGIN_POLL_INTERVAL_MS = 250;
export const COOKIE_LOGIN_POLL_TIMEOUT_MS = 120_000;

export const COOKIE_LOGIN_MESSAGES = {
    timeout: "网页登录超时，请重试",
    conflict: "已有登录正在进行中，请等待当前登录完成",
    no_cookie: "未捕获到 Cookie，请完成登录后再关闭窗口",
    failed: "网页登录失败，请重试",
    /** Web add-account (no instance_id): capture is response-only; refresh loses result. */
    anon_web_guide: "登录期间请勿刷新页面；若中断或超时，请手动粘贴 Cookie 后保存",
} as const;

function error_message(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    return "";
}

/**
 * Map IPC/HTTP/session-manager error text to a stable Chinese UI message.
 * Strips `[CODE]` / `METHOD path failed:` prefixes so raw English does not surface.
 */
export function format_cookie_login_error(error: unknown): string {
    const raw = error_message(error);
    if (!raw) return COOKIE_LOGIN_MESSAGES.failed;

    if (raw.includes(COOKIE_LOGIN_MESSAGES.conflict) || raw.includes("已有登录正在进行中")) {
        return COOKIE_LOGIN_MESSAGES.conflict;
    }
    if (raw.includes(COOKIE_LOGIN_MESSAGES.timeout) || raw.includes("网页登录超时")) {
        return COOKIE_LOGIN_MESSAGES.timeout;
    }
    if (raw.includes(COOKIE_LOGIN_MESSAGES.no_cookie) || raw.includes("未捕获到 Cookie")) {
        return COOKIE_LOGIN_MESSAGES.no_cookie;
    }
    // Host-side no-display message is already user-readable; keep as-is (matches auth-ipc).
    if (raw.includes("graphical display")) {
        const colon = raw.lastIndexOf(": ");
        if (colon >= 0) {
            const tail = raw.slice(colon + 2).trim();
            if (tail.includes("graphical display")) return tail;
        }
        const bracket_display = /^\[([A-Z_]+)\]\s*(.+)$/s.exec(raw);
        if (bracket_display?.[2]) return bracket_display[2].trim();
        return raw;
    }

    if (/CONFLICT|already in progress/i.test(raw)) {
        return COOKIE_LOGIN_MESSAGES.conflict;
    }
    if (/TIMEOUT|timed out|timeout/i.test(raw)) {
        return COOKIE_LOGIN_MESSAGES.timeout;
    }

    const bracket = /^\[([A-Z_]+)\]\s*(.+)$/s.exec(raw);
    if (bracket) {
        const code = bracket[1] ?? "";
        const body = (bracket[2] ?? "").trim();
        if (code === "CONFLICT") return COOKIE_LOGIN_MESSAGES.conflict;
        if (code === "TIMEOUT") return COOKIE_LOGIN_MESSAGES.timeout;
        if (body && /[\u4e00-\u9fff]/.test(body)) return body;
    }

    const failed_prefix = /failed:\s*(.+)$/s.exec(raw);
    if (failed_prefix) {
        const body = (failed_prefix[1] ?? "").trim();
        if (
            body.includes(COOKIE_LOGIN_MESSAGES.conflict) ||
            /CONFLICT|already in progress/i.test(body)
        ) {
            return COOKIE_LOGIN_MESSAGES.conflict;
        }
        if (
            body.includes(COOKIE_LOGIN_MESSAGES.timeout) ||
            /TIMEOUT|timed out/i.test(body)
        ) {
            return COOKIE_LOGIN_MESSAGES.timeout;
        }
        if (body && /[\u4e00-\u9fff]/.test(body)) return body;
    }

    if (/[\u4e00-\u9fff]/.test(raw)) return raw;
    return COOKIE_LOGIN_MESSAGES.failed;
}

/**
 * Fire-and-forget cookie login for an existing instance, then poll until vault save or error.
 * Throws Error with Chinese message on timeout / conflict / missing cookie / status error.
 */
export async function poll_cookie_login(instance_id: string): Promise<void> {
    let result;
    try {
        result = await window.usageboard.auth.cookieLogin(instance_id);
    } catch (error: unknown) {
        throw new Error(format_cookie_login_error(error));
    }

    if (result.started) {
        const deadline = Date.now() + COOKIE_LOGIN_POLL_TIMEOUT_MS;
        let status = await window.usageboard.auth.cookieLoginStatus(instance_id);
        while (status.in_progress) {
            if (Date.now() >= deadline) {
                throw new Error(COOKIE_LOGIN_MESSAGES.timeout);
            }
            await new Promise<void>((resolve) => {
                setTimeout(resolve, COOKIE_LOGIN_POLL_INTERVAL_MS);
            });
            status = await window.usageboard.auth.cookieLoginStatus(instance_id);
        }
        if (status.error) {
            throw new Error(format_cookie_login_error(new Error(status.error)));
        }
        if (!status.saved) {
            throw new Error(COOKIE_LOGIN_MESSAGES.no_cookie);
        }
        return;
    }

    if (!result.saved) {
        throw new Error(COOKIE_LOGIN_MESSAGES.no_cookie);
    }
}
