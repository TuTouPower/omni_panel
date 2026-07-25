import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
    create_kimi_oauth_manager,
    KIMI_CLIENT_ID,
    KIMI_DEVICE_AUTH_URL,
    KIMI_TOKEN_URL,
} from "../../../src/main/core/auth/kimi_oauth_manager";
import type { VaultBackend } from "../../../src/main/core/vault/vault-backend";

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

interface HttpCall {
    url: string;
    body: string;
    headers: Record<string, string>;
    proxy_url?: string;
}

const DEVICE_AUTH_URL = "https://auth.kimi.com/api/oauth/device_authorization";
const TOKEN_URL = "https://auth.kimi.com/api/oauth/token";

function create_http_mock(responses: {
    device_code?: () => Promise<unknown>;
    token?: (body: string) => Promise<unknown>;
}): {
    calls: HttpCall[];
    post: (
        url: string,
        body: string,
        headers: Record<string, string>,
        proxy_url?: string,
    ) => Promise<unknown>;
} {
    const calls: HttpCall[] = [];
    const device_resp =
        responses.device_code ?? (() => Promise.reject(new Error("not configured")));
    const token_resp = responses.token ?? (() => Promise.reject(new Error("not configured")));
    return {
        calls,
        post(url: string, body: string, headers: Record<string, string>, proxy_url?: string) {
            calls.push({ url, body, headers, ...(proxy_url ? { proxy_url } : {}) });
            if (url === DEVICE_AUTH_URL) return device_resp();
            if (url === TOKEN_URL) return token_resp(body);
            return Promise.reject(new Error(`unexpected URL: ${url}`));
        },
    };
}

describe("kimi_oauth_manager", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("exports Kimi public OAuth constants", () => {
        expect(KIMI_DEVICE_AUTH_URL).toBe(DEVICE_AUTH_URL);
        expect(KIMI_TOKEN_URL).toBe(TOKEN_URL);
        expect(KIMI_CLIENT_ID).toBe("17e5f671-d194-4dfb-9706-5516cb48c098");
    });

    it("start_device_login posts client_id only (no scope) with identity headers", async () => {
        const vault = create_vault();
        const http = create_http_mock({
            device_code: () =>
                Promise.resolve({
                    device_code: "dc-123",
                    user_code: "ABCD-EFGH",
                    verification_uri: "https://auth.kimi.com/device",
                    verification_uri_complete: "https://auth.kimi.com/device?user_code=ABCD-EFGH",
                    expires_in: 1800,
                    interval: 5,
                }),
        });
        const manager = create_kimi_oauth_manager({
            vault,
            http_post: http.post,
            get_device_id: () => Promise.resolve("device-uuid-1"),
        });

        const result = await manager.start_device_login();

        expect(http.calls).toHaveLength(1);
        const call = http.calls[0];
        if (!call) throw new Error("missing HTTP call");
        expect(call.url).toBe(DEVICE_AUTH_URL);
        expect(call.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
        expect(call.headers["X-Msh-Platform"]).toBe("kimi_code_cli");
        expect(call.headers["X-Msh-Device-Id"]).toBe("device-uuid-1");
        // Body contains ONLY client_id (no scope, no grant_type).
        expect(call.body).toBe(`client_id=${KIMI_CLIENT_ID}`);
        expect(result.device_code).toBe("dc-123");
        expect(result.user_code).toBe("ABCD-EFGH");
        expect(result.verification_uri).toBe("https://auth.kimi.com/device");
        expect(result.verification_uri_complete).toBe(
            "https://auth.kimi.com/device?user_code=ABCD-EFGH",
        );
        expect(result.expires_in).toBe(1800);
        expect(result.interval).toBe(5);
    });

    it("start_device_login omits X-Msh-Device-Id when get_device_id returns null", async () => {
        const vault = create_vault();
        const http = create_http_mock({
            device_code: () =>
                Promise.resolve({
                    device_code: "dc-x",
                    user_code: "X-Y",
                    verification_uri: "https://auth.kimi.com/device",
                    expires_in: 900,
                    interval: 5,
                }),
        });
        const manager = create_kimi_oauth_manager({
            vault,
            http_post: http.post,
            get_device_id: () => Promise.resolve(null),
        });

        await manager.start_device_login();

        const call = http.calls[0];
        if (!call) throw new Error("missing HTTP call");
        expect(call.headers["X-Msh-Platform"]).toBe("kimi_code_cli");
        expect(call.headers["X-Msh-Device-Id"]).toBeUndefined();
    });

    it("start_device_login reads the latest proxy URL for each request", async () => {
        const vault = create_vault();
        const http = create_http_mock({
            device_code: () =>
                Promise.resolve({
                    device_code: "dc-1",
                    user_code: "C-1",
                    verification_uri: "https://auth.kimi.com/device",
                    expires_in: 1800,
                    interval: 5,
                }),
        });
        let proxy_url = "http://proxy-one.example:8080";
        const manager = create_kimi_oauth_manager({
            vault,
            get_proxy_url: () => proxy_url,
            http_post: http.post,
            get_device_id: () => Promise.resolve("device-uuid-1"),
        });

        await manager.start_device_login();
        proxy_url = "http://proxy-two.example:8080";
        await manager.start_device_login();

        expect(http.calls.map((call) => call.proxy_url)).toEqual([
            "http://proxy-one.example:8080",
            "http://proxy-two.example:8080",
        ]);
    });

    it("await_completion polls token endpoint with device_code grant and stores tokens", async () => {
        const vault = create_vault();
        let poll_count = 0;
        const http = create_http_mock({
            token: (body) => {
                poll_count++;
                if (poll_count === 1) {
                    return Promise.resolve({ error: "authorization_pending" });
                }
                // Second poll: verify grant_type and device_code on success path.
                expect(body).toContain(
                    "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code",
                );
                expect(body).toContain("device_code=dc-123");
                expect(body).toContain(`client_id=${KIMI_CLIENT_ID}`);
                // Kimi has no scope in token request.
                expect(body).not.toContain("scope=");
                return Promise.resolve({
                    access_token: "access-abc",
                    refresh_token: "refresh-xyz",
                    expires_in: 3600,
                    token_type: "Bearer",
                });
            },
        });
        const manager = create_kimi_oauth_manager({
            vault,
            http_post: http.post,
            get_device_id: () => Promise.resolve("device-uuid-1"),
        });

        const expires_at = Date.now() + 1800_000;
        const promise = manager.await_completion("dc-123", 5, expires_at, "kimi-inst-1");
        await vi.advanceTimersByTimeAsync(5_000);
        const result = await promise;

        expect(result.saved).toBe(true);
        expect(poll_count).toBe(2);
        // Token endpoint calls must carry identity headers.
        for (const call of http.calls) {
            expect(call.headers["X-Msh-Platform"]).toBe("kimi_code_cli");
            expect(call.headers["X-Msh-Device-Id"]).toBe("device-uuid-1");
        }
        await expect(vault.get("kimi-inst-1:OAUTH_TOKEN")).resolves.toBe("access-abc");
        await expect(vault.get("kimi-inst-1:OAUTH_REFRESH_TOKEN")).resolves.toBe("refresh-xyz");
        const expires_at_stored = await vault.get("kimi-inst-1:OAUTH_EXPIRES_AT");
        expect(expires_at_stored).not.toBeNull();
        const expected_epoch = Date.now() + 3600_000;
        expect(Math.abs(Number(expires_at_stored) - expected_epoch)).toBeLessThan(5_000);
    });

    it("await_completion slows down on slow_down error", async () => {
        const vault = create_vault();
        let poll_count = 0;
        const http = create_http_mock({
            token: () => {
                poll_count++;
                if (poll_count <= 2) return Promise.resolve({ error: "slow_down" });
                if (poll_count === 3) return Promise.resolve({ error: "authorization_pending" });
                return Promise.resolve({
                    access_token: "access-final",
                    refresh_token: "refresh-final",
                    expires_in: 3600,
                });
            },
        });
        const manager = create_kimi_oauth_manager({
            vault,
            http_post: http.post,
            get_device_id: () => Promise.resolve("dev-id"),
        });

        const promise = manager.await_completion("dc-456", 5, Date.now() + 1800_000, "kimi-inst-2");
        await vi.advanceTimersByTimeAsync(60_000);
        const result = await promise;

        expect(result.saved).toBe(true);
        expect(poll_count).toBe(4);
    });

    it("await_completion rejects on expired_token", async () => {
        const vault = create_vault();
        const http = create_http_mock({
            token: () => Promise.resolve({ error: "expired_token" }),
        });
        const manager = create_kimi_oauth_manager({
            vault,
            http_post: http.post,
            get_device_id: () => Promise.resolve("dev-id"),
        });

        await expect(
            manager.await_completion("dc-789", 5, Date.now() + 1800_000, "kimi-inst-3"),
        ).rejects.toThrow(/expired_token/);
    });

    it("await_completion rejects on access_denied", async () => {
        const vault = create_vault();
        const http = create_http_mock({
            token: () => Promise.resolve({ error: "access_denied" }),
        });
        const manager = create_kimi_oauth_manager({
            vault,
            http_post: http.post,
            get_device_id: () => Promise.resolve("dev-id"),
        });

        await expect(
            manager.await_completion("dc-denied", 5, Date.now() + 1800_000, "kimi-inst-4"),
        ).rejects.toThrow(/access_denied/);
    });

    it("await_completion rejects when device code expires (timeout)", async () => {
        const vault = create_vault();
        const http = create_http_mock({
            token: () => Promise.resolve({ error: "authorization_pending" }),
        });
        const manager = create_kimi_oauth_manager({
            vault,
            http_post: http.post,
            get_device_id: () => Promise.resolve("dev-id"),
        });

        await expect(
            manager.await_completion("dc-timeout", 5, Date.now() - 1_000, "kimi-inst-5"),
        ).rejects.toThrow(/expired/i);
    });

    it("get_login_status reports has_token and refreshable", async () => {
        const vault = create_vault();
        await vault.set("kimi-inst-1:OAUTH_TOKEN", "access-abc");
        await vault.set("kimi-inst-1:OAUTH_REFRESH_TOKEN", "refresh-xyz");
        const future = Date.now() + 3_600_000;
        await vault.set("kimi-inst-1:OAUTH_EXPIRES_AT", String(future));

        const manager = create_kimi_oauth_manager({
            vault,
            http_post: () => Promise.reject(new Error("no http")),
        });
        const status = await manager.get_login_status("kimi-inst-1");

        expect(status.has_token).toBe(true);
        expect(status.can_refresh).toBe(true);
        expect(status.expires_at).toBe(String(future));
    });

    it("get_login_status reports access-only login without refresh capability", async () => {
        const vault = create_vault();
        await vault.set("kimi-inst-access-only:OAUTH_TOKEN", "access-abc");
        const future = Date.now() + 3_600_000;
        await vault.set("kimi-inst-access-only:OAUTH_EXPIRES_AT", String(future));
        const manager = create_kimi_oauth_manager({
            vault,
            http_post: () => Promise.reject(new Error("no http")),
            get_device_id: () => Promise.resolve("dev-id"),
        });

        const status = await manager.get_login_status("kimi-inst-access-only");

        expect(status).toEqual({
            has_token: true,
            can_refresh: false,
            expires_at: String(future),
        });
    });

    it("get_login_status reports missing token when vault empty", async () => {
        const vault = create_vault();
        const manager = create_kimi_oauth_manager({
            vault,
            http_post: () => Promise.reject(new Error("no http")),
        });
        const status = await manager.get_login_status("kimi-inst-9");
        expect(status.has_token).toBe(false);
        expect(status.can_refresh).toBe(false);
        expect(status.expires_at).toBeNull();
    });

    it("refresh_now posts refresh_token grant (literal, no scope) and rotates tokens", async () => {
        const vault = create_vault();
        await vault.set("kimi-inst-1:OAUTH_TOKEN", "access-old");
        await vault.set("kimi-inst-1:OAUTH_REFRESH_TOKEN", "refresh-old");
        await vault.set("kimi-inst-1:OAUTH_EXPIRES_AT", String(Date.now() - 1_000));

        const http = create_http_mock({
            token: (body) => {
                expect(body).toContain("grant_type=refresh_token");
                expect(body).toContain("refresh_token=refresh-old");
                expect(body).toContain(`client_id=${KIMI_CLIENT_ID}`);
                // Kimi refresh has no scope.
                expect(body).not.toContain("scope=");
                return Promise.resolve({
                    access_token: "access-new",
                    refresh_token: "refresh-new",
                    expires_in: 3600,
                });
            },
        });
        const manager = create_kimi_oauth_manager({
            vault,
            http_post: http.post,
            get_device_id: () => Promise.resolve("device-uuid-1"),
        });

        const result = await manager.refresh_now("kimi-inst-1");
        expect(result.success).toBe(true);
        await expect(vault.get("kimi-inst-1:OAUTH_TOKEN")).resolves.toBe("access-new");
        await expect(vault.get("kimi-inst-1:OAUTH_REFRESH_TOKEN")).resolves.toBe("refresh-new");
    });

    it("refresh_now keeps old refresh_token when server omits it", async () => {
        const vault = create_vault();
        await vault.set("kimi-inst-2:OAUTH_TOKEN", "access-old");
        await vault.set("kimi-inst-2:OAUTH_REFRESH_TOKEN", "refresh-old");
        await vault.set("kimi-inst-2:OAUTH_EXPIRES_AT", String(Date.now() - 1_000));

        const http = create_http_mock({
            // Server returns NO refresh_token — must keep the old one.
            token: () =>
                Promise.resolve({
                    access_token: "access-new",
                    expires_in: 3600,
                }),
        });
        const manager = create_kimi_oauth_manager({
            vault,
            http_post: http.post,
            get_device_id: () => Promise.resolve("dev-id"),
        });

        const result = await manager.refresh_now("kimi-inst-2");
        expect(result.success).toBe(true);
        await expect(vault.get("kimi-inst-2:OAUTH_TOKEN")).resolves.toBe("access-new");
        // Old refresh_token preserved.
        await expect(vault.get("kimi-inst-2:OAUTH_REFRESH_TOKEN")).resolves.toBe("refresh-old");
    });

    it("refresh_now returns failure when no refresh_token stored", async () => {
        const vault = create_vault();
        const manager = create_kimi_oauth_manager({
            vault,
            http_post: () => Promise.reject(new Error("should not call http")),
        });

        const result = await manager.refresh_now("kimi-inst-3");
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/no refresh_token/i);
    });

    it("refresh_now clears stored tokens on invalid_grant", async () => {
        const vault = create_vault();
        await vault.set("kimi-inst-4:OAUTH_TOKEN", "access-old");
        await vault.set("kimi-inst-4:OAUTH_REFRESH_TOKEN", "refresh-dead");
        await vault.set("kimi-inst-4:OAUTH_EXPIRES_AT", "12345");

        const http = create_http_mock({
            token: () => Promise.resolve({ error: "invalid_grant" }),
        });
        const manager = create_kimi_oauth_manager({
            vault,
            http_post: http.post,
            get_device_id: () => Promise.resolve("dev-id"),
        });

        const result = await manager.refresh_now("kimi-inst-4");
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/invalid_grant/);
        await expect(vault.get("kimi-inst-4:OAUTH_TOKEN")).resolves.toBeNull();
        await expect(vault.get("kimi-inst-4:OAUTH_REFRESH_TOKEN")).resolves.toBeNull();
        await expect(vault.get("kimi-inst-4:OAUTH_EXPIRES_AT")).resolves.toBeNull();
    });

    it("logout clears all OAuth entries from vault", async () => {
        const vault = create_vault();
        await vault.set("kimi-inst-1:OAUTH_TOKEN", "access");
        await vault.set("kimi-inst-1:OAUTH_REFRESH_TOKEN", "refresh");
        await vault.set("kimi-inst-1:OAUTH_EXPIRES_AT", "12345");

        const manager = create_kimi_oauth_manager({
            vault,
            http_post: () => Promise.reject(new Error("no http")),
        });
        await manager.logout("kimi-inst-1");

        await expect(vault.get("kimi-inst-1:OAUTH_TOKEN")).resolves.toBeNull();
        await expect(vault.get("kimi-inst-1:OAUTH_REFRESH_TOKEN")).resolves.toBeNull();
        await expect(vault.get("kimi-inst-1:OAUTH_EXPIRES_AT")).resolves.toBeNull();
    });

    it("cancel_device_login stops an in-progress await_completion", async () => {
        const vault = create_vault();
        const http = create_http_mock({
            token: () => Promise.resolve({ error: "authorization_pending" }),
        });
        const manager = create_kimi_oauth_manager({
            vault,
            http_post: http.post,
            get_device_id: () => Promise.resolve("dev-id"),
        });

        const expires_at = Date.now() + 1800_000;
        const promise = manager.await_completion("dc-cancel", 5, expires_at, "kimi-inst-cancel");
        await vi.advanceTimersByTimeAsync(5_000);
        manager.cancel_device_login("kimi-inst-cancel");
        await expect(promise).resolves.toEqual({ saved: false });
    });

    it("auto-refreshes at expires_at minus the refresh margin", async () => {
        const vault = create_vault();
        await vault.set("kimi-inst-auto:OAUTH_TOKEN", "access-old");
        await vault.set("kimi-inst-auto:OAUTH_REFRESH_TOKEN", "refresh-old");
        await vault.set("kimi-inst-auto:OAUTH_EXPIRES_AT", String(Date.now() + 3_600_000));

        let refresh_count = 0;
        const http = create_http_mock({
            token: () => {
                refresh_count++;
                return Promise.resolve({
                    access_token: "access-new",
                    refresh_token: "refresh-new",
                    expires_in: 3600,
                });
            },
        });
        const manager = create_kimi_oauth_manager({
            vault,
            http_post: http.post,
            get_device_id: () => Promise.resolve("dev-id"),
        });

        manager.reconcile_auto_refresh(["kimi-inst-auto"]);
        // expires_at - 5min margin = 3000s from now; refresh should not fire before.
        await vi.advanceTimersByTimeAsync(3_299_999);
        expect(refresh_count).toBe(0);
        await vi.advanceTimersByTimeAsync(1);

        expect(refresh_count).toBe(1);
        manager.shutdown();
    });

    it("reconcile_auto_refresh stops refresh for removed instances", async () => {
        const vault = create_vault();
        await vault.set("kimi-inst-rm:OAUTH_TOKEN", "access");
        await vault.set("kimi-inst-rm:OAUTH_REFRESH_TOKEN", "refresh");
        await vault.set("kimi-inst-rm:OAUTH_EXPIRES_AT", String(Date.now() + 600_000));
        let refresh_count = 0;
        const http = create_http_mock({
            token: () => {
                refresh_count++;
                return Promise.resolve({ access_token: "a", refresh_token: "r", expires_in: 3600 });
            },
        });
        const manager = create_kimi_oauth_manager({
            vault,
            http_post: http.post,
            get_device_id: () => Promise.resolve("dev-id"),
        });

        manager.reconcile_auto_refresh(["kimi-inst-rm"]);
        // Remove the instance from the active set; its refresh timer is cancelled.
        manager.reconcile_auto_refresh([]);
        await vi.advanceTimersByTimeAsync(600_000);

        expect(refresh_count).toBe(0);
        manager.shutdown();
    });

    it("schedule_retry retries after a non-terminal refresh failure", async () => {
        const vault = create_vault();
        await vault.set("kimi-inst-retry:OAUTH_TOKEN", "access");
        await vault.set("kimi-inst-retry:OAUTH_REFRESH_TOKEN", "refresh");
        await vault.set("kimi-inst-retry:OAUTH_EXPIRES_AT", String(Date.now() - 1));
        let refresh_count = 0;
        const http = create_http_mock({
            token: () => {
                refresh_count++;
                // First attempt fails non-terminally (network-ish), next succeeds.
                if (refresh_count === 1)
                    return Promise.resolve({ error: "temporarily_unavailable" });
                return Promise.resolve({ access_token: "a", refresh_token: "r", expires_in: 3600 });
            },
        });
        const manager = create_kimi_oauth_manager({
            vault,
            http_post: http.post,
            get_device_id: () => Promise.resolve("dev-id"),
        });

        manager.start_auto_refresh("kimi-inst-retry");
        // Initial refresh fires ~immediately (expires_at in past → MIN_REFRESH_DELAY).
        await vi.advanceTimersByTimeAsync(1000);
        expect(refresh_count).toBe(1);
        // Retry scheduled at REFRESH_RETRY_DELAY_MS (60s); advance past it.
        await vi.advanceTimersByTimeAsync(60_000);
        expect(refresh_count).toBe(2);
        manager.shutdown();
    });

    it("stops retrying after terminal invalid_grant and clears tokens", async () => {
        const vault = create_vault();
        await vault.set("kimi-inst-terminal:OAUTH_TOKEN", "access");
        await vault.set("kimi-inst-terminal:OAUTH_REFRESH_TOKEN", "refresh-dead");
        await vault.set("kimi-inst-terminal:OAUTH_EXPIRES_AT", String(Date.now() - 1));
        let refresh_count = 0;
        const http = create_http_mock({
            token: () => {
                refresh_count++;
                return Promise.resolve({ error: "invalid_grant" });
            },
        });
        const manager = create_kimi_oauth_manager({
            vault,
            http_post: http.post,
            get_device_id: () => Promise.resolve("dev-id"),
        });

        manager.start_auto_refresh("kimi-inst-terminal");
        await vi.advanceTimersByTimeAsync(1000);
        expect(refresh_count).toBe(1);
        // Terminal error → no retry scheduled even after retry delay.
        await vi.advanceTimersByTimeAsync(120_000);
        expect(refresh_count).toBe(1);

        await expect(vault.get("kimi-inst-terminal:OAUTH_TOKEN")).resolves.toBeNull();
        await expect(vault.get("kimi-inst-terminal:OAUTH_REFRESH_TOKEN")).resolves.toBeNull();
        manager.shutdown();
    });

    it("shutdown cancels all pending auto-refresh timers", async () => {
        const vault = create_vault();
        await vault.set("kimi-inst-sd:OAUTH_TOKEN", "access");
        await vault.set("kimi-inst-sd:OAUTH_REFRESH_TOKEN", "refresh");
        await vault.set("kimi-inst-sd:OAUTH_EXPIRES_AT", String(Date.now() + 60_000));
        let refresh_count = 0;
        const http = create_http_mock({
            token: () => {
                refresh_count++;
                return Promise.resolve({ access_token: "a", refresh_token: "r", expires_in: 1 });
            },
        });
        const manager = create_kimi_oauth_manager({
            vault,
            http_post: http.post,
            get_device_id: () => Promise.resolve("dev-id"),
        });

        manager.start_auto_refresh("kimi-inst-sd");
        await vi.advanceTimersByTimeAsync(500);
        manager.shutdown();
        const count_after_shutdown = refresh_count;
        await vi.advanceTimersByTimeAsync(10_000);

        expect(refresh_count).toBe(count_after_shutdown);
    });
});
