import { describe, expect, it, vi } from "vitest";
import {
    ACCESS_TOKEN_MARGIN_MS,
    KIMI_WEB_REFRESH_URL,
    decode_jwt_exp_ms,
    is_bearer_usable,
    refresh_kimi_web_tokens,
} from "../../../src/main/core/auth/kimi_web_token_refresher";

function b64url(value: unknown): string {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
}
function make_jwt(exp_seconds: number, extra: Record<string, unknown> = {}): string {
    return `${b64url({ alg: "RS256", typ: "JWT" })}.${b64url({ exp: exp_seconds, ...extra })}.sig`;
}
const seconds_from_now = (offset: number): number => Math.floor(Date.now() / 1000) + offset;

describe("decode_jwt_exp_ms", () => {
    it("returns the exp claim in milliseconds", () => {
        expect(decode_jwt_exp_ms(make_jwt(1_700_000_000))).toBe(1_700_000_000_000);
    });

    it("returns null for malformed or exp-less tokens", () => {
        expect(decode_jwt_exp_ms("not-a-jwt")).toBeNull();
        expect(decode_jwt_exp_ms("a.%%%.c")).toBeNull();
        expect(decode_jwt_exp_ms(`${b64url({})}.${b64url({ sub: "u" })}.sig`)).toBeNull();
    });
});

describe("is_bearer_usable", () => {
    const now = 1_700_000_000_000;

    it("accepts a Bearer whose exp is beyond the margin", () => {
        const exp = Math.floor((now + ACCESS_TOKEN_MARGIN_MS * 2) / 1000);
        expect(is_bearer_usable(`Bearer ${make_jwt(exp)}`, { now })).toBe(true);
    });

    it("rejects expired, about-to-expire, malformed and non-Bearer values", () => {
        const expired = Math.floor((now - 1000) / 1000);
        const within_margin = Math.floor((now + ACCESS_TOKEN_MARGIN_MS / 2) / 1000);
        expect(is_bearer_usable(`Bearer ${make_jwt(expired)}`, { now })).toBe(false);
        expect(is_bearer_usable(`Bearer ${make_jwt(within_margin)}`, { now })).toBe(false);
        expect(is_bearer_usable("Bearer token-sentinel", { now })).toBe(false);
        expect(is_bearer_usable(undefined, { now })).toBe(false);
        expect(is_bearer_usable("", { now })).toBe(false);
    });
});

describe("refresh_kimi_web_tokens", () => {
    it("exchanges a refresh token for a rotated pair (ConnectRPC JSON, minimal headers)", async () => {
        const http_post = vi.fn().mockResolvedValue({
            accessToken: make_jwt(seconds_from_now(900)),
            refreshToken: "rotated-refresh",
        });
        const result = await refresh_kimi_web_tokens("refresh-token", { http_post });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.tokens.refresh_token).toBe("rotated-refresh");

        const [url, body, headers] = http_post.mock.calls[0] as [
            string,
            string,
            Record<string, string>,
        ];
        expect(url).toBe(KIMI_WEB_REFRESH_URL);
        expect(JSON.parse(body)).toEqual({ refreshToken: "refresh-token" });
        expect(headers["content-type"]).toBe("application/json");
        // 实测最小请求只需要 content-type；cookie / x-msh-* / Origin 一律不发。
        expect(Object.keys(headers).sort()).toEqual(["connect-protocol-version", "content-type"]);
    });

    it("keeps the previous refresh token when the response omits a rotated one", async () => {
        const http_post = vi.fn().mockResolvedValue({
            accessToken: make_jwt(seconds_from_now(900)),
        });
        const result = await refresh_kimi_web_tokens("refresh-token", { http_post });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.tokens.refresh_token).toBe("refresh-token");
    });

    it("classifies unauthenticated / invalid_argument as unrecoverable", async () => {
        for (const code of ["unauthenticated", "invalid_argument"]) {
            const http_post = vi.fn().mockResolvedValue({ code, details: [] });
            const result = await refresh_kimi_web_tokens("refresh-token", { http_post });
            expect(result.ok).toBe(false);
            if (result.ok) return;
            expect(result.unauthenticated).toBe(true);
            expect(result.error).toContain(code);
        }
    });

    it("treats transport failures and unexpected shapes as retryable (not auth)", async () => {
        const transport = vi.fn().mockRejectedValue(new Error("socket hang up"));
        const transport_result = await refresh_kimi_web_tokens("refresh-token", {
            http_post: transport,
        });
        expect(transport_result.ok).toBe(false);
        if (transport_result.ok) return;
        expect(transport_result.unauthenticated).toBe(false);

        const shape = vi.fn().mockResolvedValue({ weird: true });
        const shape_result = await refresh_kimi_web_tokens("refresh-token", { http_post: shape });
        expect(shape_result.ok).toBe(false);
        if (shape_result.ok) return;
        expect(shape_result.unauthenticated).toBe(false);
    });

    it("short-circuits an empty refresh token without any request", async () => {
        const http_post = vi.fn();
        const result = await refresh_kimi_web_tokens("   ", { http_post });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.unauthenticated).toBe(true);
        expect(http_post).not.toHaveBeenCalled();
    });
});
