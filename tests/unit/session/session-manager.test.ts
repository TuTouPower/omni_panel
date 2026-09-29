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
    html: string | null = null;
    html_after_reveal: string | null = null;
    presented = 0;
    revealed = 0;

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

    read_html(): Promise<string | null> {
        if (this.closed) {
            return Promise.reject(new Error("Object has been destroyed"));
        }
        return Promise.resolve(this.html);
    }

    present_for_capture(): void {
        this.presented += 1;
    }

    reveal(): void {
        this.revealed += 1;
        if (this.html_after_reveal !== null) this.html = this.html_after_reveal;
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
    readonly windows: MockWindow[];
    readonly partitions: string[];
    readonly cookie_urls: string[];
    readonly seeded_cookies: { url: string; name: string; value: string }[];
    /** p240: create_window 收到的选项（hidden 用于自动重登）。 */
    readonly window_options: { hidden?: boolean }[];
    /** 注入的 cookie 有效性探测（t337）。 */
    readonly verify_cookie: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
    emit_before_send_headers(
        url: string,
        requestHeaders: Record<string, string>,
        resource_type?: string,
    ): void;
}

function create_deps(cookies: SessionCookie[] = [], options?: { set_cookie?: boolean }): TestDeps {
    const initial_window = new MockWindow();
    const windows: MockWindow[] = [initial_window];
    const partitions: string[] = [];
    const cookie_urls: string[] = [];
    const seeded_cookies: { url: string; name: string; value: string }[] = [];
    const window_options: { hidden?: boolean }[] = [];
    let call_count = 0;
    let before_send_headers:
        | ((details: {
              url: string;
              requestHeaders: Record<string, string>;
              resource_type: string;
          }) => void)
        | null = null;

    return {
        get window() {
            return windows[windows.length - 1] ?? initial_window;
        },
        windows,
        partitions,
        cookie_urls,
        seeded_cookies,
        window_options,
        vault: create_vault(),
        verify_cookie: vi.fn().mockResolvedValue(true),
        create_window(partition: string, options?: { hidden?: boolean }) {
            partitions.push(`window:${partition}`);
            window_options.push(options ?? {});
            call_count++;
            if (call_count === 1) {
                return initial_window;
            }
            const win = new MockWindow();
            windows.push(win);
            return win;
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
                ...(options?.set_cookie
                    ? {
                          set_cookie(url: string, name: string, value: string) {
                              seeded_cookies.push({ url, name, value });
                              return Promise.resolve();
                          },
                      }
                    : {}),
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

    it("does not prematurely capture or auto-close Muse login window on anonymous tracking cookies", async () => {
        vi.useFakeTimers();
        const deps = create_deps();
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "muse-test-1",
            provider: "muse",
            login_url: "https://muse.ai/",
            cookie_names: ["hatch_sess"],
            auto_close_ms: 1500,
        });

        // 模拟页面初次加载时服务端下发的匿名 tracking cookie (datr, wd)
        deps.emit_before_send_headers("https://muse.ai/api/consent/status", {
            Cookie: "datr=anon_tracking_id_123; wd=1200x800",
        });

        // 推进 2 秒，断言绝不会误触发 auto_close 关窗
        await vi.advanceTimersByTimeAsync(2000);
        expect(deps.window.closed).toBe(false);

        // 模拟用户在页面内完成登录，后续请求携带 hatch_sess
        deps.emit_before_send_headers("https://muse.ai/api/session", {
            Cookie: "datr=anon_tracking_id_123; hatch_sess=valid_user_session_token",
        });

        // 此时捕获到登录凭据，1.5 秒后自动关窗
        await vi.advanceTimersByTimeAsync(1500);
        expect(deps.window.closed).toBe(true);

        await expect(promise).resolves.toEqual({ saved: true });
        await expect(deps.vault.get("muse-test-1:SESSION_COOKIE")).resolves.toBe(
            "hatch_sess=valid_user_session_token",
        );
        vi.useRealTimers();
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

    it("p240: 自动重登请求隐藏窗口，手动登录仍显示窗口", async () => {
        const deps = create_deps();
        const manager = create_session_manager(deps);

        const auto_promise = manager.start_login({
            instance_id: "kimi-web-hidden-1",
            provider: "kimi_web",
            login_url: "https://www.kimi.com/settings/subscription?tab=quota",
            cookie_names: ["*"],
            hidden: true,
        });
        expect(deps.window_options[0]).toEqual({ hidden: true });
        deps.emit_before_send_headers("https://www.kimi.com/apiv2/UserService/GetCurrentUser", {
            Cookie: "kimi_session=abc",
        });
        deps.window.close();
        await expect(auto_promise).resolves.toEqual({ saved: true });

        const manual_promise = manager.start_login({
            instance_id: "kimi-web-hidden-2",
            provider: "kimi_web",
            login_url: "https://www.kimi.com/settings/subscription?tab=quota",
            cookie_names: ["*"],
        });
        expect(deps.window_options[1]).toEqual({});
        deps.emit_before_send_headers("https://www.kimi.com/apiv2/UserService/GetCurrentUser", {
            Cookie: "kimi_session=abc",
        });
        deps.window.close();
        await expect(manual_promise).resolves.toEqual({ saved: true });
    });

    it("t504: opencode_go 自动重登捕获到不同且探测有效的 Cookie 即关窗落库", async () => {
        const deps = create_deps();
        await deps.vault.set("opencode-auto-1:SESSION_COOKIE", "session=stale-cookie");
        deps.verify_cookie.mockResolvedValue(true);
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "opencode-auto-1",
            provider: "opencode_go",
            login_url: "https://opencode.ai/auth",
            cookie_names: ["*"],
            close_when_credential_refreshed: true,
            hidden: true,
        });
        expect(deps.window_options[0]).toEqual({ hidden: true });
        deps.emit_before_send_headers("https://opencode.ai/auth", {
            Cookie: "session=fresh-cookie",
        });

        await expect(promise).resolves.toEqual({ saved: true });
        expect(deps.window.closed).toBe(true);
        const saved = await deps.vault.get("opencode-auto-1:SESSION_COOKIE");
        expect(saved).toBe("session=fresh-cookie");
        expect(deps.verify_cookie).toHaveBeenCalledWith(
            "session=fresh-cookie",
            "https://opencode.ai/auth",
        );
    });

    it("t504: opencode_go 自动重登捕获相同 Cookie 或探测失败时不关窗", async () => {
        const deps = create_deps();
        await deps.vault.set("opencode-auto-2:SESSION_COOKIE", "session=stale-cookie");
        deps.verify_cookie.mockResolvedValue(false);
        const manager = create_session_manager(deps, { timeout_ms: 60_000 });

        const promise = manager.start_login({
            instance_id: "opencode-auto-2",
            provider: "opencode_go",
            login_url: "https://opencode.ai/auth",
            cookie_names: ["*"],
            close_when_credential_refreshed: true,
            hidden: true,
        });
        // 1) 相同 cookie 不关窗
        deps.emit_before_send_headers("https://opencode.ai/auth", {
            Cookie: "session=stale-cookie",
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(deps.window.closed).toBe(false);

        // 2) 不同 cookie 但 verify_cookie 返回 false 不关窗
        deps.emit_before_send_headers("https://opencode.ai/auth", {
            Cookie: "session=invalid-cookie",
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(deps.window.closed).toBe(false);

        deps.window.close();
        await expect(promise).resolves.toEqual({ saved: false, reason: "invalid_cookie" });
    });

    it("t504: mimo 自动重登捕获到不同 Cookie 即关窗落库", async () => {
        const deps = create_deps();
        await deps.vault.set("mimo-auto-1:SESSION_COOKIE", "userId=123; token=stale");
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "mimo-auto-1",
            provider: "mimo",
            login_url: "https://platform.xiaomimimo.com/console/plan-manage",
            cookie_names: ["*"],
            close_when_credential_refreshed: true,
            hidden: true,
        });
        expect(deps.window_options[0]).toEqual({ hidden: true });
        deps.emit_before_send_headers("https://platform.xiaomimimo.com/console/plan-manage", {
            Cookie: "userId=123; token=fresh",
        });

        await expect(promise).resolves.toEqual({ saved: true });
        expect(deps.window.closed).toBe(true);
        const saved = await deps.vault.get("mimo-auto-1:SESSION_COOKIE");
        expect(saved).toBe("userId=123; token=fresh");
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

    it("is_valid_opencode_login 判定 200 或 3xx+workspace/console 有效、其余无效（t337/t506）", () => {
        expect(is_valid_opencode_login(200, null)).toBe(true);
        expect(is_valid_opencode_login(302, "/workspace/wrk_123")).toBe(true);
        expect(is_valid_opencode_login(301, "https://opencode.ai/workspace/wrk_123")).toBe(true);
        expect(is_valid_opencode_login(302, "https://opencode.ai/console/login")).toBe(true);
        expect(is_valid_opencode_login(307, "/console/")).toBe(true);
        expect(is_valid_opencode_login(401, null)).toBe(false);
        expect(is_valid_opencode_login(400, "/workspace/wrk_123")).toBe(false);
        expect(is_valid_opencode_login(302, "/login")).toBe(false);
        expect(is_valid_opencode_login(302, null)).toBe(false);
        expect(is_valid_opencode_login(302, "")).toBe(false);
    });

    it("t505: 用户可见登录抢占正在运行的后台隐藏重登会话", async () => {
        const deps = create_deps();
        const manager = create_session_manager(deps);

        // 1) 后台隐藏重登启动
        const bg_promise = manager.start_login({
            instance_id: "preempt-instance-1",
            provider: "opencode_go",
            login_url: "https://opencode.ai/auth",
            cookie_names: ["*"],
            hidden: true,
        });
        expect(deps.window_options[0]).toEqual({ hidden: true });

        // 2) 用户在前端触发可见登录
        const fg_promise = manager.start_login({
            instance_id: "preempt-instance-1",
            provider: "opencode_go",
            login_url: "https://opencode.ai/auth",
            cookie_names: ["*"],
        });

        // 断言后台会话被终止，窗口被关闭
        await expect(bg_promise).rejects.toThrow(/preempted/i);
        expect(deps.windows[0]?.closed).toBe(true);

        // 断言前台可见会话成功启动，第二扇窗口为可见窗口（非 hidden）
        expect(deps.window_options[1]).toEqual({});
        expect(deps.windows[1]?.closed).toBe(false);

        deps.emit_before_send_headers("https://opencode.ai/auth", {
            Cookie: "session=fg-cookie",
        });
        deps.windows[1]?.close();
        await expect(fg_promise).resolves.toEqual({ saved: true });
        await expect(deps.vault.get("preempt-instance-1:SESSION_COOKIE")).resolves.toBe(
            "session=fg-cookie",
        );
    });

    it("t505: 已有前台可见会话运行时拒绝新的可见会话并发", async () => {
        const deps = create_deps();
        const manager = create_session_manager(deps);

        const fg_promise_1 = manager.start_login({
            instance_id: "preempt-instance-2",
            provider: "opencode_go",
            login_url: "https://opencode.ai/auth",
            cookie_names: ["*"],
        });

        await expect(
            manager.start_login({
                instance_id: "preempt-instance-2",
                provider: "opencode_go",
                login_url: "https://opencode.ai/auth",
                cookie_names: ["*"],
            }),
        ).rejects.toThrow(/already in progress/i);

        deps.window.close();
        await expect(fg_promise_1).resolves.toBeDefined();
    });

    it("t505: 已有后台隐藏重登运行时拒绝新的后台隐藏重登并发", async () => {
        const deps = create_deps();
        const manager = create_session_manager(deps);

        const bg_promise_1 = manager.start_login({
            instance_id: "preempt-instance-3",
            provider: "opencode_go",
            login_url: "https://opencode.ai/auth",
            cookie_names: ["*"],
            hidden: true,
        });

        await expect(
            manager.start_login({
                instance_id: "preempt-instance-3",
                provider: "opencode_go",
                login_url: "https://opencode.ai/auth",
                cookie_names: ["*"],
                hidden: true,
            }),
        ).rejects.toThrow(/already in progress/i);

        deps.window.close();
        await expect(bg_promise_1).resolves.toBeDefined();
    });

    it("captures live traffic DOM and saves { cookie, html, captured_at } for flowercloud", async () => {
        const deps = create_deps();
        deps.window.html = "<div>流量使用 320.14GB / 1000GB</div>";
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "flower-1",
            provider: "flowercloud",
            login_url: "https://api-flowercloud.com/clientarea.php",
            cookie_names: ["*"],
            hidden: true,
        });

        deps.emit_before_send_headers("https://api-flowercloud.com/clientarea.php", {
            cookie: "cf_clearance=cf123; WHMCS=w123",
        });

        // inspect_flowercloud_page should detect traffic DOM and auto-close
        const result = await promise;
        expect(result.saved).toBe(true);

        const stored = await deps.vault.get("flower-1:SESSION_COOKIE");
        expect(stored).not.toBeNull();
        if (stored) {
            const parsed = JSON.parse(stored) as {
                cookie?: string;
                html?: string;
                captured_at?: number;
            };
            expect(parsed.cookie).toBe("cf_clearance=cf123; WHMCS=w123");
            expect(parsed.html).toContain("320.14GB");
            expect(typeof parsed.captured_at).toBe("number");
            expect(Date.now() - (parsed.captured_at ?? 0)).toBeLessThan(5000);
        }
    });

    it("auto-navigates from clientarea overview to productdetails for flowercloud", async () => {
        const deps = create_deps();
        deps.window.html = '<a href="clientarea.php?action=productdetails&id=394686">Global</a>';
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "flower-2",
            provider: "flowercloud",
            login_url: "https://api-flowercloud.com/clientarea.php",
            cookie_names: ["*"],
        });

        // Let microtasks settle so inspect_flowercloud_page runs
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        // Should have auto-navigated to productdetails URL
        expect(deps.window.loaded_urls).toContain(
            "https://api-flowercloud.com/clientarea.php?action=productdetails&id=394686",
        );

        deps.emit_before_send_headers("https://api-flowercloud.com/clientarea.php", {
            cookie: "WHMCS=w123",
        });
        deps.window.close();

        await expect(promise).resolves.toEqual({ saved: true });
    });

    it("refreshes flowercloud DOM into the stored session without dropping the cookie", async () => {
        const deps = create_deps([], { set_cookie: true });
        deps.window.html = "<p class='usage-amount'>331.40GB / 1000GB</p><h3>流量使用</h3>";
        await deps.vault.set(
            "flower-1:SESSION_COOKIE",
            JSON.stringify({
                cookie: "WHMCS=kept; cf_clearance=cf",
                html: "<p>流量使用 321.31GB / 1000GB</p>",
                captured_at: Date.now() - 24 * 60 * 60 * 1000,
            }),
        );
        const manager = create_session_manager(deps);
        const refresh = manager.refresh_flowercloud_snapshot?.bind(manager);
        if (!refresh) throw new Error("flowercloud snapshot refresh is missing");

        const updated = await refresh("flower-1", "https://api-flowercloud.com/clientarea.php", {
            timeout_ms: 2_000,
            poll_ms: 10,
            settle_ms: 0,
        });

        expect(updated).toBe(true);
        expect(deps.window_options[0]).toEqual({ hidden: true });
        expect(deps.window.presented).toBe(1);
        expect(deps.window.closed).toBe(true);
        expect(deps.seeded_cookies).toEqual([
            {
                url: "https://api-flowercloud.com/clientarea.php",
                name: "WHMCS",
                value: "kept",
            },
            {
                url: "https://api-flowercloud.com/clientarea.php",
                name: "cf_clearance",
                value: "cf",
            },
        ]);
        const stored = await deps.vault.get("flower-1:SESSION_COOKIE");
        const parsed = JSON.parse(stored ?? "{}") as {
            cookie?: string;
            html?: string;
            captured_at?: number;
        };
        expect(parsed.cookie).toBe("WHMCS=kept; cf_clearance=cf");
        expect(parsed.html).toContain("331.40GB");
        expect(Date.now() - (parsed.captured_at ?? 0)).toBeLessThan(5_000);
    });

    it("keeps the later flowercloud usage number rendered during settle", async () => {
        const deps = create_deps();
        const pages = [
            "<p>流量使用 321.31GB / 1000GB</p>",
            "<p>流量使用 331.00GB / 1000GB</p>",
            "<p>流量使用 331.00GB / 1000GB</p>",
        ];
        let read = 0;
        deps.window.read_html = () => {
            const html = pages[Math.min(read, pages.length - 1)] ?? null;
            read += 1;
            return Promise.resolve(html);
        };
        await deps.vault.set(
            "flower-1:SESSION_COOKIE",
            JSON.stringify({ cookie: "WHMCS=kept", html: "<p>流量使用 1GB / 1000GB</p>" }),
        );
        const manager = create_session_manager(deps);
        const refresh = manager.refresh_flowercloud_snapshot?.bind(manager);
        if (!refresh) throw new Error("flowercloud snapshot refresh is missing");

        const updated = await refresh("flower-1", "https://api-flowercloud.com/clientarea.php", {
            timeout_ms: 2_000,
            poll_ms: 15,
            settle_ms: 40,
        });

        expect(updated).toBe(true);
        const stored = await deps.vault.get("flower-1:SESSION_COOKIE");
        expect(stored).toContain("331.00GB");
        expect(stored).not.toContain("321.31GB");
    });

    it("does not replace the stored flowercloud page when usage never appears", async () => {
        const deps = create_deps();
        deps.window.html = "<form action='dologin.php'></form>";
        const original = JSON.stringify({
            cookie: "WHMCS=kept",
            html: "<p>流量使用 321.31GB / 1000GB</p>",
            captured_at: 1,
        });
        await deps.vault.set("flower-1:SESSION_COOKIE", original);
        const manager = create_session_manager(deps);
        const refresh = manager.refresh_flowercloud_snapshot?.bind(manager);
        if (!refresh) throw new Error("flowercloud snapshot refresh is missing");

        const updated = await refresh("flower-1", "https://api-flowercloud.com/clientarea.php", {
            timeout_ms: 40,
            poll_ms: 10,
            settle_ms: 0,
        });

        expect(updated).toBe(false);
        expect(await deps.vault.get("flower-1:SESSION_COOKIE")).toBe(original);
    });

    it("skips flowercloud DOM refresh while a login window is open", async () => {
        const deps = create_deps();
        const manager = create_session_manager(deps);
        const login = manager.start_login({
            instance_id: "flower-1",
            provider: "mimo",
            login_url: "https://api-flowercloud.com/clientarea.php",
            cookie_names: ["*"],
            hidden: true,
        });

        const refresh = manager.refresh_flowercloud_snapshot?.bind(manager);
        if (!refresh) throw new Error("flowercloud snapshot refresh is missing");
        const updated = await refresh("flower-1", "https://api-flowercloud.com/clientarea.php", {
            timeout_ms: 200,
            poll_ms: 10,
            settle_ms: 0,
        });

        expect(updated).toBe(false);
        expect(deps.windows).toHaveLength(1);
        deps.window.close();
        await login;
    });

    it("opens the stored flowercloud service page instead of the client area", async () => {
        const deps = create_deps();
        deps.window.html = "<p>流量使用 331.20GB / 1000GB</p>";
        await deps.vault.set(
            "flower-1:SESSION_COOKIE",
            JSON.stringify({
                cookie: "WHMCS=kept",
                html: '<a href="clientarea.php?action=productdetails&id=394686">Global</a>',
            }),
        );
        const manager = create_session_manager(deps);
        const refresh = manager.refresh_flowercloud_snapshot?.bind(manager);
        if (!refresh) throw new Error("flowercloud snapshot refresh is missing");

        const updated = await refresh("flower-1", "https://api-flowercloud.com/clientarea.php", {
            timeout_ms: 2_000,
            poll_ms: 10,
            settle_ms: 0,
        });

        expect(updated).toBe(true);
        expect(deps.window.loaded_urls[0]).toBe(
            "https://api-flowercloud.com/clientarea.php?action=productdetails&id=394686",
        );
    });

    it("does not overwrite a flowercloud clearance already in the partition", async () => {
        const deps = create_deps([{ name: "cf_clearance", value: "live" }], { set_cookie: true });
        deps.window.html = "<p>流量使用 331.20GB / 1000GB</p>";
        await deps.vault.set(
            "flower-1:SESSION_COOKIE",
            JSON.stringify({
                cookie: "WHMCS=kept; cf_clearance=stale",
                html: "<p>流量使用 1GB / 1000GB</p>",
            }),
        );
        const manager = create_session_manager(deps);
        const refresh = manager.refresh_flowercloud_snapshot?.bind(manager);
        if (!refresh) throw new Error("flowercloud snapshot refresh is missing");

        await refresh("flower-1", "https://api-flowercloud.com/clientarea.php", {
            timeout_ms: 2_000,
            poll_ms: 10,
            settle_ms: 0,
        });

        expect(deps.seeded_cookies).toEqual([
            {
                url: "https://api-flowercloud.com/clientarea.php",
                name: "WHMCS",
                value: "kept",
            },
        ]);
    });

    it("joins an in-flight flowercloud snapshot instead of opening another window", async () => {
        const deps = create_deps();
        deps.window.html = "<form action='dologin.php'></form>";
        await deps.vault.set(
            "flower-1:SESSION_COOKIE",
            JSON.stringify({
                cookie: "WHMCS=kept",
                html: "<p>流量使用 1GB / 1000GB</p>",
            }),
        );
        const manager = create_session_manager(deps);
        const refresh = manager.refresh_flowercloud_snapshot?.bind(manager);
        if (!refresh) throw new Error("flowercloud snapshot refresh is missing");
        const options = { timeout_ms: 80, poll_ms: 20, settle_ms: 0 };

        const first = refresh("flower-1", "https://api-flowercloud.com/clientarea.php", options);
        const second = refresh("flower-1", "https://api-flowercloud.com/clientarea.php", options);

        expect(second).toBe(first);
        await expect(first).resolves.toBe(false);
        expect(deps.windows).toHaveLength(1);
    });

    it("shows the flowercloud window when a challenge does not clear on its own", async () => {
        const deps = create_deps();
        deps.window.html = "<title>Just a moment...</title><div class='cf-challenge'></div>";
        deps.window.html_after_reveal = "<p>流量使用 331.80GB / 1000GB</p>";
        await deps.vault.set(
            "flower-1:SESSION_COOKIE",
            JSON.stringify({
                cookie: "WHMCS=kept",
                html: "<p>流量使用 321.31GB / 1000GB</p>",
            }),
        );
        const manager = create_session_manager(deps);
        const refresh = manager.refresh_flowercloud_snapshot?.bind(manager);
        if (!refresh) throw new Error("flowercloud snapshot refresh is missing");

        const updated = await refresh("flower-1", "https://api-flowercloud.com/clientarea.php", {
            timeout_ms: 2_000,
            poll_ms: 10,
            settle_ms: 0,
            reveal_after_ms: 0,
        });

        expect(updated).toBe(true);
        expect(deps.window.revealed).toBe(1);
        const stored = await deps.vault.get("flower-1:SESSION_COOKIE");
        expect(stored).toContain("331.80GB");
    });

    it("merges fresh flowercloud login cookies into the stored cookie header", async () => {
        const deps = create_deps([{ name: "WHMCSUserID", value: "42" }], { set_cookie: true });
        deps.window.html = "<p>流量使用 331.20GB / 1000GB</p>";
        await deps.vault.set(
            "flower-1:SESSION_COOKIE",
            JSON.stringify({
                cookie: "D0S_Header=keepme; WHMCSUserID=1",
                html: "<p>流量使用 1GB / 1000GB</p>",
            }),
        );
        const manager = create_session_manager(deps);
        const refresh = manager.refresh_flowercloud_snapshot?.bind(manager);
        if (!refresh) throw new Error("flowercloud snapshot refresh is missing");

        const updated = await refresh("flower-1", "https://api-flowercloud.com/clientarea.php", {
            timeout_ms: 2_000,
            poll_ms: 10,
            settle_ms: 0,
        });

        expect(updated).toBe(true);
        const parsed = JSON.parse((await deps.vault.get("flower-1:SESSION_COOKIE")) ?? "{}") as {
            cookie?: string;
        };
        // 分区里的新值覆盖同名 cookie，vault 里其它 cookie 必须原样保留。
        expect(parsed.cookie).toBe("D0S_Header=keepme; WHMCSUserID=42");
    });

    it("keeps the stored flowercloud cookie when the partition has no login cookie", async () => {
        const deps = create_deps([{ name: "cf_clearance", value: "live" }], { set_cookie: true });
        deps.window.html = "<p>流量使用 331.20GB / 1000GB</p>";
        await deps.vault.set(
            "flower-1:SESSION_COOKIE",
            JSON.stringify({ cookie: "WHMCS=kept", html: "<p>流量使用 1GB / 1000GB</p>" }),
        );
        const manager = create_session_manager(deps);
        const refresh = manager.refresh_flowercloud_snapshot?.bind(manager);
        if (!refresh) throw new Error("flowercloud snapshot refresh is missing");

        const updated = await refresh("flower-1", "https://api-flowercloud.com/clientarea.php", {
            timeout_ms: 2_000,
            poll_ms: 10,
            settle_ms: 0,
        });

        expect(updated).toBe(true);
        const parsed = JSON.parse((await deps.vault.get("flower-1:SESSION_COOKIE")) ?? "{}") as {
            cookie?: string;
            html?: string;
        };
        // 分区只有 clearance、没有 WHMCS 会话：保留旧 cookie，只更新页面。
        expect(parsed.cookie).toBe("WHMCS=kept");
        expect(parsed.html).toContain("331.20GB");
    });

    it("hands the flowercloud window over instead of closing it under the user", async () => {
        const deps = create_deps();
        deps.window.html = "<title>Just a moment...</title><div class='cf-challenge'></div>";
        const original = JSON.stringify({
            cookie: "WHMCS=kept",
            html: "<p>流量使用 1GB / 1000GB</p>",
            captured_at: 1,
        });
        await deps.vault.set("flower-1:SESSION_COOKIE", original);
        const manager = create_session_manager(deps);
        const refresh = manager.refresh_flowercloud_snapshot?.bind(manager);
        if (!refresh) throw new Error("flowercloud snapshot refresh is missing");

        const updated = await refresh("flower-1", "https://api-flowercloud.com/clientarea.php", {
            timeout_ms: 30,
            poll_ms: 10,
            settle_ms: 0,
            reveal_after_ms: 0,
            reveal_budget_ms: 0,
            // 0 = 不等用户，到点就交接（默认是 30 分钟内继续采集）。
            handover_wait_ms: 0,
        });

        expect(updated).toBe(false);
        expect(deps.window.revealed).toBe(1);
        // 页面仍停在质询页且等待上限已到：窗口留给用户，别在他输入时关掉，vault 也不能被覆盖。
        expect(deps.window.closed).toBe(false);
        expect(await deps.vault.get("flower-1:SESSION_COOKIE")).toBe(original);
    });

    it("keeps capturing after revealing the window until the user finishes", async () => {
        const deps = create_deps();
        const challenge = "<title>Just a moment...</title><div class='cf-challenge'></div>";
        const usage = "<p>流量使用 331.80GB / 1000GB</p>";
        let reads = 0;
        deps.window.read_html = () => {
            reads += 1;
            // 亮窗后用户需要几轮才过掉质询，期间必须继续采集而不是放手。
            return Promise.resolve(reads < 5 ? challenge : usage);
        };
        await deps.vault.set(
            "flower-1:SESSION_COOKIE",
            JSON.stringify({
                cookie: "WHMCS=kept",
                html: "<p>流量使用 1GB / 1000GB</p>",
                captured_at: 1,
            }),
        );
        const manager = create_session_manager(deps);
        const refresh = manager.refresh_flowercloud_snapshot?.bind(manager);
        if (!refresh) throw new Error("flowercloud snapshot refresh is missing");

        const updated = await refresh("flower-1", "https://api-flowercloud.com/clientarea.php", {
            timeout_ms: 2_000,
            poll_ms: 10,
            settle_ms: 0,
            reveal_after_ms: 0,
            reveal_budget_ms: 0,
            handover_wait_ms: 2_000,
        });

        expect(updated).toBe(true);
        expect(deps.window.closed).toBe(true);
        expect(await deps.vault.get("flower-1:SESSION_COOKIE")).toContain("331.80GB");
    });

    it("keeps the handover window registered so refreshes do not stack windows", async () => {
        const deps = create_deps();
        deps.window.html = "<title>Just a moment...</title><div class='cf-challenge'></div>";
        await deps.vault.set(
            "flower-1:SESSION_COOKIE",
            JSON.stringify({
                cookie: "WHMCS=kept",
                html: "<p>流量使用 1GB / 1000GB</p>",
                captured_at: 1,
            }),
        );
        const manager = create_session_manager(deps);
        const refresh = manager.refresh_flowercloud_snapshot?.bind(manager);
        if (!refresh) throw new Error("flowercloud snapshot refresh is missing");
        const options = {
            timeout_ms: 40,
            poll_ms: 10,
            settle_ms: 0,
            reveal_after_ms: 0,
            reveal_budget_ms: 0,
            handover_wait_ms: 5_000,
        };

        const first = refresh("flower-1", "https://api-flowercloud.com/clientarea.php", options);
        // 等到亮窗并进入交接等待期。
        await new Promise((resolve) => setTimeout(resolve, 60));
        const second = refresh("flower-1", "https://api-flowercloud.com/clientarea.php", options);

        // 等待期内仍持有登记：后续刷新复用在途任务，而不是再开一个同分区窗口。
        expect(second).toBe(first);
        expect(deps.windows).toHaveLength(1);

        deps.window.close();
        await expect(first).resolves.toBe(false);
        expect(manager.is_login_in_progress?.("flower-1")).toBe(false);
    });

    it("skips opening a window while the stored flowercloud snapshot is fresh", async () => {
        const deps = create_deps();
        deps.window.html = "<p>流量使用 331.20GB / 1000GB</p>";
        const stored = JSON.stringify({
            cookie: "WHMCS=kept",
            html: "<p>流量使用 1GB / 1000GB</p>",
            captured_at: Date.now(),
        });
        await deps.vault.set("flower-1:SESSION_COOKIE", stored);
        const manager = create_session_manager(deps);
        const refresh = manager.refresh_flowercloud_snapshot?.bind(manager);
        if (!refresh) throw new Error("flowercloud snapshot refresh is missing");

        const updated = await refresh("flower-1", "https://api-flowercloud.com/clientarea.php", {
            skip_if_fresh: true,
        });

        expect(updated).toBe(true);
        expect(deps.windows).toHaveLength(1);
        expect(await deps.vault.get("flower-1:SESSION_COOKIE")).toBe(stored);
    });

    it("does not report a flowercloud DOM snapshot as a login in progress", async () => {
        const deps = create_deps();
        let released = false;
        const gate: { release?: () => void } = {};
        deps.window.read_html = () => {
            if (released) return Promise.resolve("<form action='dologin.php'></form>");
            return new Promise((resolve) => {
                gate.release = () => {
                    released = true;
                    resolve("<form action='dologin.php'></form>");
                };
            });
        };
        await deps.vault.set(
            "flower-1:SESSION_COOKIE",
            JSON.stringify({ cookie: "WHMCS=kept", html: "<p>流量使用 1GB / 1000GB</p>" }),
        );
        const manager = create_session_manager(deps);
        const refresh = manager.refresh_flowercloud_snapshot?.bind(manager);
        if (!refresh) throw new Error("flowercloud snapshot refresh is missing");

        const job = refresh("flower-1", "https://api-flowercloud.com/clientarea.php", {
            timeout_ms: 60,
            poll_ms: 10,
            settle_ms: 0,
            reveal_after_ms: 60_000,
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(manager.is_login_in_progress?.("flower-1")).toBe(false);
        expect(manager.is_login_in_progress?.("flower-1", { only_interactive: true })).toBe(false);
        gate.release?.();
        await expect(job).resolves.toBe(false);
    });

    it("stops the flowercloud snapshot when the user closes the window", async () => {
        const deps = create_deps();
        let reads = 0;
        deps.window.read_html = () => {
            reads += 1;
            // 第二轮模拟用户在质询页上直接关窗。
            if (reads >= 2) deps.window.close();
            return Promise.resolve(
                "<title>Just a moment...</title><div class='cf-challenge'></div>",
            );
        };
        const original = JSON.stringify({
            cookie: "WHMCS=kept",
            html: "<p>流量使用 1GB / 1000GB</p>",
            captured_at: 1,
        });
        await deps.vault.set("flower-1:SESSION_COOKIE", original);
        const manager = create_session_manager(deps);
        const refresh = manager.refresh_flowercloud_snapshot?.bind(manager);
        if (!refresh) throw new Error("flowercloud snapshot refresh is missing");

        const updated = await refresh("flower-1", "https://api-flowercloud.com/clientarea.php", {
            timeout_ms: 5_000,
            poll_ms: 5,
            settle_ms: 0,
            reveal_after_ms: 60_000,
        });

        expect(updated).toBe(false);
        // 关窗必须立刻结束轮询（否则会一直轮询到 5s 超时＝上千次读取）。
        expect(reads).toBeLessThan(10);
        expect(await deps.vault.get("flower-1:SESSION_COOKIE")).toBe(original);
    });

    it("preempts a running flowercloud snapshot with an interactive login", async () => {
        const deps = create_deps();
        let released = false;
        const gate: { release?: () => void } = {};
        deps.window.read_html = () => {
            if (released) return Promise.resolve("<form action='dologin.php'></form>");
            return new Promise((resolve) => {
                gate.release = () => {
                    released = true;
                    resolve("<form action='dologin.php'></form>");
                };
            });
        };
        await deps.vault.set(
            "flower-1:SESSION_COOKIE",
            JSON.stringify({ cookie: "WHMCS=kept", html: "<p>流量使用 1GB / 1000GB</p>" }),
        );
        const manager = create_session_manager(deps);
        const refresh = manager.refresh_flowercloud_snapshot?.bind(manager);
        if (!refresh) throw new Error("flowercloud snapshot refresh is missing");

        const job = refresh("flower-1", "https://api-flowercloud.com/clientarea.php", {
            timeout_ms: 5_000,
            poll_ms: 5,
            settle_ms: 0,
            reveal_after_ms: 60_000,
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        // 前台交互登录抢占隐藏的快照窗（t505 语义：用户显式操作优先）。
        const login = manager.start_login({
            instance_id: "flower-1",
            provider: "mimo",
            login_url: "https://api-flowercloud.com/clientarea.php",
            cookie_names: ["*"],
        });
        expect(deps.windows).toHaveLength(2);

        gate.release?.();
        await expect(job).resolves.toBe(false);
        // 快照退出后互斥锁必须释放，登录窗才能正常收尾。
        expect(manager.is_login_in_progress?.("flower-1")).toBe(true);
        deps.window.close();
        await login;
    });
});
