import { describe, expect, it } from "vitest";
import {
    AUTH_ERROR_DISPLAY_TEXT,
    auth_error_display_text,
    is_auth_error,
} from "../../../src/shared/lib/auth-error";

describe("is_auth_error (shared)", () => {
    it("matches HTTP 401/403 real net-client messages", () => {
        expect(is_auth_error("HTTP 401: request failed (37 bytes)")).toBe(true);
        expect(is_auth_error("HTTP 403: request failed (12 bytes)")).toBe(true);
    });

    it("matches OAuth / token-invalid wording", () => {
        expect(is_auth_error("invalid_token")).toBe(true);
        expect(is_auth_error("invalid_grant: bad token")).toBe(true);
        expect(is_auth_error("invalid api key")).toBe(true);
        expect(is_auth_error("unauthorized access")).toBe(true);
        expect(is_auth_error("forbidden: access denied")).toBe(true);
        expect(is_auth_error("IP banned due to too many failed attempts")).toBe(true);
        expect(is_auth_error("missing credentials")).toBe(true);
    });

    it("matches Chinese credential wording used by renderer", () => {
        expect(is_auth_error("登录凭证已失效")).toBe(true);
        expect(is_auth_error("密钥错误")).toBe(true);
    });

    it("does not match connection timeouts or plain network errors", () => {
        expect(is_auth_error("request failed: ETIMEDOUT")).toBe(false);
        expect(is_auth_error("socket hang up")).toBe(false);
        expect(
            is_auth_error(
                "Client network socket disconnected before secure TLS connection was established",
            ),
        ).toBe(false);
        expect(is_auth_error("request failed: ECONNRESET")).toBe(false);
    });

    it("does not match 5xx or generic failures", () => {
        expect(is_auth_error("HTTP 500: request failed (12 bytes)")).toBe(false);
        expect(is_auth_error("boom")).toBe(false);
        expect(is_auth_error("billing no usage fields")).toBe(false);
    });

    it("does not false-positive on 'token'/'auth' substrings in non-auth text", () => {
        expect(is_auth_error("SyntaxError: Unexpected token < in JSON")).toBe(false);
        expect(is_auth_error("token pool exhausted")).toBe(false);
        expect(is_auth_error("batch auth rate limited")).toBe(false);
        expect(is_auth_error("oauth preflight skipped")).toBe(false);
    });
});

// t492 AC-006：用户可见文案不得暴露 HTTP 状态码等内部细节。
describe("auth_error_display_text (shared)", () => {
    it("maps credential failures to the shared user-facing text", () => {
        expect(auth_error_display_text("HTTP 401: request failed (371 bytes)")).toBe(
            AUTH_ERROR_DISPLAY_TEXT,
        );
        expect(auth_error_display_text("HTTP 401: request failed (371 bytes)")).not.toMatch(
            /HTTP \d{3}/,
        );
        expect(auth_error_display_text("unauthorized")).toBe(AUTH_ERROR_DISPLAY_TEXT);
        expect(auth_error_display_text("Kimi 网页会话已失效，请重新打开网页登录窗口")).toBe(
            AUTH_ERROR_DISPLAY_TEXT,
        );
    });

    it("passes non-auth failures through unchanged", () => {
        expect(auth_error_display_text("socket hang up")).toBe("socket hang up");
        expect(auth_error_display_text("HTTP 500: request failed (12 bytes)")).toBe(
            "HTTP 500: request failed (12 bytes)",
        );
    });
});
