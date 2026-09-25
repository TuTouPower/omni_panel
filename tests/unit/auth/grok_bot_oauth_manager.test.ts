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
        // A12: verifier 保留在主进程内，login_start 暴露 login_id
        expect(start.login_id).toBeDefined();
        expect(start.verifier).toBeUndefined();
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

    it("throws BROWSER_OPEN_FAILED when open_external fails (A24 / AC-005)", async () => {
        const vault = create_in_memory_vault();
        const open_external = vi.fn().mockRejectedValue(new Error("browser failed to spawn"));
        const manager = create_grok_bot_oauth_manager({ vault, open_external });

        await expect(manager.start_login()).rejects.toThrow("BROWSER_OPEN_FAILED");
    });

    it("deduplicates concurrent refresh_now calls for the same instance (A6 / AC-003)", async () => {
        const vault = create_in_memory_vault();
        const instance_id = "inst_dedup";
        await vault.set(keyFor(instance_id, REFRESH_TOKEN_SECRET), "token-1");

        let network_calls = 0;
        const http_post = vi.fn().mockImplementation(async () => {
            network_calls++;
            await new Promise((r) => setTimeout(r, 50));
            return {
                status: 200,
                data: { access_token: "new-access", refresh_token: "new-refresh" },
            };
        });

        const manager = create_grok_bot_oauth_manager({ vault, http_post });

        // 并发发起两次刷新
        const [res1, res2] = await Promise.all([
            manager.refresh_now(instance_id),
            manager.refresh_now(instance_id),
        ]);

        expect(network_calls).toBe(1);
        expect(res1.ok).toBe(true);
        expect(res2.ok).toBe(true);
        expect(res1.access_token).toBe("new-access");
        expect(res2.access_token).toBe("new-access");
    });

    it("cancels prior active poll when same instance starts new poll (A5 / AC-002)", async () => {
        const vault = create_in_memory_vault();
        const http_get = vi.fn().mockResolvedValue({ status: 404, data: {} });
        const manager = create_grok_bot_oauth_manager({ vault, http_get });

        const first_poll = manager.await_completion("inst_dup", "u1", "v1", 10_000);
        // 第二个 poll 发起，应取消第一个
        const second_poll = manager.await_completion("inst_dup", "u2", "v2", 50);

        const first_res = await first_poll;
        const second_res = await second_poll;

        expect(first_res.saved).toBe(false);
        expect(first_res.error).toBe("已取消登录");
        expect(second_res.saved).toBe(false);
        expect(second_res.error).toMatch(/超时/);
    });

    it("handles vault save failures gracefully with atomic rollback (A22, A23 / AC-006)", async () => {
        const vault = create_in_memory_vault();
        // 模拟 access token 写入失败
        const original_set = vault.set.bind(vault);
        vault.set = vi.fn().mockImplementation((k: string, v: string) => {
            if (k.endsWith(ACCESS_TOKEN_SECRET)) {
                return Promise.reject(new Error("disk full"));
            }
            return original_set(k, v);
        });

        const http_get = vi.fn().mockResolvedValue({
            status: 200,
            data: { accessToken: "acc-token", refreshToken: "ref-token" },
        });

        const manager = create_grok_bot_oauth_manager({ vault, http_get });
        const result = await manager.await_completion("inst_vault_err", "u", "v", 5000);

        expect(result.saved).toBe(false);
        expect(result.code).toBe("SAVE_FAILED");
        // 验证补偿回滚：REFRESH_TOKEN 也被清理，不残留半写状态
        expect(await vault.get(keyFor("inst_vault_err", REFRESH_TOKEN_SECRET))).toBeNull();
    });

    it("schedules background refresh and cleans up on shutdown (A149 / AC-009)", async () => {
        vi.useFakeTimers();
        try {
            const vault = create_in_memory_vault();
            const instance_id = "inst_schedule";
            await vault.set(keyFor(instance_id, REFRESH_TOKEN_SECRET), "scheduled-token");

            const http_post = vi.fn().mockResolvedValue({
                status: 200,
                data: { access_token: "refreshed-acc" },
            });

            const manager = create_grok_bot_oauth_manager({ vault, http_post });
            manager.schedule_refresh?.(instance_id, 10_000);

            expect(http_post).not.toHaveBeenCalled();

            // 快进时钟触发定时刷新
            await vi.advanceTimersByTimeAsync(10_000);
            expect(http_post).toHaveBeenCalledTimes(1);

            manager.shutdown();
            await vi.advanceTimersByTimeAsync(20_000);
            expect(http_post).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it("notifies on_token_expired when scheduled refresh fails (AC-009)", async () => {
        vi.useFakeTimers();
        try {
            const vault = create_in_memory_vault();
            const instance_id = "inst_warn";
            await vault.set(keyFor(instance_id, REFRESH_TOKEN_SECRET), "invalid-token");

            const http_post = vi.fn().mockResolvedValue({
                status: 401,
                data: { error: "invalid_grant" },
            });
            const on_token_expired = vi.fn();

            const manager = create_grok_bot_oauth_manager({ vault, http_post, on_token_expired });
            manager.schedule_refresh?.(instance_id, 10_000);

            await vi.advanceTimersByTimeAsync(10_000);

            expect(http_post).toHaveBeenCalledTimes(1);
            expect(on_token_expired).toHaveBeenCalledWith(
                instance_id,
                expect.stringContaining("过期"),
            );

            manager.shutdown();
        } finally {
            vi.useRealTimers();
        }
    });
});
