import { describe, expect, it } from "vitest";
import { is_auth_error } from "../../../src/shared/lib/auth-error";

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
