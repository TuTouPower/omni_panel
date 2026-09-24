import { describe, expect, it, vi } from "vitest";
import {
    create_grok_bot_oauth_manager,
    ACCESS_TOKEN_SECRET,
    REFRESH_TOKEN_SECRET,
} from "../../../src/main/core/auth/grok_bot_oauth_manager";
import type { VaultBackend } from "../../../src/main/core/vault/vault-backend";
import { keyFor } from "../../../src/main/core/config/secrets-store";

function create_in_memory_vault(): VaultBackend {
    const map = new Map<string, string>();
    return {
        get: vi.fn((key: string) => Promise.resolve(map.get(key) ?? null)),
        set: vi.fn((key: string, val: string) => {
            map.set(key, val);
            return Promise.resolve();
        }),
        delete: vi.fn((key: string) => {
            map.delete(key);
            return Promise.resolve();
        }),
        has: vi.fn((key: string) => Promise.resolve(map.has(key))),
        list_keys: vi.fn(() => Promise.resolve(Array.from(map.keys()))),
        replaceAll: vi.fn((entries: Record<string, string>) => {
            map.clear();
            for (const [k, v] of Object.entries(entries)) {
                map.set(k, v);
            }
            return Promise.resolve();
        }),
    };
}

describe("grok_bot_oauth_manager", () => {
    it("start_login generates valid PKCE params and calls open_external", async () => {
        const vault = create_in_memory_vault();
        const open_external = vi.fn().mockResolvedValue(undefined);
        const manager = create_grok_bot_oauth_manager({ vault, open_external });

        const start = await manager.start_login();
        expect(start.uuid).toBeDefined();
        expect(start.verifier).toBeDefined();
        expect(start.auth_url).toContain("https://cursor.com/loginDeepControl");
        expect(start.auth_url).toContain(`uuid=${start.uuid}`);
        expect(start.auth_url).toContain("challenge=");
        expect(open_external).toHaveBeenCalledWith(start.auth_url);
    });

    it("await_completion polls until 200 and saves tokens to vault", async () => {
        const vault = create_in_memory_vault();
        let call_count = 0;
        const http_get = vi.fn().mockImplementation(() => {
            call_count++;
            if (call_count < 2) {
                return Promise.resolve({ status: 404, data: {} });
            }
            return Promise.resolve({
                status: 200,
                data: {
                    accessToken: "mock-jwt-access-token",
                    refreshToken: "mock-refresh-token",
                },
            });
        });

        const manager = create_grok_bot_oauth_manager({ vault, http_get });
        const instance_id = "grok_bot_inst_1";
        const result = await manager.await_completion(
            instance_id,
            "test-uuid",
            "test-verifier",
            5000,
        );

        expect(result.saved).toBe(true);
        expect(result.token).toBe("mock-jwt-access-token");
        expect(result.refresh_token).toBe("mock-refresh-token");

        expect(await vault.get(keyFor(instance_id, ACCESS_TOKEN_SECRET))).toBe(
            "mock-jwt-access-token",
        );
        expect(await vault.get(keyFor(instance_id, REFRESH_TOKEN_SECRET))).toBe(
            "mock-refresh-token",
        );
    });

    it("await_completion can be cancelled immediately", async () => {
        const vault = create_in_memory_vault();
        const http_get = vi.fn().mockResolvedValue({ status: 404, data: {} });
        const manager = create_grok_bot_oauth_manager({ vault, http_get });
        const instance_id = "grok_bot_inst_cancel";

        const promise = manager.await_completion(instance_id, "u", "v", 10_000);
        manager.cancel_login(instance_id);
        const result = await promise;

        expect(result.saved).toBe(false);
        expect(result.error).toBe("已取消登录");
    });

    it("await_completion returns timeout error when timeout exceeded", async () => {
        const vault = create_in_memory_vault();
        const http_get = vi.fn().mockResolvedValue({ status: 404, data: {} });
        const manager = create_grok_bot_oauth_manager({ vault, http_get });

        const result = await manager.await_completion("inst_timeout", "u", "v", 50);
        expect(result.saved).toBe(false);
        expect(result.error).toMatch(/超时/);
    });

    it("refresh_now updates access token in vault using refresh token", async () => {
        const vault = create_in_memory_vault();
        const instance_id = "inst_refresh";
        await vault.set(keyFor(instance_id, REFRESH_TOKEN_SECRET), "old-refresh-token");
        await vault.set(keyFor(instance_id, ACCESS_TOKEN_SECRET), "old-access-token");

        const http_post = vi.fn().mockResolvedValue({
            status: 200,
            data: {
                access_token: "new-fresh-access-token",
                refresh_token: "new-rotated-refresh-token",
            },
        });

        const manager = create_grok_bot_oauth_manager({ vault, http_post });
        const res = await manager.refresh_now(instance_id);

        expect(res.ok).toBe(true);
        expect(res.access_token).toBe("new-fresh-access-token");
        expect(await vault.get(keyFor(instance_id, ACCESS_TOKEN_SECRET))).toBe(
            "new-fresh-access-token",
        );
        expect(await vault.get(keyFor(instance_id, REFRESH_TOKEN_SECRET))).toBe(
            "new-rotated-refresh-token",
        );

        const post_calls = http_post.mock.calls;
        expect(post_calls).toHaveLength(1);
        const [url, body] = post_calls[0] as [string, string];
        expect(url).toContain("/oauth/token");
        expect(JSON.parse(body)).toEqual({
            client_id: "KbZUR41cY7W6zRSdpSUJ7I7mLYBKOCmB",
            grant_type: "refresh_token",
            refresh_token: "old-refresh-token",
        });
    });

    it("refresh_now fails when refresh token is missing", async () => {
        const vault = create_in_memory_vault();
        const manager = create_grok_bot_oauth_manager({ vault });
        const res = await manager.refresh_now("inst_missing");
        expect(res.ok).toBe(false);
        expect(res.error).toMatch(/未找到有效的刷新令牌/);
    });

    it("logout cleans up secrets from vault", async () => {
        const vault = create_in_memory_vault();
        const instance_id = "inst_logout";
        await vault.set(keyFor(instance_id, ACCESS_TOKEN_SECRET), "token");
        await vault.set(keyFor(instance_id, REFRESH_TOKEN_SECRET), "refresh");

        const manager = create_grok_bot_oauth_manager({ vault });
        await manager.logout(instance_id);

        expect(await vault.get(keyFor(instance_id, ACCESS_TOKEN_SECRET))).toBeNull();
        expect(await vault.get(keyFor(instance_id, REFRESH_TOKEN_SECRET))).toBeNull();
    });
});
