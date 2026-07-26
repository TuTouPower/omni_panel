import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
    is_token_response,
    is_error_response,
    form_encode,
    is_terminal_grant_error,
    compute_expires_at,
    load_tokens,
    store_tokens,
    clear_tokens,
    OAUTH_TOKEN_KEY,
    OAUTH_REFRESH_TOKEN_KEY,
    OAUTH_EXPIRES_AT_KEY,
} from "../../../src/main/core/auth/oauth_helpers";
import type { VaultBackend } from "../../../src/main/core/vault/vault-backend";
import { keyFor } from "../../../src/main/core/config/secrets-store";

function create_vault(): VaultBackend & { values: Map<string, string> } {
    const values = new Map<string, string>();
    return {
        values,
        get(key: string) {
            return Promise.resolve(values.get(key) ?? null);
        },
        set(key: string, value: string) {
            values.set(key, value);
            return Promise.resolve();
        },
        delete(key: string) {
            values.delete(key);
            return Promise.resolve();
        },
        has(key: string) {
            return Promise.resolve(values.has(key));
        },
        list_keys(prefix?: string) {
            return Promise.resolve(
                [...values.keys()].filter((key) => (prefix ? key.startsWith(prefix) : true)),
            );
        },
    };
}

describe("oauth_helpers", () => {
    describe("is_token_response", () => {
        it("returns true for an object with a string access_token", () => {
            expect(is_token_response({ access_token: "abc" })).toBe(true);
        });

        it("returns true when optional fields are present", () => {
            expect(
                is_token_response({
                    access_token: "abc",
                    refresh_token: "refresh",
                    expires_in: 3600,
                    token_type: "Bearer",
                }),
            ).toBe(true);
        });

        it("returns false for null", () => {
            expect(is_token_response(null)).toBe(false);
        });

        it("returns false for non-objects", () => {
            expect(is_token_response("token")).toBe(false);
            expect(is_token_response(123)).toBe(false);
            expect(is_token_response(undefined)).toBe(false);
        });

        it("returns false when access_token is missing or non-string", () => {
            expect(is_token_response({})).toBe(false);
            expect(is_token_response({ access_token: 123 })).toBe(false);
        });
    });

    describe("is_error_response", () => {
        it("returns true for an object with a string error", () => {
            expect(is_error_response({ error: "invalid_grant" })).toBe(true);
        });

        it("returns true when error_description is present", () => {
            expect(
                is_error_response({
                    error: "invalid_grant",
                    error_description: "token expired",
                }),
            ).toBe(true);
        });

        it("returns false for null and non-objects", () => {
            expect(is_error_response(null)).toBe(false);
            expect(is_error_response("error")).toBe(false);
            expect(is_error_response(123)).toBe(false);
        });

        it("returns false when error is missing or non-string", () => {
            expect(is_error_response({})).toBe(false);
            expect(is_error_response({ error: 500 })).toBe(false);
        });
    });

    describe("form_encode", () => {
        it("encodes key-value pairs with URL encoding", () => {
            expect(
                form_encode([
                    ["client_id", "a/b"],
                    ["scope", "offline_access"],
                ]),
            ).toBe("client_id=a%2Fb&scope=offline_access");
        });

        it("returns an empty string for no pairs", () => {
            expect(form_encode([])).toBe("");
        });

        it("encodes spaces and special characters", () => {
            expect(form_encode([["grant_type", "device code"]])).toBe("grant_type=device%20code");
        });
    });

    describe("is_terminal_grant_error", () => {
        it("returns true for known terminal errors", () => {
            expect(is_terminal_grant_error("invalid_grant")).toBe(true);
            expect(is_terminal_grant_error("refresh_token_expired")).toBe(true);
            expect(is_terminal_grant_error("refresh_token_reused")).toBe(true);
            expect(is_terminal_grant_error("refresh_token_invalidated")).toBe(true);
        });

        it("returns false for non-terminal errors", () => {
            expect(is_terminal_grant_error("authorization_pending")).toBe(false);
            expect(is_terminal_grant_error("slow_down")).toBe(false);
            expect(is_terminal_grant_error("temporarily_unavailable")).toBe(false);
            expect(is_terminal_grant_error("")).toBe(false);
        });
    });

    describe("compute_expires_at", () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });
        afterEach(() => {
            vi.useRealTimers();
        });

        it("returns now + expires_in seconds as a string", () => {
            const now = 1_000_000_000_000;
            vi.setSystemTime(now);
            expect(compute_expires_at({ access_token: "x", expires_in: 3600 })).toBe(
                String(now + 3_600_000),
            );
        });

        it("returns undefined when expires_in is missing", () => {
            expect(compute_expires_at({ access_token: "x" })).toBeUndefined();
        });

        it("returns undefined when expires_in is not a number", () => {
            expect(
                compute_expires_at({ access_token: "x", expires_in: "3600" as unknown as number }),
            ).toBeUndefined();
        });
    });

    describe("load_tokens", () => {
        it("returns nulls when vault has no tokens", async () => {
            const vault = create_vault();
            const tokens = await load_tokens(vault, "inst-1");
            expect(tokens).toEqual({ access: null, refresh: null, expires_at: null });
        });

        it("loads all three token keys in parallel", async () => {
            const vault = create_vault();
            await vault.set(keyFor("inst-1", OAUTH_TOKEN_KEY), "access-1");
            await vault.set(keyFor("inst-1", OAUTH_REFRESH_TOKEN_KEY), "refresh-1");
            await vault.set(keyFor("inst-1", OAUTH_EXPIRES_AT_KEY), "12345");

            const tokens = await load_tokens(vault, "inst-1");
            expect(tokens).toEqual({
                access: "access-1",
                refresh: "refresh-1",
                expires_at: "12345",
            });
        });
    });

    describe("store_tokens", () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });
        afterEach(() => {
            vi.useRealTimers();
        });

        it("stores access_token, refresh_token, and computed expires_at", async () => {
            const vault = create_vault();
            const now = 1_000_000_000_000;
            vi.setSystemTime(now);

            await store_tokens(vault, "inst-1", {
                access_token: "access-1",
                refresh_token: "refresh-1",
                expires_in: 3600,
            });

            await expect(vault.get(keyFor("inst-1", OAUTH_TOKEN_KEY))).resolves.toBe("access-1");
            await expect(vault.get(keyFor("inst-1", OAUTH_REFRESH_TOKEN_KEY))).resolves.toBe(
                "refresh-1",
            );
            await expect(vault.get(keyFor("inst-1", OAUTH_EXPIRES_AT_KEY))).resolves.toBe(
                String(now + 3_600_000),
            );
        });

        it("preserves existing refresh_token when response omits it", async () => {
            const vault = create_vault();
            await vault.set(keyFor("inst-1", OAUTH_REFRESH_TOKEN_KEY), "refresh-old");

            await store_tokens(vault, "inst-1", { access_token: "access-1", expires_in: 3600 });

            await expect(vault.get(keyFor("inst-1", OAUTH_REFRESH_TOKEN_KEY))).resolves.toBe(
                "refresh-old",
            );
        });

        it("does not write expires_at when expires_in is missing", async () => {
            const vault = create_vault();
            await store_tokens(vault, "inst-1", { access_token: "access-1" });
            await expect(vault.get(keyFor("inst-1", OAUTH_EXPIRES_AT_KEY))).resolves.toBeNull();
        });
    });

    describe("clear_tokens", () => {
        it("deletes all three OAuth keys", async () => {
            const vault = create_vault();
            await vault.set(keyFor("inst-1", OAUTH_TOKEN_KEY), "access-1");
            await vault.set(keyFor("inst-1", OAUTH_REFRESH_TOKEN_KEY), "refresh-1");
            await vault.set(keyFor("inst-1", OAUTH_EXPIRES_AT_KEY), "12345");

            await clear_tokens(vault, "inst-1");

            await expect(vault.get(keyFor("inst-1", OAUTH_TOKEN_KEY))).resolves.toBeNull();
            await expect(vault.get(keyFor("inst-1", OAUTH_REFRESH_TOKEN_KEY))).resolves.toBeNull();
            await expect(vault.get(keyFor("inst-1", OAUTH_EXPIRES_AT_KEY))).resolves.toBeNull();
        });

        it("succeeds when keys are already absent", async () => {
            const vault = create_vault();
            await expect(clear_tokens(vault, "inst-missing")).resolves.toBeUndefined();
        });
    });
});
