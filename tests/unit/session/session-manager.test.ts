import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
    create_session_manager,
    is_valid_opencode_login,
} from "../../../src/main/core/session/session-manager";
import type {
    SessionCookie,
    SessionManagerDeps,
    SessionWindow,
} from "../../../src/main/core/session/session-manager";
import type { VaultBackend } from "../../../src/main/core/vault/vault-backend";

class MockWindow extends EventEmitter implements SessionWindow {
    readonly loaded_urls: string[] = [];
    closed = false;
    fail_load_with?: Error;
    /** t492: kimi_web 登录窗 localStorage（refresh_token 来源）。 */
    readonly local_storage: Record<string, string> = {};
    readonly read_local_storage_keys: string[] = [];
    read_local_storage_fails = false;

    loadURL(url: string): Promise<void> {
        this.loaded_urls.push(url);
        if (this.fail_load_with) {
            return Promise.reject(this.fail_load_with);
        }
        return Promise.resolve();
    }

    close(): void {
        this.closed = true;
        this.emit("closed");
    }

    isDestroyed(): boolean {
        return this.closed;
    }

    read_local_storage(key: string): Promise<string | null> {
        this.read_local_storage_keys.push(key);
        // 真实宿主（Electron）在窗口销毁后 executeJavaScript 必然失败——mock 同样
        // 拒绝，以覆盖「必须在窗口存活时读取」这一约束（t492 code review f001）。
        if (this.closed) {
            return Promise.reject(new Error("Object has been destroyed"));
        }
        if (this.read_local_storage_fails) {
            return Promise.reject(new Error("page navigated away"));
        }
        return Promise.resolve(this.local_storage[key] ?? null);
    }
}

function create_vault(): VaultBackend & { values: Map<string, string>; fail_next_set?: boolean } {
    const values = new Map<string, string>();
    return {
        values,
        get(key: string) {
            return Promise.resolve(values.get(key) ?? null);
        },
        set(key: string, value: string) {
            if (this.fail_next_set) {
                this.fail_next_set = false;
                return Promise.reject(new Error("vault write failed"));
            }
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
        replaceAll(entries: Record<string, string>) {
            values.clear();
            for (const [key, value] of Object.entries(entries)) values.set(key, value);
            return Promise.resolve();
        },
    };
}

interface TestDeps extends SessionManagerDeps {
    readonly window: MockWindow;
    readonly partitions: string[];
    readonly cookie_urls: string[];
    /** 注入的 cookie 有效性探测（t337）。 */
    readonly verify_cookie: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
    emit_before_send_headers(
        url: string,
        requestHeaders: Record<string, string>,
        resource_type?: string,
    ): void;
}

function create_deps(cookies: SessionCookie[] = []): TestDeps {
    const window = new MockWindow();
    const partitions: string[] = [];
    const cookie_urls: string[] = [];
    let before_send_headers:
        | ((details: {
              url: string;
              requestHeaders: Record<string, string>;
              resource_type: string;
          }) => void)
        | null = null;

    return {
        window,
        partitions,
        cookie_urls,
        vault: create_vault(),
        verify_cookie: vi.fn().mockResolvedValue(true),
        create_window(partition: string) {
            partitions.push(`window:${partition}`);
            return window;
        },
        create_session(partition: string) {
            partitions.push(`session:${partition}`);
            return {
                on_before_send_headers(handler) {
                    before_send_headers = handler;
                },
                get_cookies(url: string) {
                    cookie_urls.push(url);
                    return Promise.resolve(cookies);
                },
            };
        },
        emit_before_send_headers(
            url: string,
            requestHeaders: Record<string, string>,
            resource_type = "xhr",
        ) {
            before_send_headers?.({ url, requestHeaders, resource_type });
        },
    };
}

describe("session-manager", () => {
    it("rejects an invalid login URL before acquiring session resources", async () => {
        const deps = create_deps();
        const manager = create_session_manager(deps);

        await expect(
            manager.start_login({
                instance_id: "mimo-1",
                provider: "mimo",
                login_url: "not a URL",
                cookie_names: ["token"],
            }),
        ).rejects.toThrow("Invalid login URL");

        expect(deps.window.loaded_urls).toEqual([]);
        expect(deps.partitions).toEqual([]);
    });

    it("opens login URL in controlled window", async () => {
        const deps = create_deps();
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "mimo-1",
            provider: "mimo",
            login_url: "https://example.com/login",
            cookie_names: ["token"],
        });
        deps.window.close();
        await promise;

        expect(deps.window.loaded_urls).toEqual(["https://example.com/login"]);
    });

    it("uses an instance-scoped persistent partition persist:session-login:<instance_id> for login window and cookie capture", async () => {
        const deps = create_deps();
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "opencode-go-1",
            provider: "opencode_go",
            login_url: "https://opencode.ai/auth",
            cookie_names: ["session"],
        });
        deps.window.close();
        await promise;

        expect(deps.partitions).toEqual([
            `window:persist:session-login:opencode-go-1`,
            `session:persist:session-login:opencode-go-1`,
        ]);
    });

    it("saves captured Cookie header on window close", async () => {
        const deps = create_deps();
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "mimo-1",
            provider: "mimo",
            login_url: "https://example.com/login",
            cookie_names: ["token"],
        });
        deps.emit_before_send_headers("https://example.com/api/v1/user", {
            Cookie: "token=abc; other=1",
        });
        deps.window.close();

        await expect(promise).resolves.toEqual({ saved: true });
        await expect(deps.vault.get("mimo-1:SESSION_COOKIE")).resolves.toBe("token=abc");
    });

    it("cookie 保存失败返回可读错误（t367 AC-003）", async () => {
        const deps = create_deps();
        const vault = deps.vault as unknown as {
            fail_next_set: boolean;
        };
        vault.fail_next_set = true;
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "mimo-1",
            provider: "mimo",
            login_url: "https://example.com/login",
            cookie_names: ["token"],
        });
        deps.emit_before_send_headers("https://example.com/api/v1/user", {
            Cookie: "token=abc; other=1",
        });
        deps.window.close();

        // cookie 已捕获但保存失败——错误信息可区分「未捕获」与「保存失败」。
        await expect(promise).rejects.toThrow("登录成功但保存失败，请重试");
    });

    it("captures OpenCode Go _server Cookie header", async () => {
        const deps = create_deps();
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "opencode-go-1",
            provider: "opencode_go",
            login_url: "https://opencode.ai/auth",
            cookie_names: ["session"],
        });
        deps.emit_before_send_headers("https://opencode.ai/_server?id=abc", {
            Cookie: "session=abc; other=1",
        });
        deps.window.close();

        await expect(promise).resolves.toEqual({ saved: true });
        await expect(deps.vault.get("opencode-go-1:SESSION_COOKIE")).resolves.toBe("session=abc");
    });

    // t492: kimi_web 的 Bearer 15 分钟过期，续期材料（refresh token）只在页面
    // localStorage，登录成功时一并捕获入库，否则运行期无从续期。
    it("t492: kimi_web 登录捕获把 localStorage 的 refresh_token 一并入库", async () => {
        const deps = create_deps();
        deps.window.local_storage["refresh_token"] = "refresh-token-value";
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "kimi-web-1",
            provider: "kimi_web",
            login_url: "https://www.kimi.com/settings/subscription?tab=quota",
            cookie_names: ["*"],
        });
        deps.emit_before_send_headers("https://www.kimi.com/apiv2/UserService/GetCurrentUser", {
            Cookie: "kimi_session=abc",
            Authorization: "Bearer access-token",
            "x-msh-session-id": "session-id",
            "x-msh-device-id": "device-id",
        });
        deps.window.close();

        await expect(promise).resolves.toEqual({ saved: true });
        expect(deps.window.read_local_storage_keys).toEqual(["refresh_token"]);
        const saved = await deps.vault.get("kimi-web-1:SESSION_COOKIE");
        expect(JSON.parse(saved ?? "{}")).toEqual({
            cookie: "kimi_session=abc",
            authorization: "Bearer access-token",
            session_id: "session-id",
            device_id: "device-id",
            refresh_token: "refresh-token-value",
        });
    });

    it("t492: kimi_web 读不到 refresh_token 时不阻塞登录（字段为 null）", async () => {
        const deps = create_deps();
        deps.window.read_local_storage_fails = true;
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "kimi-web-2",
            provider: "kimi_web",
            login_url: "https://www.kimi.com/settings/subscription?tab=quota",
            cookie_names: ["*"],
        });
        deps.emit_before_send_headers("https://www.kimi.com/apiv2/UserService/GetCurrentUser", {
            Cookie: "kimi_session=abc",
            Authorization: "Bearer access-token",
        });
        deps.window.close();

        await expect(promise).resolves.toEqual({ saved: true });
        const saved = await deps.vault.get("kimi-web-2:SESSION_COOKIE");
        expect(JSON.parse(saved ?? "{}")).toMatchObject({
            cookie: "kimi_session=abc",
            authorization: "Bearer access-token",
            refresh_token: null,
        });
    });

    // p239: 自动重登（close_when_credential_refreshed）下，窗口何时关取决于页面
    // 是否真的换到了新 Bearer——无人值守不能等用户关窗（120s 超时会丢凭据），
    // 会话失效时必须留着窗口让用户扫码。
    it("p239: 自动重登捕获到不同的 Bearer 即关窗并落库", async () => {
        const deps = create_deps();
        await deps.vault.set(
            "kimi-web-auto-1:SESSION_COOKIE",
            JSON.stringify({ authorization: "Bearer stale-token" }),
        );
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "kimi-web-auto-1",
            provider: "kimi_web",
            login_url: "https://www.kimi.com/settings/subscription?tab=quota",
            cookie_names: ["*"],
            close_when_credential_refreshed: true,
        });
        deps.emit_before_send_headers("https://www.kimi.com/apiv2/UserService/GetCurrentUser", {
            Cookie: "kimi_session=abc",
            Authorization: "Bearer fresh-token",
        });

        await expect(promise).resolves.toEqual({ saved: true });
        expect(deps.window.closed).toBe(true);
        const saved = await deps.vault.get("kimi-web-auto-1:SESSION_COOKIE");
        expect(JSON.parse(saved ?? "{}")).toMatchObject({
            authorization: "Bearer fresh-token",
            cookie: "kimi_session=abc",
        });
    });

    it("p239: 自动重登捕获的 Bearer 与已存凭据相同则保持窗口打开（等用户扫码）", async () => {
        const deps = create_deps();
        await deps.vault.set(
            "kimi-web-auto-2:SESSION_COOKIE",
            JSON.stringify({ authorization: "Bearer stale-token" }),
        );
        const manager = create_session_manager(deps, { timeout_ms: 60_000 });

        const promise = manager.start_login({
            instance_id: "kimi-web-auto-2",
            provider: "kimi_web",
            login_url: "https://www.kimi.com/settings/subscription?tab=quota",
            cookie_names: ["*"],
            close_when_credential_refreshed: true,
        });
        deps.emit_before_send_headers("https://www.kimi.com/apiv2/UserService/GetCurrentUser", {
            Cookie: "kimi_session=abc",
            Authorization: "Bearer stale-token",
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(deps.window.closed).toBe(false);
        deps.window.close();
        await expect(promise).resolves.toEqual({ saved: true });
    });

    it("p239: 手动登录（无该标志）即使用户换到新 Bearer 也不自动关窗", async () => {
        const deps = create_deps();
        await deps.vault.set(
            "kimi-web-manual-1:SESSION_COOKIE",
            JSON.stringify({ authorization: "Bearer stale-token" }),
        );
        const manager = create_session_manager(deps, { timeout_ms: 60_000 });

        const promise = manager.start_login({
            instance_id: "kimi-web-manual-1",
            provider: "kimi_web",
            login_url: "https://www.kimi.com/settings/subscription?tab=quota",
            cookie_names: ["*"],
        });
        deps.emit_before_send_headers("https://www.kimi.com/apiv2/UserService/GetCurrentUser", {
            Cookie: "kimi_session=abc",
            Authorization: "Bearer fresh-token",
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(deps.window.closed).toBe(false);
        deps.window.close();
        await expect(promise).resolves.toEqual({ saved: true });
    });

    it("t492: 非 kimi_web 登录不读取页面 localStorage（凭据仍是纯 cookie）", async () => {
        const deps = create_deps();
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "mimo-2",
            provider: "mimo",
            login_url: "https://platform.xiaomimimo.com/console/plan-manage",
            cookie_names: ["token"],
        });
        deps.emit_before_send_headers("https://platform.xiaomimimo.com/console/plan-manage", {
            Cookie: "token=abc",
        });
        deps.window.close();

        await expect(promise).resolves.toEqual({ saved: true });
        expect(deps.window.read_local_storage_keys).toEqual([]);
        await expect(deps.vault.get("mimo-2:SESSION_COOKIE")).resolves.toBe("token=abc");
    });

    it("returns captured Cookie without writing vault after anonymous wildcard login returns", async () => {
        const deps = create_deps();
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            provider: "opencode_go",
            login_url: "https://opencode.ai/auth",
            cookie_names: ["*"],
        });
        deps.emit_before_send_headers(
            "https://auth.opencode.ai/authorize?client_id=app",
            {},
            "mainFrame",
        );
        deps.emit_before_send_headers(
            "https://opencode.ai/workspace/workspace-1",
            { Cookie: "session=abc; __Host-session=def" },
            "mainFrame",
        );
        deps.window.close();

        await expect(promise).resolves.toEqual({
            saved: true,
            cookie: "session=abc; __Host-session=def",
        });
        expect((deps.vault as ReturnType<typeof create_vault>).values).toEqual(new Map());
        expect(deps.window.loaded_urls).toEqual(["https://opencode.ai/auth"]);
        expect(deps.partitions[0]).toMatch(/^window:session-login:anonymous:/);
        expect(deps.partitions[1]).toMatch(/^session:session-login:anonymous:/);
    });

    it("does not accept initial anonymous Cookie before wildcard login returns", async () => {
        const deps = create_deps();
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            provider: "opencode_go",
            login_url: "https://opencode.ai/auth",
            cookie_names: ["*"],
        });
        deps.emit_before_send_headers("https://opencode.ai/_server?id=abc", {
            Cookie: "auth=anonymous",
        });
        deps.window.close();

        await expect(promise).resolves.toEqual({ saved: false, reason: "no_cookie" });
        expect((deps.vault as ReturnType<typeof create_vault>).values).toEqual(new Map());
    });

    it("does not accept wildcard Cookie after leaving for IdP without returning", async () => {
        const deps = create_deps();
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            provider: "opencode_go",
            login_url: "https://opencode.ai/auth",
            cookie_names: ["*"],
        });
        deps.emit_before_send_headers(
            "https://auth.opencode.ai/authorize?client_id=app",
            {},
            "mainFrame",
        );
        deps.emit_before_send_headers("https://opencode.ai/_server?id=abc", {
            Cookie: "auth=anonymous",
        });
        deps.window.close();

        await expect(promise).resolves.toEqual({ saved: false, reason: "no_cookie" });
    });

    it("does not unlock wildcard Cookie capture for cross-origin subresources", async () => {
        const deps = create_deps();
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            provider: "opencode_go",
            login_url: "https://opencode.ai/auth",
            cookie_names: ["*"],
        });
        deps.emit_before_send_headers(
            "https://auth.opencode.ai/authorize?client_id=app",
            {},
            "script",
        );
        deps.emit_before_send_headers("https://opencode.ai/_server?id=abc", {
            Cookie: "auth=anonymous",
        });
        deps.window.close();

        await expect(promise).resolves.toEqual({ saved: false, reason: "no_cookie" });
    });

    it("ignores third-party OpenCode Go _server Cookie headers", async () => {
        const deps = create_deps();
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "opencode-go-1",
            provider: "opencode_go",
            login_url: "https://opencode.ai/auth",
            cookie_names: ["session"],
        });
        deps.emit_before_send_headers("https://opencode.ai/_server?id=abc", {
            Cookie: "session=abc",
        });
        deps.emit_before_send_headers("https://tracker.example/_server/ping", {
            Cookie: "tid=secret",
        });
        deps.window.close();

        await expect(promise).resolves.toEqual({ saved: true });
        await expect(deps.vault.get("opencode-go-1:SESSION_COOKIE")).resolves.toBe("session=abc");
    });

    it("ignores third-party api/v1 Cookie headers after capturing login origin cookie", async () => {
        const deps = create_deps();
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "opencode-go-1",
            provider: "opencode_go",
            login_url: "https://opencode.ai/auth",
            cookie_names: ["session"],
        });
        deps.emit_before_send_headers("https://opencode.ai/api/v1/user", {
            Cookie: "session=first-party",
        });
        deps.emit_before_send_headers("https://tracker.example/api/v1/pixel", {
            Cookie: "tracker=third-party",
        });
        deps.window.close();

        await expect(promise).resolves.toEqual({ saved: true });
        await expect(deps.vault.get("opencode-go-1:SESSION_COOKIE")).resolves.toBe(
            "session=first-party",
        );
    });

    it("captures cookie from any same-origin path, not just /api/v1/ or /_server (D5)", async () => {
        const deps = create_deps();
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "mimo-1",
            provider: "mimo",
            login_url: "https://example.com/login",
            cookie_names: ["token"],
        });
        // A non-allowlisted path on the login origin must still be captured so
        // session connectors whose callback does not hit /api/v1/ or /_server work.
        deps.emit_before_send_headers("https://example.com/dashboard", {
            Cookie: "token=abc",
        });
        deps.window.close();

        await expect(promise).resolves.toEqual({ saved: true });
        await expect(deps.vault.get("mimo-1:SESSION_COOKIE")).resolves.toBe("token=abc");
    });

    it("does not fall back to cookie jar when captured header has no requested cookies (P0-5)", async () => {
        // Cookie jar has matching cookies, but they must NOT be used — only
        // cookies captured from the request header count.
        const deps = create_deps([{ name: "token", value: "from-jar" }]);
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "mimo-1",
            provider: "mimo",
            login_url: "https://example.com/login",
            cookie_names: ["token"],
        });
        deps.emit_before_send_headers("https://example.com/api/v1/user", {
            Cookie: "tracker=third-party",
        });
        deps.window.close();

        await expect(promise).resolves.toEqual({ saved: false, reason: "no_cookie" });
        await expect(deps.vault.has("mimo-1:SESSION_COOKIE")).resolves.toBe(false);
        // cookie jar 不应被查询
        expect(deps.cookie_urls).toEqual([]);
    });

    it("does not fall back to cookie jar on close when nothing captured (P0-5)", async () => {
        const deps = create_deps([
            { name: "token", value: "abc" },
            { name: "ignored", value: "no" },
            { name: "userId", value: "42" },
        ]);
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "mimo-1",
            provider: "mimo",
            login_url: "https://example.com/login",
            cookie_names: ["token", "userId"],
        });
        deps.window.close();

        await expect(promise).resolves.toEqual({ saved: false, reason: "no_cookie" });
        await expect(deps.vault.has("mimo-1:SESSION_COOKIE")).resolves.toBe(false);
        expect(deps.cookie_urls).toEqual([]);
    });

    it("does not fall back to cookie jar even when wildcard is requested (P0-5)", async () => {
        const deps = create_deps([
            { name: "session_token", value: "abc" },
            { name: "auth", value: "xyz" },
        ]);
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "opencode-go-1",
            provider: "opencode_go",
            login_url: "https://opencode.ai/auth",
            cookie_names: ["*"],
        });
        deps.window.close();

        await expect(promise).resolves.toEqual({ saved: false, reason: "no_cookie" });
        await expect(deps.vault.has("opencode-go-1:SESSION_COOKIE")).resolves.toBe(false);
        expect(deps.cookie_urls).toEqual([]);
    });

    it("returns saved false when no cookies are captured", async () => {
        const deps = create_deps([{ name: "ignored", value: "no" }]);
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "mimo-1",
            provider: "mimo",
            login_url: "https://example.com/login",
            cookie_names: ["token"],
        });
        deps.window.close();

        await expect(promise).resolves.toEqual({ saved: false, reason: "no_cookie" });
        await expect(deps.vault.has("mimo-1:SESSION_COOKIE")).resolves.toBe(false);
    });

    it("closes window and rejects on timeout", async () => {
        vi.useFakeTimers();
        try {
            const deps = create_deps();
            const manager = create_session_manager(deps, { timeout_ms: 100 });

            const promise = manager.start_login({
                instance_id: "mimo-1",
                provider: "mimo",
                login_url: "https://example.com/login",
                cookie_names: ["token"],
            });
            const expectation = expect(promise).rejects.toThrow("Login timed out");
            await vi.advanceTimersByTimeAsync(100);

            await expectation;
            expect(deps.window.closed).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });

    it("closes window when loadURL fails (A4)", async () => {
        const deps = create_deps();
        deps.window.fail_load_with = new Error("ERR_FAILED");
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "mimo-1",
            provider: "mimo",
            login_url: "https://example.com/login",
            cookie_names: ["token"],
        });

        await expect(promise).rejects.toThrow("ERR_FAILED");
        expect(deps.window.closed).toBe(true);
    });

    it("clears captured cookie from memory after vault.set fails (E6)", async () => {
        const deps = create_deps();
        const vault = deps.vault as VaultBackend & {
            values: Map<string, string>;
            fail_next_set?: boolean;
        };
        vault.fail_next_set = true;
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "mimo-1",
            provider: "mimo",
            login_url: "https://example.com/login",
            cookie_names: ["token"],
        });
        deps.emit_before_send_headers("https://example.com/api/v1/user", {
            Cookie: "token=secret",
        });
        deps.window.close();

        await expect(promise).rejects.toThrow("vault write failed");
        await expect(deps.vault.get("mimo-1:SESSION_COOKIE")).resolves.toBe(null);
    });

    it("finds Cookie header case-insensitively across variants (B)", async () => {
        const variants = ["cookie", "Cookie", "COOKIE", "CoOkIe"];
        for (const header_key of variants) {
            const deps = create_deps();
            const manager = create_session_manager(deps);

            const promise = manager.start_login({
                instance_id: "mimo-1",
                provider: "mimo",
                login_url: "https://example.com/login",
                cookie_names: ["token"],
            });
            deps.emit_before_send_headers("https://example.com/api/v1/user", {
                [header_key]: "token=abc",
            });
            deps.window.close();

            await expect(promise).resolves.toEqual({ saved: true });
            await expect(deps.vault.get("mimo-1:SESSION_COOKIE")).resolves.toBe("token=abc");
        }
    });

    it("rejects concurrent login for same instance_id without opening a second window (R4)", async () => {
        const deps = create_deps();
        const manager = create_session_manager(deps);

        const first = manager.start_login({
            instance_id: "mimo-1",
            provider: "mimo",
            login_url: "https://example.com/login",
            cookie_names: ["token"],
        });

        const second = manager.start_login({
            instance_id: "mimo-1",
            provider: "mimo",
            login_url: "https://example.com/login",
            cookie_names: ["token"],
        });

        await expect(second).rejects.toThrow(/already in progress/i);
        expect(deps.window.loaded_urls).toEqual(["https://example.com/login"]);

        deps.window.close();
        await first;
    });

    it("auto-closes window after auto_close_ms delay when cookie is captured", async () => {
        vi.useFakeTimers();
        try {
            const deps = create_deps();
            const manager = create_session_manager(deps);

            const promise = manager.start_login({
                instance_id: "mimo-1",
                provider: "mimo",
                login_url: "https://example.com/login",
                cookie_names: ["token"],
                auto_close_ms: 1500,
            });

            deps.emit_before_send_headers("https://example.com/api/v1/user", {
                Cookie: "token=abc",
            });

            expect(deps.window.closed).toBe(false);
            await vi.advanceTimersByTimeAsync(1500);
            expect(deps.window.closed).toBe(true);

            const result = await promise;
            expect(result.saved).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });

    it("does not auto-close when auto_close_ms is set but no cookie captured", async () => {
        vi.useFakeTimers();
        try {
            const deps = create_deps();
            const manager = create_session_manager(deps, { timeout_ms: 5000 });

            const promise = manager.start_login({
                instance_id: "mimo-1",
                provider: "mimo",
                login_url: "https://example.com/login",
                cookie_names: ["token"],
                auto_close_ms: 1500,
            });

            await vi.advanceTimersByTimeAsync(2000);
            expect(deps.window.closed).toBe(false);

            deps.window.close();
            const result = await promise;
            expect(result.saved).toBe(false);
        } finally {
            vi.useRealTimers();
        }
    });

    it("does not auto-close when auto_close_ms is not set even after cookie capture", async () => {
        vi.useFakeTimers();
        try {
            const deps = create_deps();
            const manager = create_session_manager(deps, { timeout_ms: 5000 });

            const promise = manager.start_login({
                instance_id: "mimo-1",
                provider: "mimo",
                login_url: "https://example.com/login",
                cookie_names: ["token"],
            });

            deps.emit_before_send_headers("https://example.com/api/v1/user", {
                Cookie: "token=abc",
            });

            await vi.advanceTimersByTimeAsync(3000);
            expect(deps.window.closed).toBe(false);

            deps.window.close();
            const result = await promise;
            expect(result.saved).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });

    it("rejects interactive login before creating a window when no display is available", async () => {
        const deps = create_deps();
        const manager = create_session_manager({ ...deps, has_display: () => false });

        await expect(
            manager.start_login({
                instance_id: "mimo-1",
                provider: "mimo",
                login_url: "https://example.com/login",
                cookie_names: ["token"],
            }),
        ).rejects.toThrow(/display/i);

        expect(deps.partitions).toEqual([]);
        expect((deps.vault as ReturnType<typeof create_vault>).values).toEqual(new Map());
    });

    it("cookie 未通过有效性校验时不保存（t337 AC-001）", async () => {
        const deps = create_deps();
        deps.verify_cookie.mockResolvedValue(false);
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "opencode-go-1",
            provider: "opencode_go",
            login_url: "https://opencode.ai/auth",
            cookie_names: ["session"],
        });
        deps.emit_before_send_headers("https://opencode.ai/_server?id=abc", {
            Cookie: "session=invalid",
        });
        deps.window.close();

        await expect(promise).resolves.toEqual({ saved: false, reason: "invalid_cookie" });
        await expect(deps.vault.has("opencode-go-1:SESSION_COOKIE")).resolves.toBe(false);
        expect(deps.verify_cookie).toHaveBeenCalledWith(
            "session=invalid",
            "https://opencode.ai/auth",
        );
    });

    it("回跳首请求带匿名 cookie 时有效性校验拦截（t337 AC-002）", async () => {
        const deps = create_deps();
        deps.verify_cookie.mockResolvedValue(false);
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            provider: "opencode_go",
            login_url: "https://opencode.ai/auth",
            cookie_names: ["*"],
        });
        deps.emit_before_send_headers(
            "https://opencode.ai/auth",
            { Cookie: "anon=1" },
            "mainFrame",
        );
        deps.emit_before_send_headers(
            "https://auth.opencode.ai/authorize?client_id=app",
            {},
            "mainFrame",
        );
        deps.emit_before_send_headers(
            "https://opencode.ai/auth/callback?code=abc",
            { Cookie: "anon=1" },
            "mainFrame",
        );
        deps.window.close();

        await expect(promise).resolves.toEqual({ saved: false, reason: "invalid_cookie" });
        expect((deps.vault as ReturnType<typeof create_vault>).values).toEqual(new Map());
    });

    it("cookie 通过有效性校验时正常保存（t337 AC-003）", async () => {
        const deps = create_deps();
        deps.verify_cookie.mockResolvedValue(true);
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "opencode-go-1",
            provider: "opencode_go",
            login_url: "https://opencode.ai/auth",
            cookie_names: ["session"],
        });
        deps.emit_before_send_headers("https://opencode.ai/_server?id=abc", {
            Cookie: "session=valid",
        });
        deps.window.close();

        await expect(promise).resolves.toEqual({ saved: true });
        await expect(deps.vault.get("opencode-go-1:SESSION_COOKIE")).resolves.toBe("session=valid");
        expect(deps.verify_cookie).toHaveBeenCalled();
    });

    it("is_valid_opencode_login 判定 3xx+workspace 有效、其余无效（t337 AC-003）", () => {
        expect(is_valid_opencode_login(302, "/workspace/wrk_123")).toBe(true);
        expect(is_valid_opencode_login(301, "https://opencode.ai/workspace/wrk_123")).toBe(true);
        expect(is_valid_opencode_login(200, null)).toBe(false);
        expect(is_valid_opencode_login(200, "/login")).toBe(false);
        expect(is_valid_opencode_login(302, "/login")).toBe(false);
        expect(is_valid_opencode_login(400, "/workspace/wrk_123")).toBe(false);
        expect(is_valid_opencode_login(302, null)).toBe(false);
        expect(is_valid_opencode_login(302, "")).toBe(false);
    });
});
