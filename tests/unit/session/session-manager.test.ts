import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
    create_session_manager,
    SESSION_LOGIN_PARTITION,
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

    loadURL(url: string): Promise<void> {
        this.loaded_urls.push(url);
        return Promise.resolve();
    }

    close(): void {
        this.closed = true;
        this.emit("closed");
    }

    isDestroyed(): boolean {
        return this.closed;
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
    };
}

interface TestDeps extends SessionManagerDeps {
    readonly window: MockWindow;
    readonly partitions: string[];
    readonly cookie_urls: string[];
    emit_before_send_headers(url: string, requestHeaders: Record<string, string>): void;
}

function create_deps(cookies: SessionCookie[] = []): TestDeps {
    const window = new MockWindow();
    const partitions: string[] = [];
    const cookie_urls: string[] = [];
    let before_send_headers:
        | ((details: { url: string; requestHeaders: Record<string, string> }) => void)
        | null = null;

    return {
        window,
        partitions,
        cookie_urls,
        vault: create_vault(),
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
        emit_before_send_headers(url: string, requestHeaders: Record<string, string>) {
            before_send_headers?.({ url, requestHeaders });
        },
    };
}

describe("session-manager", () => {
    it("opens login URL in controlled window", async () => {
        const deps = create_deps();
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "mimo-1",
            login_url: "https://example.com/login",
            cookie_names: ["token"],
        });
        deps.window.close();
        await promise;

        expect(deps.window.loaded_urls).toEqual(["https://example.com/login"]);
    });

    it("uses an instance-scoped persistent partition for login window and cookie capture", async () => {
        const deps = create_deps();
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "opencode-go-1",
            login_url: "https://opencode.ai/auth",
            cookie_names: ["session"],
        });
        deps.window.close();
        await promise;

        expect(deps.partitions).toEqual([
            `window:${SESSION_LOGIN_PARTITION}:opencode-go-1`,
            `session:${SESSION_LOGIN_PARTITION}:opencode-go-1`,
        ]);
    });

    it("saves captured Cookie header on window close", async () => {
        const deps = create_deps();
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "mimo-1",
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

    it("captures OpenCode Go _server Cookie header", async () => {
        const deps = create_deps();
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "opencode-go-1",
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

    it("ignores third-party OpenCode Go _server Cookie headers", async () => {
        const deps = create_deps();
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "opencode-go-1",
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

    it("falls back to selected session cookies when captured header has no requested cookies", async () => {
        const deps = create_deps([{ name: "token", value: "from-jar" }]);
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "mimo-1",
            login_url: "https://example.com/login",
            cookie_names: ["token"],
        });
        deps.emit_before_send_headers("https://example.com/api/v1/user", {
            Cookie: "tracker=third-party",
        });
        deps.window.close();

        await expect(promise).resolves.toEqual({ saved: true });
        await expect(deps.vault.get("mimo-1:SESSION_COOKIE")).resolves.toBe("token=from-jar");
    });

    it("falls back to selected session cookies on close", async () => {
        const deps = create_deps([
            { name: "token", value: "abc" },
            { name: "ignored", value: "no" },
            { name: "userId", value: "42" },
        ]);
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "mimo-1",
            login_url: "https://example.com/login",
            cookie_names: ["token", "userId"],
        });
        deps.window.close();

        await expect(promise).resolves.toEqual({ saved: true });
        await expect(deps.vault.get("mimo-1:SESSION_COOKIE")).resolves.toBe("token=abc; userId=42");
    });

    it("saves all OpenCode Go cookies from the login origin when wildcard is requested", async () => {
        const deps = create_deps([
            { name: "session_token", value: "abc" },
            { name: "auth", value: "xyz" },
        ]);
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "opencode-go-1",
            login_url: "https://opencode.ai/auth",
            cookie_names: ["*"],
        });
        deps.window.close();

        await expect(promise).resolves.toEqual({ saved: true });
        await expect(deps.vault.get("opencode-go-1:SESSION_COOKIE")).resolves.toBe(
            "session_token=abc; auth=xyz",
        );
        expect(deps.cookie_urls).toEqual(["https://opencode.ai"]);
    });

    it("returns saved false when no cookies are captured", async () => {
        const deps = create_deps([{ name: "ignored", value: "no" }]);
        const manager = create_session_manager(deps);

        const promise = manager.start_login({
            instance_id: "mimo-1",
            login_url: "https://example.com/login",
            cookie_names: ["token"],
        });
        deps.window.close();

        await expect(promise).resolves.toEqual({ saved: false });
        await expect(deps.vault.has("mimo-1:SESSION_COOKIE")).resolves.toBe(false);
    });

    it("closes window and rejects on timeout", async () => {
        vi.useFakeTimers();
        try {
            const deps = create_deps();
            const manager = create_session_manager(deps, { timeout_ms: 100 });

            const promise = manager.start_login({
                instance_id: "mimo-1",
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
            login_url: "https://example.com/login",
            cookie_names: ["token"],
        });

        const second = manager.start_login({
            instance_id: "mimo-1",
            login_url: "https://example.com/login",
            cookie_names: ["token"],
        });

        await expect(second).rejects.toThrow(/already in progress/i);
        expect(deps.window.loaded_urls).toEqual(["https://example.com/login"]);

        deps.window.close();
        await first;
    });
});
