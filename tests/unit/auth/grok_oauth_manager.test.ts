import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
    create_grok_oauth_manager,
    GROK_CLIENT_ID,
    GROK_SCOPE,
} from "../../../src/main/core/auth/grok_oauth_manager";
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

function create_deferred(): {
    readonly promise: Promise<void>;
    readonly resolve: () => void;
} {
    let resolve_promise: (() => void) | undefined;
    const promise = new Promise<void>((resolve) => {
        resolve_promise = resolve;
    });
    return {
        promise,
        resolve: () => resolve_promise?.(),
    };
}

function create_blocking_token_vault(): VaultBackend & {
    readonly values: Map<string, string>;
    readonly first_token_set_started: Promise<void>;
    readonly release_first_token_set: () => void;
} {
    const values = new Map<string, string>();
    const started = create_deferred();
    const release = create_deferred();
    let should_block = true;
    return {
        values,
        first_token_set_started: started.promise,
        release_first_token_set: release.resolve,
        get(key: string) {
            return Promise.resolve(values.get(key) ?? null);
        },
        async set(key: string, value: string) {
            if (should_block && key.endsWith(":OAUTH_TOKEN")) {
                should_block = false;
                started.resolve();
                await release.promise;
            }
            values.set(key, value);
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
    set_device_response: (resp: () => Promise<unknown>) => void;
    set_token_response: (resp: (body: string) => Promise<unknown>) => void;
} {
    const calls: HttpCall[] = [];
    let device_resp = responses.device_code ?? (() => Promise.reject(new Error("not configured")));
    let token_resp = responses.token ?? (() => Promise.reject(new Error("not configured")));
    return {
        calls,
        post(url: string, body: string, headers: Record<string, string>, proxy_url?: string) {
            calls.push({ url, body, headers, ...(proxy_url ? { proxy_url } : {}) });
            if (url === "https://auth.x.ai/oauth2/device/code") {
                return device_resp();
            }
            if (url === "https://auth.x.ai/oauth2/token") {
                return token_resp(body);
            }
            return Promise.reject(new Error(`unexpected URL: ${url}`));
        },
        set_device_response(resp) {
            device_resp = resp;
        },
        set_token_response(resp) {
            token_resp = resp;
        },
    };
}

describe("grok_oauth_manager", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("reads the latest proxy URL for each OAuth request", async () => {
        const vault = create_vault();
        const http = create_http_mock({
            device_code: () =>
                Promise.resolve({
                    device_code: "dc-1",
                    user_code: "CODE-1",
                    verification_uri: "https://auth.x.ai/device",
                    expires_in: 1800,
                    interval: 5,
                }),
        });
        let proxy_url = "http://proxy-one.example:8080";
        const manager = create_grok_oauth_manager({
            vault,
            get_proxy_url: () => proxy_url,
            http_post: http.post,
        });

        await manager.start_device_login();
        proxy_url = "http://proxy-two.example:8080";
        await manager.start_device_login();

        expect(http.calls.map((call) => call.proxy_url)).toEqual([
            "http://proxy-one.example:8080",
            "http://proxy-two.example:8080",
        ]);
    });

    it("start_device_login posts to device auth endpoint with client_id and scope", async () => {
        const vault = create_vault();
        const http = create_http_mock({
            device_code: () =>
                Promise.resolve({
                    device_code: "dc-123",
                    user_code: "ABCD-EFGH",
                    verification_uri: "https://auth.x.ai/device",
                    verification_uri_complete: "https://auth.x.ai/device?user_code=ABCD-EFGH",
                    expires_in: 1800,
                    interval: 5,
                }),
        });
        const manager = create_grok_oauth_manager({ vault, http_post: http.post });

        const result = await manager.start_device_login();

        expect(http.calls).toHaveLength(1);
        const call = http.calls[0];
        expect(call).toBeDefined();
        if (!call) throw new Error("missing HTTP call");
        expect(call.url).toBe("https://auth.x.ai/oauth2/device/code");
        expect(call.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
        expect(call.body).toContain(`client_id=${GROK_CLIENT_ID}`);
        expect(call.body).toContain(`scope=${encodeURIComponent(GROK_SCOPE)}`);
        expect(result.device_code).toBe("dc-123");
        expect(result.user_code).toBe("ABCD-EFGH");
        expect(result.verification_uri).toBe("https://auth.x.ai/device");
        expect(result.verification_uri_complete).toBe(
            "https://auth.x.ai/device?user_code=ABCD-EFGH",
        );
        expect(result.expires_in).toBe(1800);
        expect(result.interval).toBe(5);
    });

    it("await_completion polls token endpoint and stores tokens on success", async () => {
        const vault = create_vault();
        let poll_count = 0;
        const http = create_http_mock({
            token: () => {
                poll_count++;
                if (poll_count === 1) {
                    return Promise.resolve({ error: "authorization_pending" });
                }
                return Promise.resolve({
                    access_token: "access-abc",
                    refresh_token: "refresh-xyz",
                    expires_in: 3600,
                    token_type: "Bearer",
                });
            },
        });
        const manager = create_grok_oauth_manager({ vault, http_post: http.post });

        const expires_at = Date.now() + 1800_000;
        const promise = manager.await_completion("dc-123", 5, expires_at, "grok-inst-1");
        // First poll is immediate; subsequent polls wait `interval` seconds.
        await vi.advanceTimersByTimeAsync(5_000);

        const result = await promise;

        expect(result.saved).toBe(true);
        expect(poll_count).toBe(2);

        // All token endpoint calls use device_code grant type.
        for (const call of http.calls) {
            expect(call.body).toContain(
                "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code",
            );
            expect(call.body).toContain("device_code=dc-123");
            expect(call.body).toContain(`client_id=${GROK_CLIENT_ID}`);
        }

        // Vault should have OAUTH_TOKEN, OAUTH_REFRESH_TOKEN, and OAUTH_EXPIRES_AT.
        await expect(vault.get("grok-inst-1:OAUTH_TOKEN")).resolves.toBe("access-abc");
        await expect(vault.get("grok-inst-1:OAUTH_REFRESH_TOKEN")).resolves.toBe("refresh-xyz");
        const expires_at_stored = await vault.get("grok-inst-1:OAUTH_EXPIRES_AT");
        expect(expires_at_stored).not.toBeNull();
        // Stored expires_at should be roughly now + 3600s.
        const expected_epoch = Date.now() + 3600_000;
        const stored_epoch = Number(expires_at_stored);
        expect(Math.abs(stored_epoch - expected_epoch)).toBeLessThan(5_000);
    });

    it("await_completion slows down on slow_down error", async () => {
        const vault = create_vault();
        let poll_count = 0;
        const http = create_http_mock({
            token: () => {
                poll_count++;
                if (poll_count <= 2) {
                    return Promise.resolve({ error: "slow_down" });
                }
                if (poll_count === 3) {
                    return Promise.resolve({ error: "authorization_pending" });
                }
                return Promise.resolve({
                    access_token: "access-final",
                    refresh_token: "refresh-final",
                    expires_in: 3600,
                    token_type: "Bearer",
                });
            },
        });
        const manager = create_grok_oauth_manager({ vault, http_post: http.post });

        const expires_at = Date.now() + 1800_000;
        const promise = manager.await_completion("dc-456", 5, expires_at, "grok-inst-2");
        // Initial poll fires immediately; subsequent polls wait at least the current interval.
        // After two slow_down responses, interval should grow to 15s. Advance to cover all polls.
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
        const manager = create_grok_oauth_manager({ vault, http_post: http.post });

        const expires_at = Date.now() + 1800_000;
        await expect(
            manager.await_completion("dc-789", 5, expires_at, "grok-inst-3"),
        ).rejects.toThrow(/expired_token/);
    });

    it("await_completion rejects on access_denied", async () => {
        const vault = create_vault();
        const http = create_http_mock({
            token: () => Promise.resolve({ error: "access_denied" }),
        });
        const manager = create_grok_oauth_manager({ vault, http_post: http.post });

        const expires_at = Date.now() + 1800_000;
        await expect(
            manager.await_completion("dc-denied", 5, expires_at, "grok-inst-4"),
        ).rejects.toThrow(/access_denied/);
    });

    it("await_completion rejects when device code expires (timeout)", async () => {
        const vault = create_vault();
        const http = create_http_mock({
            token: () => Promise.resolve({ error: "authorization_pending" }),
        });
        const manager = create_grok_oauth_manager({ vault, http_post: http.post });

        // expires_at already in the past — first poll rejects immediately.
        const expires_at = Date.now() - 1_000;
        await expect(
            manager.await_completion("dc-timeout", 5, expires_at, "grok-inst-5"),
        ).rejects.toThrow(/expired/i);
    });

    it("get_login_status reports has_token and refreshable", async () => {
        const vault = create_vault();
        await vault.set("grok-inst-1:OAUTH_TOKEN", "access-abc");
        await vault.set("grok-inst-1:OAUTH_REFRESH_TOKEN", "refresh-xyz");
        const future = Date.now() + 3_600_000;
        await vault.set("grok-inst-1:OAUTH_EXPIRES_AT", String(future));

        const manager = create_grok_oauth_manager({
            vault,
            http_post: () => Promise.reject(new Error("no http")),
        });
        const status = await manager.get_login_status("grok-inst-1");

        expect(status.has_token).toBe(true);
        expect(status.can_refresh).toBe(true);
        expect(status.expires_at).toBe(String(future));
    });

    it("get_login_status reports access-only login without refresh capability", async () => {
        const vault = create_vault();
        await vault.set("grok-inst-access-only:OAUTH_TOKEN", "access-abc");
        const future = Date.now() + 3_600_000;
        await vault.set("grok-inst-access-only:OAUTH_EXPIRES_AT", String(future));
        const manager = create_grok_oauth_manager({
            vault,
            http_post: () => Promise.reject(new Error("no http")),
        });

        const status = await manager.get_login_status("grok-inst-access-only");

        expect(status).toEqual({
            has_token: true,
            can_refresh: false,
            expires_at: String(future),
        });
    });

    it("get_login_status reports missing token when vault empty", async () => {
        const vault = create_vault();
        const manager = create_grok_oauth_manager({
            vault,
            http_post: () => Promise.reject(new Error("no http")),
        });

        const status = await manager.get_login_status("grok-inst-9");
        expect(status.has_token).toBe(false);
        expect(status.can_refresh).toBe(false);
        expect(status.expires_at).toBeNull();
    });

    it("coalesces concurrent refresh calls for the same instance", async () => {
        const vault = create_vault();
        await vault.set("grok-inst-race:OAUTH_TOKEN", "access-old");
        await vault.set("grok-inst-race:OAUTH_REFRESH_TOKEN", "refresh-old");
        let resolve_refresh: ((value: unknown) => void) | undefined;
        const refresh_response = new Promise<unknown>((resolve) => {
            resolve_refresh = resolve;
        });
        const http = create_http_mock({
            token: () => refresh_response,
        });
        const manager = create_grok_oauth_manager({ vault, http_post: http.post });

        const first = manager.refresh_now("grok-inst-race");
        const second = manager.refresh_now("grok-inst-race");
        await vi.waitFor(() => {
            expect(http.calls).toHaveLength(1);
        });
        resolve_refresh?.({
            access_token: "access-new",
            refresh_token: "refresh-new",
            expires_in: 3600,
        });

        await expect(Promise.all([first, second])).resolves.toEqual([
            { success: true },
            { success: true },
        ]);
        expect(http.calls).toHaveLength(1);
    });

    it("does not restore tokens when logout completes during refresh", async () => {
        const vault = create_vault();
        await vault.set("grok-inst-logout:OAUTH_TOKEN", "access-old");
        await vault.set("grok-inst-logout:OAUTH_REFRESH_TOKEN", "refresh-old");
        let resolve_refresh: ((value: unknown) => void) | undefined;
        const refresh_response = new Promise<unknown>((resolve) => {
            resolve_refresh = resolve;
        });
        const http = create_http_mock({ token: () => refresh_response });
        const manager = create_grok_oauth_manager({ vault, http_post: http.post });

        const refresh = manager.refresh_now("grok-inst-logout");
        await vi.waitFor(() => {
            expect(http.calls).toHaveLength(1);
        });
        const logout = manager.logout("grok-inst-logout");
        resolve_refresh?.({
            access_token: "access-after-logout",
            refresh_token: "refresh-after-logout",
            expires_in: 3600,
        });
        await logout;
        await refresh;

        await expect(vault.get("grok-inst-logout:OAUTH_TOKEN")).resolves.toBeNull();
        await expect(vault.get("grok-inst-logout:OAUTH_REFRESH_TOKEN")).resolves.toBeNull();
        await expect(vault.get("grok-inst-logout:OAUTH_EXPIRES_AT")).resolves.toBeNull();
    });

    it("does not restore tokens when logout completes during device login", async () => {
        const vault = create_vault();
        let resolve_login: ((value: unknown) => void) | undefined;
        const login_response = new Promise<unknown>((resolve) => {
            resolve_login = resolve;
        });
        const http = create_http_mock({ token: () => login_response });
        const manager = create_grok_oauth_manager({ vault, http_post: http.post });

        const login = manager.await_completion(
            "dc-logout",
            5,
            Date.now() + 1_800_000,
            "grok-inst-login-logout",
        );
        await vi.waitFor(() => {
            expect(http.calls).toHaveLength(1);
        });
        await manager.logout("grok-inst-login-logout");
        resolve_login?.({
            access_token: "access-after-logout",
            refresh_token: "refresh-after-logout",
            expires_in: 3600,
        });

        await expect(login).resolves.toEqual({ saved: false });
        await expect(vault.get("grok-inst-login-logout:OAUTH_TOKEN")).resolves.toBeNull();
        await expect(vault.get("grok-inst-login-logout:OAUTH_REFRESH_TOKEN")).resolves.toBeNull();
        await expect(vault.get("grok-inst-login-logout:OAUTH_EXPIRES_AT")).resolves.toBeNull();
    });

    it("serializes logout after an in-progress device login token write", async () => {
        const vault = create_blocking_token_vault();
        const http = create_http_mock({
            token: () =>
                Promise.resolve({
                    access_token: "access-new",
                    refresh_token: "refresh-new",
                    expires_in: 3600,
                }),
        });
        const manager = create_grok_oauth_manager({ vault, http_post: http.post });

        const login = manager.await_completion(
            "dc-mutation-race",
            5,
            Date.now() + 1_800_000,
            "grok-inst-mutation-race",
        );
        await vault.first_token_set_started;
        const logout = manager.logout("grok-inst-mutation-race");
        let logout_finished = false;
        void logout.then(() => {
            logout_finished = true;
        });
        await Promise.resolve();

        expect(logout_finished).toBe(false);
        vault.release_first_token_set();
        await login;
        await logout;

        expect(vault.values.size).toBe(0);
    });

    it("serializes logout after an in-progress refresh token rotation write", async () => {
        const vault = create_blocking_token_vault();
        vault.values.set("grok-inst-refresh-mutation:OAUTH_TOKEN", "access-old");
        vault.values.set("grok-inst-refresh-mutation:OAUTH_REFRESH_TOKEN", "refresh-old");
        const http = create_http_mock({
            token: () =>
                Promise.resolve({
                    access_token: "access-new",
                    refresh_token: "refresh-new",
                    expires_in: 3600,
                }),
        });
        const manager = create_grok_oauth_manager({ vault, http_post: http.post });

        const refresh = manager.refresh_now("grok-inst-refresh-mutation");
        await vault.first_token_set_started;
        const logout = manager.logout("grok-inst-refresh-mutation");
        vault.release_first_token_set();
        await refresh;
        await logout;

        expect(vault.values.size).toBe(0);
    });

    it("reconciles auto-refresh to the active instance set", async () => {
        const vault = create_vault();
        for (const instance_id of ["grok-active", "grok-disabled", "grok-new"]) {
            await vault.set(`${instance_id}:OAUTH_TOKEN`, `access-${instance_id}`);
            await vault.set(`${instance_id}:OAUTH_REFRESH_TOKEN`, `refresh-${instance_id}`);
            await vault.set(`${instance_id}:OAUTH_EXPIRES_AT`, String(Date.now() - 1));
        }
        const http = create_http_mock({
            token: () =>
                Promise.resolve({
                    access_token: "access-new",
                    refresh_token: "refresh-new",
                    expires_in: 3600,
                }),
        });
        const manager = create_grok_oauth_manager({ vault, http_post: http.post });

        manager.reconcile_auto_refresh(["grok-active", "grok-disabled"]);
        await vi.advanceTimersByTimeAsync(0);
        manager.reconcile_auto_refresh(["grok-active", "grok-new"]);
        await vi.advanceTimersByTimeAsync(1000);

        expect(http.calls.map((call) => call.body)).toEqual(
            expect.arrayContaining([
                expect.stringContaining("refresh_token=refresh-grok-active"),
                expect.stringContaining("refresh_token=refresh-grok-new"),
            ]),
        );
        expect(http.calls.some((call) => call.body.includes("refresh-grok-disabled"))).toBe(false);
        manager.shutdown();
    });

    it("refresh_now calls token endpoint with refresh_token grant and rotates tokens", async () => {
        const vault = create_vault();
        await vault.set("grok-inst-1:OAUTH_TOKEN", "access-old");
        await vault.set("grok-inst-1:OAUTH_REFRESH_TOKEN", "refresh-old");
        await vault.set("grok-inst-1:OAUTH_EXPIRES_AT", String(Date.now() - 1_000));

        const http = create_http_mock({
            token: (body) => {
                expect(body).toContain("grant_type=refresh_token");
                expect(body).toContain("refresh_token=refresh-old");
                expect(body).toContain(`client_id=${GROK_CLIENT_ID}`);
                expect(body).toContain(`scope=${encodeURIComponent(GROK_SCOPE)}`);
                return Promise.resolve({
                    access_token: "access-new",
                    refresh_token: "refresh-new",
                    expires_in: 3600,
                    token_type: "Bearer",
                });
            },
        });
        const manager = create_grok_oauth_manager({ vault, http_post: http.post });

        const result = await manager.refresh_now("grok-inst-1");
        expect(result.success).toBe(true);

        // Refresh token rotation: new refresh_token should be stored.
        await expect(vault.get("grok-inst-1:OAUTH_TOKEN")).resolves.toBe("access-new");
        await expect(vault.get("grok-inst-1:OAUTH_REFRESH_TOKEN")).resolves.toBe("refresh-new");
    });

    it("refresh_now returns failure when no refresh_token stored", async () => {
        const vault = create_vault();
        const manager = create_grok_oauth_manager({
            vault,
            http_post: () => Promise.reject(new Error("should not call http")),
        });

        const result = await manager.refresh_now("grok-inst-2");
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/no refresh_token/i);
    });

    it("refresh_now returns failure on invalid_grant", async () => {
        const vault = create_vault();
        await vault.set("grok-inst-3:OAUTH_TOKEN", "access-old");
        await vault.set("grok-inst-3:OAUTH_REFRESH_TOKEN", "refresh-expired");

        const http = create_http_mock({
            token: () =>
                Promise.resolve({
                    error: "invalid_grant",
                    error_description: "refresh_token_expired",
                }),
        });
        const manager = create_grok_oauth_manager({ vault, http_post: http.post });

        const result = await manager.refresh_now("grok-inst-3");
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/invalid_grant/);
    });

    it("refresh_now clears stored tokens on invalid_grant (rotation-broken)", async () => {
        const vault = create_vault();
        await vault.set("grok-inst-4:OAUTH_TOKEN", "access-old");
        await vault.set("grok-inst-4:OAUTH_REFRESH_TOKEN", "refresh-dead");
        await vault.set("grok-inst-4:OAUTH_EXPIRES_AT", "12345");

        const http = create_http_mock({
            token: () => Promise.resolve({ error: "invalid_grant" }),
        });
        const manager = create_grok_oauth_manager({ vault, http_post: http.post });

        await manager.refresh_now("grok-inst-4");

        await expect(vault.get("grok-inst-4:OAUTH_TOKEN")).resolves.toBeNull();
        await expect(vault.get("grok-inst-4:OAUTH_REFRESH_TOKEN")).resolves.toBeNull();
        await expect(vault.get("grok-inst-4:OAUTH_EXPIRES_AT")).resolves.toBeNull();
    });

    it("logout clears all OAuth entries from vault", async () => {
        const vault = create_vault();
        await vault.set("grok-inst-1:OAUTH_TOKEN", "access");
        await vault.set("grok-inst-1:OAUTH_REFRESH_TOKEN", "refresh");
        await vault.set("grok-inst-1:OAUTH_EXPIRES_AT", "12345");

        const manager = create_grok_oauth_manager({
            vault,
            http_post: () => Promise.reject(new Error("no http")),
        });
        await manager.logout("grok-inst-1");

        await expect(vault.get("grok-inst-1:OAUTH_TOKEN")).resolves.toBeNull();
        await expect(vault.get("grok-inst-1:OAUTH_REFRESH_TOKEN")).resolves.toBeNull();
        await expect(vault.get("grok-inst-1:OAUTH_EXPIRES_AT")).resolves.toBeNull();
    });

    it("auto-refreshes at expires_at minus the refresh margin", async () => {
        const vault = create_vault();
        await vault.set("grok-inst-1:OAUTH_TOKEN", "access-old");
        await vault.set("grok-inst-1:OAUTH_REFRESH_TOKEN", "refresh-old");
        await vault.set("grok-inst-1:OAUTH_EXPIRES_AT", String(Date.now() + 3_600_000));

        let refresh_count = 0;
        const http = create_http_mock({
            token: () => {
                refresh_count++;
                return Promise.resolve({
                    access_token: "access-new",
                    refresh_token: "refresh-new",
                    expires_in: 3600,
                    token_type: "Bearer",
                });
            },
        });
        const manager = create_grok_oauth_manager({ vault, http_post: http.post });

        manager.reconcile_auto_refresh(["grok-inst-1"]);
        await vi.advanceTimersByTimeAsync(3_299_999);
        expect(refresh_count).toBe(0);
        await vi.advanceTimersByTimeAsync(1);

        expect(refresh_count).toBe(1);
        manager.shutdown();
    });

    it("replans auto-refresh from the rotated token expiry", async () => {
        const vault = create_vault();
        await vault.set("grok-inst-replan:OAUTH_TOKEN", "access-old");
        await vault.set("grok-inst-replan:OAUTH_REFRESH_TOKEN", "refresh-old");
        await vault.set("grok-inst-replan:OAUTH_EXPIRES_AT", String(Date.now() + 600_000));

        let refresh_count = 0;
        const http = create_http_mock({
            token: () => {
                refresh_count++;
                return Promise.resolve({
                    access_token: `access-${String(refresh_count)}`,
                    refresh_token: `refresh-${String(refresh_count)}`,
                    expires_in: 1200,
                    token_type: "Bearer",
                });
            },
        });
        const manager = create_grok_oauth_manager({ vault, http_post: http.post });

        manager.reconcile_auto_refresh(["grok-inst-replan"]);
        await vi.advanceTimersByTimeAsync(300_000);
        expect(refresh_count).toBe(1);
        await vi.advanceTimersByTimeAsync(899_999);
        expect(refresh_count).toBe(1);
        await vi.advanceTimersByTimeAsync(1);

        expect(refresh_count).toBe(2);
        manager.shutdown();
    });

    it("resumes auto-refresh after logout and device login for an enabled instance", async () => {
        const vault = create_vault();
        await vault.set("grok-inst-relogin:OAUTH_TOKEN", "access-old");
        await vault.set("grok-inst-relogin:OAUTH_REFRESH_TOKEN", "refresh-old");
        await vault.set("grok-inst-relogin:OAUTH_EXPIRES_AT", String(Date.now() + 600_000));

        let refresh_count = 0;
        const http = create_http_mock({
            token: (body) => {
                if (body.includes("device_code=device-relogin")) {
                    return Promise.resolve({
                        access_token: "access-login",
                        refresh_token: "refresh-login",
                        expires_in: 600,
                    });
                }
                refresh_count++;
                return Promise.resolve({
                    access_token: "access-refreshed",
                    refresh_token: "refresh-refreshed",
                    expires_in: 3600,
                });
            },
        });
        const manager = create_grok_oauth_manager({ vault, http_post: http.post });

        manager.reconcile_auto_refresh(["grok-inst-relogin"]);
        await manager.logout("grok-inst-relogin");
        await manager.await_completion(
            "device-relogin",
            5,
            Date.now() + 1_800_000,
            "grok-inst-relogin",
        );
        await vi.advanceTimersByTimeAsync(299_999);
        expect(refresh_count).toBe(0);
        await vi.advanceTimersByTimeAsync(1);

        expect(refresh_count).toBe(1);
        manager.shutdown();
    });

    it("resumes auto-refresh after terminal refresh failure and device login", async () => {
        const vault = create_vault();
        await vault.set("grok-inst-terminal:OAUTH_TOKEN", "access-old");
        await vault.set("grok-inst-terminal:OAUTH_REFRESH_TOKEN", "refresh-dead");
        await vault.set("grok-inst-terminal:OAUTH_EXPIRES_AT", String(Date.now() - 1));

        let refresh_count = 0;
        const http = create_http_mock({
            token: (body) => {
                if (body.includes("device_code=device-terminal")) {
                    return Promise.resolve({
                        access_token: "access-login",
                        refresh_token: "refresh-login",
                        expires_in: 600,
                    });
                }
                refresh_count++;
                if (refresh_count === 1) {
                    return Promise.resolve({ error: "invalid_grant" });
                }
                return Promise.resolve({
                    access_token: "access-refreshed",
                    refresh_token: "refresh-refreshed",
                    expires_in: 3600,
                });
            },
        });
        const manager = create_grok_oauth_manager({ vault, http_post: http.post });

        manager.reconcile_auto_refresh(["grok-inst-terminal"]);
        await vi.advanceTimersByTimeAsync(1000);
        expect(refresh_count).toBe(1);
        await manager.await_completion(
            "device-terminal",
            5,
            Date.now() + 1_800_000,
            "grok-inst-terminal",
        );
        await vi.advanceTimersByTimeAsync(300_000);

        expect(refresh_count).toBe(2);
        manager.shutdown();
    });

    it("does not resume auto-refresh when an instance is disabled during device login", async () => {
        const vault = create_vault();
        let resolve_login: ((value: unknown) => void) | undefined;
        const login_response = new Promise<unknown>((resolve) => {
            resolve_login = resolve;
        });
        let refresh_count = 0;
        const http = create_http_mock({
            token: (body) => {
                if (body.includes("device_code=device-disabled")) return login_response;
                refresh_count++;
                return Promise.resolve({
                    access_token: "access-refreshed",
                    refresh_token: "refresh-refreshed",
                    expires_in: 3600,
                });
            },
        });
        const manager = create_grok_oauth_manager({ vault, http_post: http.post });
        manager.reconcile_auto_refresh(["grok-inst-disabled-login"]);

        const login = manager.await_completion(
            "device-disabled",
            5,
            Date.now() + 1_800_000,
            "grok-inst-disabled-login",
        );
        await vi.waitFor(() => {
            expect(http.calls).toHaveLength(1);
        });
        manager.reconcile_auto_refresh([]);
        resolve_login?.({
            access_token: "access-login",
            refresh_token: "refresh-login",
            expires_in: 1,
        });
        await login;
        await vi.advanceTimersByTimeAsync(60_000);

        expect(refresh_count).toBe(0);
        manager.shutdown();
    });

    it("start_auto_refresh keeps only one pending refresh", async () => {
        const vault = create_vault();
        await vault.set("grok-inst-1:OAUTH_TOKEN", "access");
        await vault.set("grok-inst-1:OAUTH_REFRESH_TOKEN", "refresh");
        await vault.set("grok-inst-1:OAUTH_EXPIRES_AT", String(Date.now() - 1));

        let refresh_count = 0;
        const http = create_http_mock({
            token: () => {
                refresh_count++;
                return Promise.resolve({
                    access_token: "access",
                    refresh_token: "refresh",
                    expires_in: 3600,
                    token_type: "Bearer",
                });
            },
        });
        const manager = create_grok_oauth_manager({ vault, http_post: http.post });

        manager.start_auto_refresh("grok-inst-1");
        manager.start_auto_refresh("grok-inst-1");
        await vi.advanceTimersByTimeAsync(1000);
        manager.stop_auto_refresh("grok-inst-1");

        expect(refresh_count).toBe(1);
    });

    it("caps long auto-refresh delays and replans without refreshing early", async () => {
        const vault = create_vault();
        await vault.set("grok-inst-long:OAUTH_TOKEN", "access");
        await vault.set("grok-inst-long:OAUTH_REFRESH_TOKEN", "refresh");
        await vault.set(
            "grok-inst-long:OAUTH_EXPIRES_AT",
            String(Date.now() + 2_147_483_647 + 600_000),
        );
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
        const manager = create_grok_oauth_manager({ vault, http_post: http.post });

        manager.reconcile_auto_refresh(["grok-inst-long"]);
        await vi.advanceTimersByTimeAsync(2_147_483_647);
        expect(refresh_count).toBe(0);
        await vi.advanceTimersByTimeAsync(299_999);
        expect(refresh_count).toBe(0);
        await vi.advanceTimersByTimeAsync(1);

        expect(refresh_count).toBe(1);
        manager.shutdown();
    });

    it("shutdown stops all auto-refresh timers", async () => {
        const vault = create_vault();
        await vault.set("grok-inst-1:OAUTH_TOKEN", "access");
        await vault.set("grok-inst-1:OAUTH_REFRESH_TOKEN", "refresh");
        await vault.set("grok-inst-1:OAUTH_EXPIRES_AT", String(Date.now() + 60_000));

        let refresh_count = 0;
        const http = create_http_mock({
            token: () => {
                refresh_count++;
                return Promise.resolve({
                    access_token: "access",
                    refresh_token: "refresh",
                    expires_in: 1,
                    token_type: "Bearer",
                });
            },
        });
        const manager = create_grok_oauth_manager({ vault, http_post: http.post });

        manager.start_auto_refresh("grok-inst-1");
        await vi.advanceTimersByTimeAsync(500);
        manager.shutdown();
        const count_after_shutdown = refresh_count;
        await vi.advanceTimersByTimeAsync(5000);

        expect(refresh_count).toBe(count_after_shutdown);
    });

    it("start_auto_refresh does nothing when no refresh_token in vault", async () => {
        const vault = create_vault();
        let http_called = false;
        const http = create_http_mock({
            token: () => {
                http_called = true;
                return Promise.resolve({
                    access_token: "x",
                    refresh_token: "y",
                    expires_in: 3600,
                    token_type: "Bearer",
                });
            },
        });
        const manager = create_grok_oauth_manager({ vault, http_post: http.post });

        manager.start_auto_refresh("grok-inst-no-token");
        await vi.advanceTimersByTimeAsync(3500);
        manager.shutdown();

        expect(http_called).toBe(false);
    });
});
