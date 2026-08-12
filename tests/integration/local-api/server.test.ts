import { createServer } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create_local_api_server } from "../../../src/main/core/local-api/server";
import { create_observation_store } from "../../../src/main/core/observation/observation-store";
import { create_token_stats_store } from "../../../src/main/core/token-stats/token-stats-store";
import { createRuntimeStore } from "../../../src/main/core/scheduler/runtime-store";
import type { RuntimeStore } from "../../../src/main/core/scheduler/runtime-store";
import type { LocalAPIServer } from "../../../src/main/core/local-api/server";
import type { ObservationStore } from "../../../src/main/core/observation/observation-store";
import type { TokenStatsStore } from "../../../src/main/core/token-stats/token-stats-store";
import type { ConfigIpcDeps } from "../../../src/main/ipc/config-ipc";
import type { ConnectorIpcDeps } from "../../../src/main/ipc/connector-ipc";
import type { AppConfiguration } from "../../../src/shared/types/config";
import type { ConnectorDefinition } from "../../../src/main/core/connector/manifest-loader";
import type {
    Env,
    QueryResult,
    SessionHistorySubscriptionService,
    SessionRow,
    SessionsProvider,
} from "../../../src/main/core/session-history/subscription-service";
import { clear_resolution_cache } from "../../../src/main/core/session-history/session-locator";
import { addTransport, scrubber, setLogLevel } from "../../../src/shared/lib/logger";

let temp_dir: string;
let sync_store: ObservationStore;
let store: ObservationStore;
let api: LocalAPIServer;
let token_stats_store: TokenStatsStore;
let config_deps: ConfigIpcDeps;
let connector_deps: ConnectorIpcDeps;
let runtime_store: RuntimeStore;
let web_root: string;

function assert_non_null<T>(
    value: T,
    message = "expected non-null",
): asserts value is NonNullable<T> {
    expect(value, message).not.toBeNull();
}

function valid_ingest_body() {
    return {
        provider: "tavily",
        source_instance_id: "tavily-1",
        account_id: "default",
        account_label: "Tavily",
        metric_id: "tavily:monthly",
        raw_label: "monthly",
        normalized_label: "Monthly",
        window: "month",
        used: 100,
        limit: 1000,
        display_style: "ratio",
        reset_at: null,
        status: "normal",
        source: "wrapper",
    };
}

beforeEach(async () => {
    temp_dir = await mkdtemp(join(tmpdir(), "local-api-test-"));
    sync_store = create_observation_store(join(temp_dir, "test.db"));
    store = sync_store;
    token_stats_store = create_token_stats_store(":memory:");
    web_root = await mkdtemp(join(tmpdir(), "local-api-web-"));
    await writeFile(join(web_root, "index.html"), "<html>web panel</html>");
    config_deps = {
        configStore: {
            load: () =>
                Promise.resolve({
                    schemaVersion: 1,
                    language: "zh-Hans",
                    plugins: [{ instanceId: "inst-1" }] as never[],
                    launchAtLogin: false,
                }),
            save: () => Promise.resolve(),
            saveIfBaseMatches: () => Promise.resolve("saved" as const),
            scheduleSave: () => undefined,
            flushPendingSave: () => Promise.resolve(),
            hasPendingSave: () => false,
            prune_unhealthy_plugins: () =>
                Promise.resolve({
                    schemaVersion: 1,
                    language: "zh-Hans",
                    plugins: [{ instanceId: "inst-1" }] as never[],
                    launchAtLogin: false,
                }),
        },
        secretsStore: {
            get: () => Promise.resolve("sk-plain"),
            set: () => Promise.resolve(),
            delete: () => Promise.resolve(),
            exportAll: () => Promise.resolve({}),
            importAll: () => Promise.resolve(),
        },
        secretParamKeys: new Map([["inst-1", new Set(["apiKey"])]]),
    };
    runtime_store = createRuntimeStore();
    connector_deps = {
        configStore: config_deps.configStore,
        runtimeStore: runtime_store,
        refreshService: {
            refresh: () => Promise.resolve(),
            refreshAll: () => Promise.resolve(),
        },
        definitions: [],
    };
    api = create_local_api_server(store, {
        port: 0,
        token_stats_store,
        config_deps,
        connector_deps,
        web_root,
    });
});

afterEach(async () => {
    await api.stop();
    store.close();
    token_stats_store.close();
    await rm(web_root, { recursive: true, force: true });
    await rm(temp_dir, { recursive: true, force: true });
});

describe("local-api", () => {
    it("health endpoint works without auth", async () => {
        await api.start();
        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/health`);
        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toMatchObject({ status: "ok" });
    });

    it("ingest rejects without auth", async () => {
        await api.start();
        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/ingest`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(valid_ingest_body()),
        });
        expect(res.status).toBe(401);
    });

    it("ingest accepts valid observation", async () => {
        await api.start();
        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/ingest`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${api.get_token()}`,
            },
            body: JSON.stringify(valid_ingest_body()),
        });
        expect(res.status).toBe(200);

        const stored = sync_store.get_latest("tavily", "default", "tavily:monthly", "tavily-1");
        assert_non_null(stored);
        expect(stored.used).toBe(100);
        expect(stored.stale).toBe(false);
        expect(stored.last_error).toBeNull();
    });

    it("ingest rejects invalid JSON", async () => {
        await api.start();
        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/ingest`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${api.get_token()}`,
            },
            body: "{",
        });
        expect(res.status).toBe(400);
    });

    it("ingest rejects oversized body", async () => {
        await api.start();
        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/ingest`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${api.get_token()}`,
            },
            body: "x".repeat(1024 * 1024 + 1),
        });
        expect(res.status).toBe(413);
    });

    it("ingest rejects invalid body", async () => {
        await api.start();
        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/ingest`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${api.get_token()}`,
            },
            body: JSON.stringify({ provider: "" }),
        });
        expect(res.status).toBe(400);
    });

    it("returns 404 for unknown authenticated routes", async () => {
        await api.start();
        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/missing`, {
            headers: { Authorization: `Bearer ${api.get_token()}` },
        });
        expect(res.status).toBe(404);
    });

    it("routes web OAuth and session authentication calls to their existing handlers", async () => {
        const grok_manager = {
            start_device_login: vi.fn().mockResolvedValue({
                device_code: "device-code",
                user_code: "USER-CODE",
                verification_uri: "https://auth.example/device",
                verification_uri_complete: null,
                expires_in: 600,
                interval: 5,
            }),
            get_login_status: vi.fn().mockResolvedValue({
                has_token: true,
                expires_at: null,
                can_refresh: false,
            }),
        };
        const session_manager = {
            start_login: vi.fn().mockResolvedValue({ saved: true }),
        };
        api = create_local_api_server(store, {
            port: 0,
            auth_deps: {
                cookie: {} as never,
                session: { sessionManager: session_manager },
                grok: { manager: grok_manager } as never,
                kimi: { manager: grok_manager } as never,
            },
        });
        await api.start();
        const base = `http://127.0.0.1:${String(api.get_port())}`;

        const start = await fetch(`${base}/v1/auth/grok/loginStart`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        });
        expect(start.status).toBe(200);
        await expect(start.json()).resolves.toMatchObject({ user_code: "USER-CODE" });
        expect(grok_manager.start_device_login).toHaveBeenCalledTimes(1);

        const status = await fetch(`${base}/v1/auth/grok/loginStatus?instanceId=grok-1`);
        expect(status.status).toBe(200);
        await expect(status.json()).resolves.toEqual({
            has_token: true,
            expires_at: null,
            can_refresh: false,
        });
        expect(grok_manager.get_login_status).toHaveBeenCalledWith("grok-1");

        const login_request = {
            instance_id: "mimo-1",
            provider: "mimo",
            login_url: "https://example.com/login",
            cookie_names: ["token"],
        };
        const session = await fetch(`${base}/v1/session/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(login_request),
        });
        expect(session.status).toBe(200);
        await expect(session.json()).resolves.toEqual({ saved: true });
        expect(session_manager.start_login).toHaveBeenCalledWith(login_request);
    });

    it("routes cookie login status and the complete Grok/Kimi OAuth lifecycle", async () => {
        let resolve_cookie_login!: (result: { saved: boolean }) => void;
        const cookie_manager = {
            start_login: vi.fn().mockImplementation(
                () =>
                    new Promise<{ saved: boolean }>((resolve) => {
                        resolve_cookie_login = resolve;
                    }),
            ),
            is_login_in_progress: vi.fn().mockReturnValue(false),
        };
        const cookie_definition = {
            executablePath: "/plugins/mimo",
            manifest: {
                provider: "mimo",
                endpoints: {
                    default: "https://platform.xiaomimimo.com",
                    login: "https://platform.xiaomimimo.com/console/plan-manage",
                },
                loginDomains: ["platform.xiaomimimo.com"],
                cookieNames: ["SESSION_COOKIE"],
            },
        } as unknown as ConnectorDefinition;
        const cookie_deps = {
            configStore: {
                load: vi.fn().mockResolvedValue({
                    plugins: [{ instanceId: "mimo-1", executablePath: "/plugins/mimo" }],
                }),
            },
            secretsStore: {
                get: vi.fn().mockResolvedValue("SESSION_COOKIE=secret-cookie"),
            },
            definitions: [cookie_definition],
            sessionManager: cookie_manager,
        } as never;
        const grok_manager = {
            start_device_login: vi.fn().mockResolvedValue({
                device_code: "grok-device-code",
                user_code: "GROK-CODE",
                verification_uri: "https://auth.grok.example/device",
                verification_uri_complete: null,
                expires_in: 600,
                interval: 5,
            }),
            await_completion: vi.fn().mockResolvedValue({ saved: true, token: "grok-token" }),
            cancel_device_login: vi.fn(),
            get_login_status: vi.fn().mockResolvedValue({
                has_token: true,
                expires_at: "grok-expiry",
                can_refresh: true,
            }),
            logout: vi.fn().mockResolvedValue(undefined),
            refresh_now: vi.fn().mockResolvedValue({ success: true, source: "grok" }),
        };
        const kimi_manager = {
            start_device_login: vi.fn().mockResolvedValue({
                device_code: "kimi-device-code",
                user_code: "KIMI-CODE",
                verification_uri: "https://auth.kimi.example/device",
                verification_uri_complete: null,
                expires_in: 900,
                interval: 7,
            }),
            await_completion: vi.fn().mockResolvedValue({ saved: true, token: "kimi-token" }),
            cancel_device_login: vi.fn(),
            get_login_status: vi.fn().mockResolvedValue({
                has_token: true,
                expires_at: "kimi-expiry",
                can_refresh: true,
            }),
            logout: vi.fn().mockResolvedValue(undefined),
            refresh_now: vi.fn().mockResolvedValue({ success: true, source: "kimi" }),
        };
        api = create_local_api_server(store, {
            port: 0,
            auth_deps: {
                cookie: cookie_deps,
                session: { sessionManager: { start_login: vi.fn() } },
                grok: { manager: grok_manager } as never,
                kimi: { manager: kimi_manager } as never,
            },
        });
        await api.start();
        const base = `http://127.0.0.1:${String(api.get_port())}`;

        const cookie_login = await fetch(`${base}/v1/auth/cookieLogin`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ instanceId: "mimo-1" }),
        });
        expect(cookie_login.status).toBe(200);
        await expect(cookie_login.json()).resolves.toEqual({ started: true });
        await vi.waitFor(() => {
            expect(cookie_manager.start_login).toHaveBeenCalledWith({
                instance_id: "mimo-1",
                provider: "mimo",
                login_url: "https://platform.xiaomimimo.com/console/plan-manage",
                cookie_names: ["SESSION_COOKIE"],
                auto_close_ms: 1500,
            });
        });

        const cookie_status = await fetch(`${base}/v1/auth/cookieLogin/status?instanceId=mimo-1`);
        expect(cookie_status.status).toBe(200);
        const cookie_status_body = (await cookie_status.json()) as {
            in_progress: boolean;
            saved: boolean;
        };
        expect(cookie_status_body).toEqual({ in_progress: true, saved: true });
        expect(JSON.stringify(cookie_status_body)).not.toContain("secret-cookie");
        resolve_cookie_login({ saved: true });

        for (const namespace of ["grok", "kimi"] as const) {
            const manager = namespace === "grok" ? grok_manager : kimi_manager;
            const other_manager = namespace === "grok" ? kimi_manager : grok_manager;
            const device_code = `${namespace}-device-code`;
            const token = `${namespace}-token`;
            const user_code = `${namespace.toUpperCase()}-CODE`;
            const expires_at = `${namespace}-expiry`;
            const other_start_calls = other_manager.start_device_login.mock.calls.length;

            const start = await fetch(`${base}/v1/auth/${namespace}/loginStart`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
            });
            expect(start.status).toBe(200);
            await expect(start.json()).resolves.toMatchObject({ user_code });
            expect(manager.start_device_login).toHaveBeenCalledTimes(1);
            expect(other_manager.start_device_login.mock.calls).toHaveLength(other_start_calls);

            const other_poll_calls = other_manager.await_completion.mock.calls.length;
            const poll = await fetch(`${base}/v1/auth/${namespace}/loginPoll`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    instance_id: `${namespace}-1`,
                    device_code,
                    interval: namespace === "grok" ? 5 : 7,
                    expires_at_epoch_ms: Date.now() + 600_000,
                }),
            });
            expect(poll.status).toBe(200);
            await expect(poll.json()).resolves.toEqual({ saved: true, token });
            expect(manager.await_completion).toHaveBeenCalledWith(
                device_code,
                namespace === "grok" ? 5 : 7,
                expect.any(Number),
                `${namespace}-1`,
            );
            expect(other_manager.await_completion.mock.calls).toHaveLength(other_poll_calls);

            const cancel = await fetch(`${base}/v1/auth/${namespace}/loginCancel`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ instance_id: `${namespace}-1` }),
            });
            expect(cancel.status).toBe(200);
            await expect(cancel.json()).resolves.toEqual({});
            expect(manager.cancel_device_login).toHaveBeenCalledWith(`${namespace}-1`);

            const status = await fetch(
                `${base}/v1/auth/${namespace}/loginStatus?instanceId=${namespace}-1`,
            );
            expect(status.status).toBe(200);
            await expect(status.json()).resolves.toEqual({
                has_token: true,
                expires_at,
                can_refresh: true,
            });
            expect(manager.get_login_status).toHaveBeenCalledWith(`${namespace}-1`);

            const logout = await fetch(`${base}/v1/auth/${namespace}/logout`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ instance_id: `${namespace}-1` }),
            });
            expect(logout.status).toBe(200);
            await expect(logout.json()).resolves.toEqual({ logged_out: true });
            expect(manager.logout).toHaveBeenCalledWith(`${namespace}-1`);

            const refresh = await fetch(`${base}/v1/auth/${namespace}/refresh`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ instance_id: `${namespace}-1` }),
            });
            expect(refresh.status).toBe(200);
            await expect(refresh.json()).resolves.toEqual({ success: true, source: namespace });
            expect(manager.refresh_now).toHaveBeenCalledWith(`${namespace}-1`);
        }

        const malformed_cookie = await fetch(`${base}/v1/auth/cookieLogin`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        });
        expect(malformed_cookie.status).toBe(400);

        const malformed_poll = await fetch(`${base}/v1/auth/grok/loginPoll`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                instance_id: "grok-1",
                device_code: "grok-device-code",
                interval: "5",
                expires_at_epoch_ms: Date.now() + 600_000,
            }),
        });
        expect(malformed_poll.status).toBe(400);
    });

    it("captures a local login-station cookie into the vault and reports no-display errors", async () => {
        const { create_session_manager } =
            await import("../../../src/main/core/session/session-manager");
        const login_station = createServer((req, res) => {
            if (req.url === "/login") {
                res.setHeader("Set-Cookie", "SESSION_COOKIE=local-cookie-sentinel; Path=/");
                res.end("login station");
                return;
            }
            res.statusCode = 404;
            res.end();
        });
        const login_port = await new Promise<number>((resolve) => {
            login_station.listen(0, "127.0.0.1", () => {
                const address = login_station.address();
                if (address && typeof address === "object") resolve(address.port);
            });
        });
        const login_url = `http://127.0.0.1:${String(login_port)}/login`;

        function create_memory_vault() {
            const values = new Map<string, string>();
            return {
                values,
                get: (key: string) => Promise.resolve(values.get(key) ?? null),
                set: (key: string, value: string) => {
                    values.set(key, value);
                    return Promise.resolve();
                },
                delete: (key: string) => {
                    values.delete(key);
                    return Promise.resolve();
                },
                has: (key: string) => Promise.resolve(values.has(key)),
                list_keys: (prefix?: string) =>
                    Promise.resolve(
                        [...values.keys()].filter((key) =>
                            prefix ? key.startsWith(prefix) : true,
                        ),
                    ),
                replaceAll: (entries: Record<string, string>) => {
                    values.clear();
                    for (const [key, value] of Object.entries(entries)) values.set(key, value);
                    return Promise.resolve();
                },
            };
        }

        const definition = {
            executablePath: "/plugins/mimo",
            manifest: {
                provider: "mimo",
                endpoints: { login: login_url },
                loginDomains: ["127.0.0.1"],
                cookieNames: ["SESSION_COOKIE"],
            },
        } as unknown as ConnectorDefinition;
        const config_store = {
            load: vi.fn().mockResolvedValue({
                plugins: [{ instanceId: "mimo-real", executablePath: "/plugins/mimo" }],
            }),
        };

        function create_cookie_deps(session_manager: unknown, secrets_store: unknown) {
            return {
                configStore: config_store,
                secretsStore: secrets_store,
                definitions: [definition],
                sessionManager: session_manager,
            } as never;
        }

        const vault = create_memory_vault();
        let before_send_headers:
            | ((details: {
                  url: string;
                  requestHeaders: Record<string, string>;
                  resource_type: string;
              }) => void)
            | undefined;
        let closed_listener: (() => void) | undefined;
        let window_closed = false;
        const login_window = {
            async loadURL(url: string): Promise<void> {
                const response = await fetch(url);
                expect(response.headers.get("set-cookie")).toContain(
                    "SESSION_COOKIE=local-cookie-sentinel",
                );
                before_send_headers?.({
                    url,
                    requestHeaders: { Cookie: "SESSION_COOKIE=local-cookie-sentinel" },
                    resource_type: "mainFrame",
                });
                login_window.close();
            },
            close(): void {
                if (window_closed) return;
                window_closed = true;
                closed_listener?.();
            },
            isDestroyed(): boolean {
                return window_closed;
            },
            on(_event: "closed", listener: () => void) {
                closed_listener = listener;
                return this;
            },
        };
        const session_controller = {
            on_before_send_headers(handler: typeof before_send_headers): void {
                before_send_headers = handler;
            },
            get_cookies: vi.fn().mockResolvedValue([]),
        };
        const session_manager = create_session_manager({
            vault,
            has_display: () => true,
            create_window: () => login_window,
            create_session: () => session_controller,
        });
        const cookie_deps = create_cookie_deps(session_manager, vault);
        api = create_local_api_server(store, {
            port: 0,
            auth_deps: {
                cookie: cookie_deps,
                session: { sessionManager: { start_login: vi.fn() } },
                grok: { manager: {} } as never,
                kimi: { manager: {} } as never,
            },
        });
        const { addTransport, getLogLevel, setLogLevel } =
            await import("../../../src/shared/lib/logger");
        const previous_log_level = getLogLevel();
        const log_lines: string[] = [];
        const remove_transport = addTransport({
            write(level, module, message, meta) {
                log_lines.push(`${level}:${module}:${message}:${JSON.stringify(meta)}`);
            },
        });
        setLogLevel("debug");

        try {
            await api.start();
            const base = `http://127.0.0.1:${String(api.get_port())}`;
            const start = await fetch(`${base}/v1/auth/cookieLogin`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ instanceId: "mimo-real" }),
            });
            expect(start.status).toBe(200);
            expect(await start.json()).toEqual({ started: true });

            await vi.waitFor(async () => {
                await expect(vault.get("mimo-real:SESSION_COOKIE")).resolves.toBe(
                    "SESSION_COOKIE=local-cookie-sentinel",
                );
            });
            const status = await fetch(`${base}/v1/auth/cookieLogin/status?instanceId=mimo-real`);
            expect(await status.json()).toEqual({ in_progress: false, saved: true });
            expect(log_lines.join("\n")).not.toContain("local-cookie-sentinel");

            await api.stop();
            const no_display_vault = create_memory_vault();
            const no_display_window = vi.fn();
            const no_display_manager = create_session_manager({
                vault: no_display_vault,
                has_display: () => false,
                create_window: no_display_window,
                create_session: vi.fn(),
            });
            api = create_local_api_server(store, {
                port: 0,
                auth_deps: {
                    cookie: create_cookie_deps(no_display_manager, no_display_vault),
                    session: { sessionManager: { start_login: vi.fn() } },
                    grok: { manager: {} } as never,
                    kimi: { manager: {} } as never,
                },
            });
            await api.start();
            const no_display_base = `http://127.0.0.1:${String(api.get_port())}`;
            const no_display_start = await fetch(`${no_display_base}/v1/auth/cookieLogin`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ instanceId: "mimo-real" }),
            });
            expect(await no_display_start.json()).toEqual({ started: true });
            await vi.waitFor(async () => {
                const response = await fetch(
                    `${no_display_base}/v1/auth/cookieLogin/status?instanceId=mimo-real`,
                );
                const body = (await response.json()) as {
                    in_progress: boolean;
                    saved: boolean;
                    error?: string;
                };
                expect(body.in_progress).toBe(false);
                expect(body.saved).toBe(false);
                expect(body.error).toContain("graphical display");
            });
            expect(no_display_window).not.toHaveBeenCalled();
        } finally {
            remove_transport();
            setLogLevel(previous_log_level);
            await new Promise<void>((resolve, reject) => {
                login_station.close((error) => {
                    if (error) reject(error);
                    else resolve();
                });
            });
        }
    });

    it("falls back to random port when requested port is occupied", async () => {
        const occupied = createServer((_, res) => {
            res.end("occupied");
        });
        const occupied_port = await new Promise<number>((resolve) => {
            occupied.listen(0, "0.0.0.0", () => {
                const addr = occupied.address();
                if (addr && typeof addr === "object") resolve(addr.port);
            });
        });

        await api.stop();
        api = create_local_api_server(store, { port: occupied_port });
        const started = await api.start();
        expect(started.port).not.toBe(occupied_port);
        expect(started.port).toBeGreaterThan(0);

        await new Promise<void>((resolve) => {
            occupied.close(() => {
                resolve();
            });
        });
    });
});

describe("local-api config management", () => {
    let managed_config: AppConfiguration;
    let managed_deps: ConfigIpcDeps;
    const definition = {
        directory: "/plugins/claude",
        executablePath: "/plugins/claude.py",
        manifest: {
            id: "claude",
            provider: "claude",
            capabilities: ["poll"],
            parameters: [{ name: "API_KEY", type: "secret", required: true }],
            poll: { request: { endpoint: "default", path: "/usage", method: "GET" }, map: {} },
        },
    } as unknown as ConnectorDefinition;

    beforeEach(() => {
        managed_config = {
            schemaVersion: 1,
            language: "zh-Hans",
            launchAtLogin: false,
            plugins: [
                {
                    instanceId: "managed-1",
                    stateId: "managed-1",
                    name: "Claude",
                    enabled: true,
                    executablePath: "/plugins/claude.py",
                    refreshIntervalSeconds: 300,
                    parameterValues: {},
                    endpointOverrides: {},
                },
            ],
        };
        const config_store = {
            load: vi.fn(() => Promise.resolve(structuredClone(managed_config))),
            save: vi.fn((next: AppConfiguration) => {
                managed_config = structuredClone(next);
                return Promise.resolve();
            }),
            saveIfBaseMatches: vi.fn((_base: AppConfiguration, next: AppConfiguration) => {
                managed_config = structuredClone(next);
                return Promise.resolve("saved" as const);
            }),
            scheduleSave: vi.fn(),
            flushPendingSave: vi.fn().mockResolvedValue(undefined),
            hasPendingSave: vi.fn().mockReturnValue(false),
            prune_unhealthy_plugins: vi.fn(() => Promise.resolve(structuredClone(managed_config))),
        };
        managed_deps = {
            configStore: config_store,
            secretsStore: {
                get: vi.fn().mockResolvedValue("sk-managed"),
                set: vi.fn().mockResolvedValue(undefined),
                delete: vi.fn().mockResolvedValue(undefined),
                exportAll: vi.fn().mockResolvedValue({ "managed-1:API_KEY": "sk-managed" }),
                importAll: vi.fn().mockResolvedValue(undefined),
            },
            secretParamKeys: new Map([["managed-1", new Set(["API_KEY"])]]),
            definitions: [definition],
            onConfigSaved: vi.fn(),
            onConfigImported: vi.fn(),
        };
        api = create_local_api_server(store, {
            port: 0,
            token_stats_store,
            config_deps: managed_deps,
            connector_deps,
            web_root,
        });
        managed_deps.onConfigSaved = (config) => {
            api.publish_config_change(config);
        };
    });

    it("POST duplicate/createInstance persists new config instances", async () => {
        await api.start();
        const duplicate = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/config/duplicate`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ instanceId: "managed-1" }),
            },
        );
        expect(duplicate.status).toBe(200);
        const duplicate_body = (await duplicate.json()) as { instanceId: string };
        expect(duplicate_body.instanceId).not.toBe("managed-1");
        expect(managed_config.plugins.some((p) => p.instanceId === duplicate_body.instanceId)).toBe(
            true,
        );

        const created = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/config/createInstance`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ manifestId: "claude" }),
            },
        );
        expect(created.status).toBe(200);
        const created_body = (await created.json()) as { instanceId: string };
        expect(created_body.instanceId).toEqual(expect.any(String));
        expect(managed_config.plugins.some((p) => p.instanceId === created_body.instanceId)).toBe(
            true,
        );
    });

    it("export returns native config without secrets by default and with secrets explicitly", async () => {
        await api.start();
        const plain = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/config/export`);
        expect(plain.status).toBe(200);
        const plain_body = (await plain.json()) as {
            plugins: { parameterValues: Record<string, unknown> }[];
        };
        expect(plain_body.plugins[0]?.parameterValues).not.toHaveProperty("API_KEY");

        const with_secrets = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/config/export?includeSecrets=true`,
        );
        expect(with_secrets.status).toBe(200);
        const with_secrets_body = (await with_secrets.json()) as {
            plugins: { parameterValues: Record<string, unknown> }[];
        };
        expect(with_secrets_body.plugins[0]?.parameterValues["API_KEY"]).toBe("sk-managed");
    });

    it("import validates malformed/schema-invalid JSON without changing config", async () => {
        await api.start();
        const incoming = {
            ...structuredClone(managed_config),
            plugins: managed_config.plugins.map((plugin) => ({
                ...plugin,
                parameterValues: { API_KEY: "sk-from-http" },
            })),
        };
        const imported = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/config/import`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(incoming),
            },
        );
        expect(imported.status).toBe(200);
        const imported_body = (await imported.json()) as { imported: boolean };
        expect(imported_body.imported).toBe(true);
        const after_valid_import = structuredClone(managed_config);

        const malformed = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/config/import`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{",
            },
        );
        expect(malformed.status).toBe(400);
        const malformed_body = (await malformed.json()) as { error: string };
        expect(malformed_body.error).toContain("Invalid JSON");
        expect(managed_config).toEqual(after_valid_import);

        const null_body = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/config/import`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "null",
            },
        );
        expect(null_body.status).toBe(400);
        const null_response = (await null_body.json()) as { message: string };
        expect(null_response.message).toContain("导入的配置格式无效");
        expect(managed_config).toEqual(after_valid_import);

        const schema_invalid = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/config/import`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...incoming, launchAtLogin: "not-a-boolean" }),
            },
        );
        expect(schema_invalid.status).toBe(400);
        const schema_invalid_body = (await schema_invalid.json()) as { message: string };
        expect(schema_invalid_body.message).toContain("导入的配置格式无效");
        expect(managed_config).toEqual(after_valid_import);
    });

    it("importing a redacted config preserves the existing secret vault", async () => {
        await api.start();
        const redacted = structuredClone(managed_config);
        const imported = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/config/import`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(redacted),
            },
        );
        expect(imported.status).toBe(200);
        expect(
            (managed_deps.secretsStore.importAll as unknown as { mock: { calls: unknown[][] } })
                .mock.calls,
        ).toHaveLength(0);
        expect(managed_config.plugins[0]?.parameterValues).not.toHaveProperty("API_KEY");
    });

    it("web import rejects endpoint overrides before persisting config or secrets", async () => {
        await api.start();
        const before = structuredClone(managed_config);
        const incoming = {
            ...structuredClone(managed_config),
            plugins: managed_config.plugins.map((plugin) => ({
                ...plugin,
                parameterValues: { API_KEY: "sk-untrusted" },
                endpointOverrides: { default: "https://untrusted.example" },
            })),
        };
        const response = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/config/import`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(incoming),
            },
        );
        expect(response.status).toBe(400);
        const body = (await response.json()) as { message: string };
        expect(body.message).toContain("自定义端点");
        expect(managed_config).toEqual(before);
        expect(
            (managed_deps.secretsStore.importAll as unknown as { mock: { calls: unknown[][] } })
                .mock.calls,
        ).toHaveLength(0);
    });

    it("config save publishes named SSE events to two subscribed clients", async () => {
        await api.start();
        const [first_response, second_response] = await Promise.all([
            fetch(`http://127.0.0.1:${String(api.get_port())}/v1/events`),
            fetch(`http://127.0.0.1:${String(api.get_port())}/v1/events`),
        ]);
        const first_reader = first_response.body?.getReader();
        const second_reader = second_response.body?.getReader();
        if (!first_reader || !second_reader) throw new Error("missing SSE response body");

        const next_config = { ...managed_config, theme: "dark" as const };
        const saved = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/config`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(next_config),
        });
        expect(saved.status).toBe(200);

        const frames = await Promise.all([first_reader.read(), second_reader.read()]);
        for (const frame of frames) {
            const text = new TextDecoder().decode(frame.value);
            expect(text).toContain("event: config");
            expect(text).toContain('"theme":"dark"');
        }
        await Promise.all([first_reader.cancel(), second_reader.cancel()]);
    });
});

describe("local-api web read endpoints", () => {
    it("GET /v1/dashboard returns one bounded DTO without auth", async () => {
        const start = Date.now() - 3600000;
        const end = Date.now() + 1000;
        token_stats_store.upsert_records([
            {
                source: "claude_code",
                env: "local",
                session_id: "dashboard-session",
                title: "Dashboard",
                directory: "/project",
                slug: null,
                version: null,
                parent_session_id: null,
                message_id: "dashboard-message",
                role: "assistant",
                timestamp: start + 1000,
                model: "sonnet",
                input_tokens: 10,
                output_tokens: 1,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                agent: "claude-code",
            },
        ]);

        await api.start();
        const params = new URLSearchParams({
            agent: "all",
            platform: "all",
            start: String(start),
            end: String(end),
            metric: "tokens",
            xaxis: "time",
            gran: "hour",
        });
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/dashboard?${params.toString()}`,
        );
        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toMatchObject({
            current: { tokens: 11, sessions: 1, calls: 1 },
            sessions: { total: 1, has_more: false },
            freshness: { stale: false },
        });
    });

    it("GET /v1/dashboard routes through the isolated dispatcher when provided (AC2)", async () => {
        const dispatcher = {
            request_dashboard: vi.fn(),
            is_running: vi.fn(() => false),
            stop: vi.fn(),
        };
        api = create_local_api_server(store, {
            port: 0,
            token_stats_store,
            token_stats_running: () => false,
            token_stats_query_dispatcher: dispatcher,
            config_deps,
            connector_deps,
            web_root,
        });
        const start = Date.now() - 3600000;
        const end = Date.now() + 1000;
        const params = new URLSearchParams({
            agent: "all",
            platform: "all",
            start: String(start),
            end: String(end),
            metric: "tokens",
            xaxis: "time",
            gran: "hour",
        });
        const expected_dto = {
            query: {
                agent: "all",
                platform: "all",
                start,
                end,
                metric: "tokens",
                xaxis: "time",
                gran: "hour",
            },
            current: {
                tokens: 0,
                sessions: 0,
                calls: 0,
                input_tokens: 0,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                agent_totals: [],
                model_token_totals: [],
                model_call_totals: [],
                project_session_totals: [],
            },
            previous: {
                tokens: 0,
                sessions: 0,
                calls: 0,
                input_tokens: 0,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                agent_totals: [],
                model_token_totals: [],
                model_call_totals: [],
                project_session_totals: [],
            },
            chart_data: {
                axis: { labels: [], bucket_starts: [] },
                metric_buckets: [],
                session_buckets: [],
                rollup: [],
            },
            heatmap: [],
            models: [],
            sessions: { items: [], total: 0, has_more: false },
            status: { running: false, last_updated: null },
            freshness: { queried_at: 3, stale: false },
            data_version: 0,
        };
        dispatcher.request_dashboard.mockResolvedValue(expected_dto);
        await api.start();
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/dashboard?${params.toString()}`,
        );
        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toEqual(expected_dto);
        expect(dispatcher.request_dashboard).toHaveBeenCalledWith(
            expect.objectContaining({ agent: "all", xaxis: "time" }),
            expect.objectContaining({ running: false }),
        );
    });

    it("GET /v1/dashboard forwards an optional model filter (t204)", async () => {
        const dispatcher = {
            request_dashboard: vi.fn(),
            is_running: vi.fn(() => false),
            stop: vi.fn(),
        };
        api = create_local_api_server(store, {
            port: 0,
            token_stats_store,
            token_stats_running: () => false,
            token_stats_query_dispatcher: dispatcher,
            config_deps,
            connector_deps,
            web_root,
        });
        const expected_dto = {
            query: {
                agent: "all",
                platform: "all",
                start: 1,
                end: 2,
                metric: "tokens",
                xaxis: "time",
                gran: "hour",
                model: "sonnet",
            },
            current: {
                tokens: 0,
                sessions: 0,
                calls: 0,
                input_tokens: 0,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                agent_totals: [],
                model_token_totals: [],
                model_call_totals: [],
                project_session_totals: [],
            },
            previous: {
                tokens: 0,
                sessions: 0,
                calls: 0,
                input_tokens: 0,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                agent_totals: [],
                model_token_totals: [],
                model_call_totals: [],
                project_session_totals: [],
            },
            chart_data: {
                axis: { labels: [], bucket_starts: [] },
                metric_buckets: [],
                session_buckets: [],
                rollup: [],
            },
            heatmap: [],
            models: ["sonnet"],
            sessions: { items: [], total: 0, has_more: false },
            status: { running: false, last_updated: null },
            freshness: { queried_at: 3, stale: false },
            data_version: 0,
        };
        dispatcher.request_dashboard.mockResolvedValue(expected_dto);
        await api.start();
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/dashboard?agent=all&platform=all&start=1&end=2&metric=tokens&xaxis=time&gran=hour&model=sonnet`,
        );
        expect(res.status).toBe(200);
        expect(dispatcher.request_dashboard).toHaveBeenCalledWith(
            expect.objectContaining({ model: "sonnet" }),
            expect.anything(),
        );
    });

    it("GET /v1/dashboard rejects an invalid query", async () => {
        await api.start();
        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/dashboard`);
        expect(res.status).toBe(400);
    });

    it("GET /v1/dashboard applies alias and session pagination query params", async () => {
        const start = Date.now() - 3600000;
        const end = Date.now() + 1000;
        token_stats_store.upsert_records([
            {
                source: "claude_code",
                env: "local",
                session_id: "alias-session",
                title: "Dashboard",
                directory: "/project",
                slug: null,
                version: null,
                parent_session_id: null,
                message_id: "alias-message",
                role: "assistant",
                timestamp: start + 1000,
                model: "sonnet",
                input_tokens: 10,
                output_tokens: 1,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                agent: "claude-code",
            },
        ]);

        await api.start();
        const params = new URLSearchParams({
            agent: "all",
            platform: "all",
            start: String(start),
            end: String(end),
            metric: "tokens",
            xaxis: "time",
            gran: "hour",
            session_offset: "100",
        });
        params.set("model_aliases", JSON.stringify([{ alias: "X", keys: ["sonnet"] }]));
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/dashboard?${params.toString()}`,
        );
        expect(res.status).toBe(200);
        const data = (await res.json()) as {
            current: { model_token_totals: { key: string; value: number }[] };
            query: { session_offset: number };
        };
        expect(data.current.model_token_totals).toContainEqual({ key: "X", value: 11 });
        expect(data.query.session_offset).toBe(100);
    });

    it("GET /v1/dashboard rejects malformed alias JSON", async () => {
        await api.start();
        const params = new URLSearchParams({
            agent: "all",
            platform: "all",
            start: "1",
            end: "2",
            metric: "tokens",
            xaxis: "time",
            gran: "hour",
        });
        params.set("model_aliases", "{bad");
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/dashboard?${params.toString()}`,
        );
        expect(res.status).toBe(400);
    });

    it("GET /v1/records returns records without auth", async () => {
        token_stats_store.upsert_records([
            {
                source: "claude_code",
                env: "local",
                session_id: "s1",
                title: null,
                directory: null,
                slug: null,
                version: null,
                parent_session_id: null,
                message_id: "m1",
                role: "assistant",
                timestamp: Date.now(),
                model: "sonnet",
                input_tokens: 10,
                output_tokens: 1,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                agent: "claude-code",
            },
        ]);
        await api.start();
        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/records`);
        expect(res.status).toBe(200);
        const data = (await res.json()) as unknown[];
        expect(data).toHaveLength(1);
        expect(data[0]).toMatchObject({ message_id: "m1", agent: "claude-code" });
    });

    it("GET /v1/heatmap returns weekday×hour aggregate cells without auth", async () => {
        // 2026-07-06 09:00 UTC+8 = Monday (strftime %w=1), hour 9.
        const ts = Date.parse("2026-07-06T09:00:00+08:00");
        token_stats_store.upsert_records([
            {
                source: "claude_code",
                env: "local",
                session_id: "s1",
                title: null,
                directory: null,
                slug: null,
                version: null,
                parent_session_id: null,
                message_id: "m1",
                role: "assistant",
                timestamp: ts,
                model: "sonnet",
                input_tokens: 10,
                output_tokens: 1,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                agent: "claude-code",
            },
        ]);
        await api.start();
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/heatmap?env=local&start=${String(
                ts - 1,
            )}&end=${String(ts + 1)}`,
        );
        expect(res.status).toBe(200);
        const data = (await res.json()) as {
            weekday: number;
            hour: number;
            calls: number;
            tokens: number;
        }[];
        expect(data).toHaveLength(1);
        expect(data[0]).toMatchObject({ weekday: 1, hour: 9, calls: 1, tokens: 11 });
    });

    it("GET /v1/hourBuckets returns hour×model aggregates without auth (t173)", async () => {
        // 2026-07-06 09:00 UTC+8 is an exact local whole hour.
        const ts = Date.parse("2026-07-06T09:00:00+08:00");
        token_stats_store.upsert_records([
            {
                source: "claude_code",
                env: "local",
                session_id: "s1",
                title: null,
                directory: null,
                slug: null,
                version: null,
                parent_session_id: null,
                message_id: "m1",
                role: "assistant",
                timestamp: ts,
                model: "sonnet",
                input_tokens: 10,
                output_tokens: 1,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                agent: "claude-code",
            },
        ]);
        await api.start();
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/hourBuckets?env=local&start=${String(
                ts - 1,
            )}&end=${String(ts + 1)}`,
        );
        expect(res.status).toBe(200);
        const data = (await res.json()) as {
            hour_start: number;
            model: string;
            calls: number;
            sessions: number;
            tokens: number;
        }[];
        expect(data).toHaveLength(1);
        expect(data[0]).toMatchObject({
            hour_start: ts,
            model: "sonnet",
            calls: 1,
            sessions: 1,
            tokens: 11,
        });
    });

    it("GET /v1/{dashboard/sessions,heatmap,hourBuckets,rollup} forward model to the store (t206 AC3)", async () => {
        await api.start();
        const base = `http://127.0.0.1:${String(api.get_port())}`;
        // sessions requires agent+platform; the other three accept them too.
        const win = `agent=all&platform=all&start=1&end=2&model=sonnet`;

        const sessions_spy = vi.spyOn(token_stats_store, "query_dashboard_sessions");
        const res_sess = await fetch(`${base}/v1/dashboard/sessions?${win}`);
        expect(res_sess.status).toBe(200);
        expect(sessions_spy).toHaveBeenCalledWith(expect.objectContaining({ model: "sonnet" }));

        const heat_spy = vi.spyOn(token_stats_store, "query_heatmap");
        const res_heat = await fetch(`${base}/v1/heatmap?${win}`);
        expect(res_heat.status).toBe(200);
        expect(heat_spy).toHaveBeenCalledWith(expect.objectContaining({ model: "sonnet" }));

        const hour_spy = vi.spyOn(token_stats_store, "query_hour_buckets");
        const res_hour = await fetch(`${base}/v1/hourBuckets?${win}`);
        expect(res_hour.status).toBe(200);
        expect(hour_spy).toHaveBeenCalledWith(expect.objectContaining({ model: "sonnet" }));

        const rollup_spy = vi.spyOn(token_stats_store, "query_range_rollup");
        const res_roll = await fetch(`${base}/v1/rollup?${win}`);
        expect(res_roll.status).toBe(200);
        expect(rollup_spy).toHaveBeenCalledWith(expect.objectContaining({ model: "sonnet" }));
    });

    it("web read endpoints do not require bearer auth", async () => {
        await api.start();
        for (const path of [
            "/v1/records",
            "/v1/sessions",
            "/v1/buckets",
            "/v1/heatmap",
            "/v1/hourBuckets",
            "/v1/status",
        ]) {
            const res = await fetch(`http://127.0.0.1:${String(api.get_port())}${path}`);
            expect(res.status, path).toBe(200);
        }
    });

    it("GET /v1/config returns config without auth", async () => {
        await api.start();
        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/config`);
        expect(res.status).toBe(200);
        const data = (await res.json()) as { config: { language: string } };
        expect(data.config.language).toBe("zh-Hans");
    });

    it("GET /v1/secrets returns plaintext secret without auth", async () => {
        await api.start();
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/secrets?instanceId=inst-1`,
        );
        expect(res.status).toBe(200);
        const data = (await res.json()) as Record<string, string>;
        expect(data["apiKey"]).toBe("sk-plain");
    });

    it("GET / serves the web index.html without auth", async () => {
        await api.start();
        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/`);
        expect(res.status).toBe(200);
        expect(await res.text()).toContain("web panel");
    });

    it("GET / HTML 响应带 CSP 与 nosniff（p124）", async () => {
        await api.start();
        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/`);
        expect(res.headers.get("content-security-policy")).toContain("script-src 'self'");
        expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
        expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    });

    it("GET /v1/connectors JSON 响应带 nosniff（p124）", async () => {
        await api.start();
        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/connectors`);
        expect(res.status).toBe(200);
        expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    });

    it("GET /v1/connectors returns list without auth", async () => {
        await api.start();
        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/connectors`);
        expect(res.status).toBe(200);
        const data = (await res.json()) as unknown[];
        expect(Array.isArray(data)).toBe(true);
    });

    it("GET /v1/trend requires sourceInstanceId (t214)", async () => {
        await api.start();
        const url = `http://127.0.0.1:${String(api.get_port())}/v1/trend?provider=tavily&accountId=tavily&metricId=tavily:total-month`;
        const res = await fetch(url);
        expect(res.status).toBe(400);
    });

    it("GET /v1/trend filters by source_instance_id (t214 multi-account isolation)", async () => {
        // 同 (provider, account_id, metric_id) 双实例，web 端点按实例过滤
        const now = Date.now();
        const base = {
            provider: "tavily",
            account_id: "tavily",
            metric_id: "tavily:total-month",
            raw_label: "total-month",
            normalized_label: "月用量",
            account_label: "Tavily",
            window: "month" as const,
            cycleDurationMs: 30 * 24 * 3_600_000,
            display_style: "ratio" as const,
            reset_at: null,
            status: "normal" as const,
            source: "poll" as const,
            stale: false,
            last_error: null,
        };
        store.insert({
            ...base,
            source_instance_id: "inst-a",
            used: 100,
            limit: 1000,
            observed_at: now,
        });
        store.insert({
            ...base,
            source_instance_id: "inst-b",
            used: 500,
            limit: 1000,
            observed_at: now,
        });

        await api.start();
        const base_url = `http://127.0.0.1:${String(api.get_port())}/v1/trend`;
        const res_a = await fetch(
            `${base_url}?provider=tavily&accountId=tavily&metricId=tavily:total-month&sourceInstanceId=inst-a`,
        );
        expect(res_a.status).toBe(200);
        const series_a = (await res_a.json()) as ({ percent: number } | null)[];
        const points_a = series_a.filter((p) => p !== null);
        expect(points_a.length).toBe(1);
        // inst-a: used 100/1000 = 10%
        expect(points_a[0]?.percent).toBe(10);

        const res_b = await fetch(
            `${base_url}?provider=tavily&accountId=tavily&metricId=tavily:total-month&sourceInstanceId=inst-b`,
        );
        const series_b = (await res_b.json()) as ({ percent: number } | null)[];
        const points_b = series_b.filter((p) => p !== null);
        // inst-b: used 500/1000 = 50%，不串 inst-a 的 10%
        expect(points_b[0]?.percent).toBe(50);
    });
});

describe("local-api session history endpoints (t259)", () => {
    let session_home: string;

    function make_session_row(overrides: Partial<SessionRow> = {}): SessionRow {
        return {
            id: "sess-1",
            source: "claude_code",
            env: "local",
            title: "Test Session",
            model: null,
            started_at: 0,
            ended_at: 1000,
            session: {
                id: "sess-1",
                source: "claude_code",
                env: "local",
                model: "sonnet",
                title: "Test Session",
                directory: "/proj",
                input_tokens: 100,
                output_tokens: 50,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                calls: 3,
                started_at: 0,
                ended_at: 1000,
            },
            ...overrides,
        };
    }

    function base_session_service() {
        return {
            query: vi.fn(
                (): QueryResult => ({
                    messages: [{ id: "m1", role: "user" as const, text: "hello", timestamp: 100 }],
                    next_cursor: null,
                }),
            ),
            searchContent: vi.fn(() => Promise.resolve(new Set(["claude_code|local|sess-1"]))),
            searchContentWithAbort: vi.fn<
                (locs: unknown[], keyword: string, abortSignal: AbortSignal) => Promise<Set<string>>
            >(() => Promise.resolve(new Set(["claude_code|local|sess-1"]))),
            summaries: vi.fn(() => Promise.resolve({ "claude_code|local|sess-1": "hello world" })),
            // t279: web 订阅。测试捕获 on_update 以便触发增量推送。
            subscribe: vi.fn(
                (params: {
                    source: string;
                    env: Env;
                    session_id: string;
                    file_path: string;
                    extractor_kind: string;
                    subscriber_id?: string;
                    on_update: (messages: unknown[]) => void;
                }) => {
                    void params;
                    return "claude_code|local|sess-1";
                },
            ),
            unsubscribe: vi.fn(),
        };
    }

    beforeEach(async () => {
        clear_resolution_cache();
        session_home = await mkdtemp(join(tmpdir(), "session-history-home-"));
        await mkdir(join(session_home, ".claude", "projects"), { recursive: true });
        // claude_code 快速路径：文件名 === session_id.jsonl。
        await writeFile(
            join(session_home, ".claude", "projects", "sess-1.jsonl"),
            '{"sessionId":"sess-1"}\n',
        );
    });

    afterEach(async () => {
        await api.stop();
        await rm(session_home, { recursive: true, force: true });
        clear_resolution_cache();
    });

    function setup_session_api(
        service: ReturnType<typeof base_session_service>,
        provider: SessionsProvider,
    ): void {
        api = create_local_api_server(store, {
            port: 0,
            token_stats_store,
            config_deps,
            connector_deps,
            web_root,
            session_history_deps: {
                service: service as unknown as SessionHistorySubscriptionService,
                sessions_provider: provider,
                locator_paths: {
                    host: "linux",
                    homedir: session_home,
                    win_home: session_home,
                    wsl_distro: "Ubuntu-22.04",
                    wsl_user: "",
                },
            },
        });
    }

    it("GET /v1/sessionHistory 带完整 source/env 返回消息 (t259 AC1)", async () => {
        const service = base_session_service();
        const provider: SessionsProvider = vi.fn(() => [make_session_row()]);
        setup_session_api(service, provider);
        await api.start();
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/sessionHistory?id=sess-1&source=claude_code&env=local&limit=10`,
        );
        expect(res.status).toBe(200);
        const data = (await res.json()) as { messages: unknown[]; next_cursor: unknown };
        expect(data.messages).toHaveLength(1);
        expect(data.messages[0]).toMatchObject({ id: "m1", role: "user", text: "hello" });
        expect(data.next_cursor).toBeNull();
        expect(service.query).toHaveBeenCalledWith(
            expect.objectContaining({ source: "claude_code", env: "local", session_id: "sess-1" }),
            expect.objectContaining({ limit: 10 }),
        );
    });

    it("GET /v1/sessionHistory 缺 source/env 返回 400，不再全量枚举 (t263)", async () => {
        const service = base_session_service();
        const provider: SessionsProvider = vi.fn(() => [make_session_row()]);
        setup_session_api(service, provider);
        await api.start();
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/sessionHistory?id=sess-1&limit=10`,
        );
        expect(res.status).toBe(400);
        // id-only 不再触发 sessions_provider 全量枚举反查。
        expect(provider).not.toHaveBeenCalled();
        expect(service.query).not.toHaveBeenCalled();
    });

    it("GET /v1/sessionHistory maps string before_cursor to a pagination cursor", async () => {
        const service = base_session_service();
        service.query.mockReturnValue({
            messages: [{ id: "m2", role: "assistant" as const, text: "prev", timestamp: 200 }],
            next_cursor: { kind: "pagination", end_index: 5 },
        });
        setup_session_api(
            service,
            vi.fn(() => [make_session_row()]),
        );
        await api.start();
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/sessionHistory?id=sess-1&source=claude_code&env=local&limit=10&before_cursor=20`,
        );
        expect(res.status).toBe(200);
        const data = (await res.json()) as { next_cursor: unknown };
        // HTTP 边界游标序列化为字符串（与 web query 的 before_cursor 编码一致）。
        expect(data.next_cursor).toBe("5");
        expect(service.query).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                limit: 10,
                before_cursor: { kind: "pagination", end_index: 20 },
            }),
        );
    });

    it("GET /v1/sessionHistory returns 400 when id is missing", async () => {
        setup_session_api(
            base_session_service(),
            vi.fn(() => []),
        );
        await api.start();
        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/sessionHistory`);
        expect(res.status).toBe(400);
    });

    it("GET /v1/sessionHistory returns 404 for an unresolvable session", async () => {
        setup_session_api(
            base_session_service(),
            vi.fn(() => []),
        );
        await api.start();
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/sessionHistory?id=missing&source=claude_code&env=local`,
        );
        expect(res.status).toBe(404);
    });

    it("POST /v1/sessionHistory/searchContent returns hits and sessions (t259 AC1)", async () => {
        const service = base_session_service();
        setup_session_api(
            service,
            vi.fn(() => [make_session_row()]),
        );
        await api.start();
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/sessionHistory/searchContent`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filters: { sources: ["claude_code"] }, keyword: "hello" }),
            },
        );
        expect(res.status).toBe(200);
        const data = (await res.json()) as {
            hits: string[];
            sessions: { id: string; source: string }[];
        };
        expect(data.hits).toEqual(["claude_code|local|sess-1"]);
        expect(data.sessions).toHaveLength(1);
        expect(data.sessions[0]).toMatchObject({ id: "sess-1", source: "claude_code" });
        expect(service.searchContentWithAbort).toHaveBeenCalledWith(
            [expect.objectContaining({ session_id: "sess-1" })],
            "hello",
            expect.any(AbortSignal),
        );
    });

    it("POST /v1/sessionHistory/searchContent 客户端断连时中止底层搜索 (t263)", async () => {
        const service = base_session_service();
        // 挂起搜索直到 abort signal 触发，模拟长时间扫盘。
        service.searchContentWithAbort.mockImplementation(
            (_locs: unknown[], _keyword: string, signal: AbortSignal) =>
                new Promise<Set<string>>((resolve) => {
                    signal.addEventListener("abort", () => {
                        resolve(new Set<string>());
                    });
                }),
        );
        setup_session_api(
            service,
            vi.fn(() => [make_session_row()]),
        );
        await api.start();

        const controller = new AbortController();
        const req = fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/sessionHistory/searchContent`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filters: { sources: ["claude_code"] }, keyword: "hello" }),
                signal: controller.signal,
            },
        ).catch(() => {
            /* 客户端已 abort，fetch 拒绝符合预期 */
        });
        await vi.waitFor(() => {
            expect(service.searchContentWithAbort).toHaveBeenCalled();
        });
        // 客户端断连 → 服务端 res close → abort 底层扫描。
        controller.abort();
        const calls = service.searchContentWithAbort.mock.calls as unknown as [
            unknown[],
            string,
            AbortSignal,
        ][];
        const signal = calls[0]?.[2];
        await vi.waitFor(() => {
            expect(signal?.aborted).toBe(true);
        });
        await req;
    });

    it("POST /v1/sessionHistory/searchContent returns 400 for malformed bodies (t259 f001)", async () => {
        const service = base_session_service();
        setup_session_api(
            service,
            vi.fn(() => [make_session_row()]),
        );
        await api.start();
        const port = String(api.get_port());
        const bad_bodies: unknown[] = [
            { keyword: "x" }, // 缺 filters
            { filters: {}, keyword: 5 }, // keyword 非 string
            { filters: { sources: 5 }, keyword: "x" }, // sources 非数组
            { filters: { search: 5 }, keyword: "x" }, // search 非 string
            { locs: "str", keyword: "x" }, // legacy locs 非数组
            { locs: [{ source: "a" }], keyword: "x" }, // legacy loc 缺字段
        ];
        for (const body of bad_bodies) {
            const res = await fetch(`http://127.0.0.1:${port}/v1/sessionHistory/searchContent`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            expect(res.status).toBe(400);
        }
        expect(service.searchContent).not.toHaveBeenCalled();
    });

    it("POST /v1/sessionHistory/summaries returns 400 for non-array locs", async () => {
        const service = base_session_service();
        setup_session_api(
            service,
            vi.fn(() => []),
        );
        await api.start();
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/sessionHistory/summaries`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ locs: "nope" }),
            },
        );
        expect(res.status).toBe(400);
        // 畸形 loc 条目被跳过而非 500。
        const res2 = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/sessionHistory/summaries`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    locs: [null, { source: "claude_code", env: "local", session_id: "sess-1" }],
                }),
            },
        );
        expect(res2.status).toBe(200);
        expect(service.summaries).toHaveBeenCalled();
    });

    it("POST /v1/sessionHistory/searchContent supports legacy locs form (t259 f002)", async () => {
        const service = base_session_service();
        setup_session_api(
            service,
            vi.fn(() => [make_session_row()]),
        );
        await api.start();
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/sessionHistory/searchContent`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    locs: [{ source: "claude_code", env: "local", session_id: "sess-1" }],
                    keyword: "hello",
                }),
            },
        );
        expect(res.status).toBe(200);
        expect(service.searchContentWithAbort).toHaveBeenCalled();
    });

    it("POST /v1/sessionHistory/summaries returns per-loc summaries (t259 AC1)", async () => {
        const service = base_session_service();
        setup_session_api(
            service,
            vi.fn(() => []),
        );
        await api.start();
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/sessionHistory/summaries`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    locs: [
                        { source: "claude_code", env: "local", session_id: "sess-1" },
                        { source: "claude_code", env: "local", session_id: "missing" },
                    ],
                }),
            },
        );
        expect(res.status).toBe(200);
        const data = (await res.json()) as { summaries: Record<string, string> };
        expect(data.summaries).toEqual({ "claude_code|local|sess-1": "hello world" });
        expect(service.summaries).toHaveBeenCalledWith([
            expect.objectContaining({ session_id: "sess-1" }),
        ]);
    });

    it("POST /v1/sessionHistory/subscribe 未先经 /v1/events 注册返回 409 (t279)", async () => {
        const service = base_session_service();
        setup_session_api(
            service,
            vi.fn(() => []),
        );
        await api.start();
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/sessionHistory/subscribe`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    source: "claude_code",
                    env: "local",
                    session_id: "sess-1",
                    subscriber_id: "web-unconnected",
                }),
            },
        );
        expect(res.status).toBe(409);
        expect(service.subscribe).not.toHaveBeenCalled();
    });

    it("POST /v1/sessionHistory/subscribe 挂 SSE 连接，on_update 增量经 SSE 推 messagesUpdated (t279 AC1)", async () => {
        const service = base_session_service();
        const sub_api = create_local_api_server(store, {
            port: 0,
            token_stats_store,
            connector_deps,
            session_history_deps: {
                service: service as unknown as SessionHistorySubscriptionService,
                sessions_provider: vi.fn(() => []),
                locator_paths: {
                    host: "linux",
                    homedir: session_home,
                    win_home: session_home,
                    wsl_distro: "Ubuntu-22.04",
                    wsl_user: "",
                },
            },
        });
        await sub_api.start();
        try {
            const base = `http://127.0.0.1:${String(sub_api.get_port())}`;
            const sse_res = await fetch(`${base}/v1/events?subscriberId=web-sse-1`);
            expect(sse_res.status).toBe(200);
            expect(sse_res.headers.get("content-type")).toContain("text/event-stream");
            const reader = sse_res.body?.getReader();
            if (!reader) throw new Error("no sse body");

            const sub_res = await fetch(`${base}/v1/sessionHistory/subscribe`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    source: "claude_code",
                    env: "local",
                    session_id: "sess-1",
                    subscriber_id: "web-sse-1",
                }),
            });
            expect(sub_res.status).toBe(200);
            const sub_body = (await sub_res.json()) as { subscribed: boolean };
            expect(sub_body.subscribed).toBe(true);
            expect(service.subscribe).toHaveBeenCalledWith(
                expect.objectContaining({
                    source: "claude_code",
                    env: "local",
                    session_id: "sess-1",
                    subscriber_id: "web-sse-1",
                }),
            );

            // 触发 watcher 增量：service 捕获的 on_update 收到新消息后应推给 SSE 客户端。
            const params = service.subscribe.mock.calls[0]?.[0] as {
                on_update: (messages: unknown[]) => void;
            };
            expect(params).toBeDefined();
            params.on_update([{ id: "m2", role: "assistant", text: "world", timestamp: 200 }]);

            let raw = "";
            const deadline = Date.now() + 5000;
            while (Date.now() < deadline) {
                const { value, done } = await reader.read();
                if (value) raw += new TextDecoder().decode(value);
                if (done) break;
                if (raw.includes("messagesUpdated")) break;
            }
            expect(raw).toContain("event: messagesUpdated");
            expect(raw).toContain('"session_id":"sess-1"');
            expect(raw).toContain('"text":"world"');
            await reader.cancel();
        } finally {
            await sub_api.stop();
        }
    });

    it("POST /v1/sessionHistory/unsubscribe 只注销目标订阅方，不误伤同 loc 其他订阅方 (t279 AC1)", async () => {
        const service = base_session_service();
        const sub_api = create_local_api_server(store, {
            port: 0,
            token_stats_store,
            connector_deps,
            session_history_deps: {
                service: service as unknown as SessionHistorySubscriptionService,
                sessions_provider: vi.fn(() => []),
                locator_paths: {
                    host: "linux",
                    homedir: session_home,
                    win_home: session_home,
                    wsl_distro: "Ubuntu-22.04",
                    wsl_user: "",
                },
            },
        });
        await sub_api.start();
        try {
            const base = `http://127.0.0.1:${String(sub_api.get_port())}`;
            // 两个独立 SSE 连接各自订阅同一 loc：注销其一不得触发另一连接注销。
            const sse_a = await fetch(`${base}/v1/events?subscriberId=web-sub-a`);
            const reader_a = sse_a.body?.getReader();
            if (!reader_a) throw new Error("no sse body");
            const sse_b = await fetch(`${base}/v1/events?subscriberId=web-sub-b`);
            const reader_b = sse_b.body?.getReader();
            if (!reader_b) throw new Error("no sse body");
            for (const subscriber_id of ["web-sub-a", "web-sub-b"]) {
                const res = await fetch(`${base}/v1/sessionHistory/subscribe`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        source: "claude_code",
                        env: "local",
                        session_id: "sess-1",
                        subscriber_id,
                    }),
                });
                expect(res.status).toBe(200);
            }

            const unsub = await fetch(`${base}/v1/sessionHistory/unsubscribe`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subscriber_id: "web-sub-b" }),
            });
            expect(unsub.status).toBe(200);
            // 注销只触达目标订阅方；web-sub-a 的连接未关，其订阅仍在。
            expect(service.unsubscribe).toHaveBeenCalledTimes(1);
            expect(service.unsubscribe).toHaveBeenCalledWith(
                "claude_code",
                "local",
                "sess-1",
                "web-sub-b",
            );
            await reader_a.cancel();
            await reader_b.cancel();
        } finally {
            await sub_api.stop();
        }
    });

    it("SSE 连接关闭时自动注销其持有的会话订阅，防 watcher 泄漏 (t279 f004)", async () => {
        const service = base_session_service();
        const sub_api = create_local_api_server(store, {
            port: 0,
            token_stats_store,
            connector_deps,
            session_history_deps: {
                service: service as unknown as SessionHistorySubscriptionService,
                sessions_provider: vi.fn(() => []),
                locator_paths: {
                    host: "linux",
                    homedir: session_home,
                    win_home: session_home,
                    wsl_distro: "Ubuntu-22.04",
                    wsl_user: "",
                },
            },
        });
        await sub_api.start();
        try {
            const base = `http://127.0.0.1:${String(sub_api.get_port())}`;
            const sse_res = await fetch(`${base}/v1/events?subscriberId=web-leak-1`);
            const reader = sse_res.body?.getReader();
            if (!reader) throw new Error("no sse body");
            const sub_res = await fetch(`${base}/v1/sessionHistory/subscribe`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    source: "claude_code",
                    env: "local",
                    session_id: "sess-1",
                    subscriber_id: "web-leak-1",
                }),
            });
            expect(sub_res.status).toBe(200);
            expect(service.unsubscribe).not.toHaveBeenCalled();

            await reader.cancel();
            await new Promise((resolve) => {
                setTimeout(resolve, 120);
            });
            // close 触发 cleanup → 注销该订阅（不依赖显式 unsubscribe）。
            expect(service.unsubscribe).toHaveBeenCalledWith(
                "claude_code",
                "local",
                "sess-1",
                "web-leak-1",
            );
        } finally {
            await sub_api.stop();
        }
    });

    it("SSE 断连 cleanup 注销旧订阅，新连接重挂后独立活跃 (t279 f005)", async () => {
        const service = base_session_service();
        const sub_api = create_local_api_server(store, {
            port: 0,
            token_stats_store,
            connector_deps,
            session_history_deps: {
                service: service as unknown as SessionHistorySubscriptionService,
                sessions_provider: vi.fn(() => []),
                locator_paths: {
                    host: "linux",
                    homedir: session_home,
                    win_home: session_home,
                    wsl_distro: "Ubuntu-22.04",
                    wsl_user: "",
                },
            },
        });
        await sub_api.start();
        try {
            const base = `http://127.0.0.1:${String(sub_api.get_port())}`;
            // 旧连接注册订阅。
            const old_sse = await fetch(`${base}/v1/events?subscriberId=web-race-1`);
            const old_reader = old_sse.body?.getReader();
            if (!old_reader) throw new Error("no sse body");
            const sub1 = await fetch(`${base}/v1/sessionHistory/subscribe`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    source: "claude_code",
                    env: "local",
                    session_id: "sess-1",
                    subscriber_id: "web-race-1",
                }),
            });
            expect(sub1.status).toBe(200);

            // 断连：旧连接 close → 服务端 cleanup 注销该订阅（防泄漏）。
            await old_reader.cancel();
            await new Promise((resolve) => {
                setTimeout(resolve, 120);
            });
            expect(service.unsubscribe).toHaveBeenCalledWith(
                "claude_code",
                "local",
                "sess-1",
                "web-race-1",
            );

            // 重连：新连接用同 subscriber_id 重挂，重新建立订阅。
            const new_sse = await fetch(`${base}/v1/events?subscriberId=web-race-1`);
            const new_reader = new_sse.body?.getReader();
            if (!new_reader) throw new Error("no sse body");
            const sub2 = await fetch(`${base}/v1/sessionHistory/subscribe`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    source: "claude_code",
                    env: "local",
                    session_id: "sess-1",
                    subscriber_id: "web-race-1",
                }),
            });
            expect(sub2.status).toBe(200);

            // 新连接关闭前订阅保持活跃（无额外注销）。
            await new Promise((resolve) => {
                setTimeout(resolve, 120);
            });
            expect(service.unsubscribe).toHaveBeenCalledTimes(1);
            await new_reader.cancel();
            await new Promise((resolve) => {
                setTimeout(resolve, 120);
            });
            // 新连接关闭才再次注销（重挂后独立生命周期）。
            expect(service.unsubscribe).toHaveBeenCalledTimes(2);
        } finally {
            await sub_api.stop();
        }
    });
});

describe("local-api logs export (t279)", () => {
    it("GET /v1/logs/export 流式返回当前活跃日志段并带下载头", async () => {
        const logs_home = await mkdtemp(join(tmpdir(), "omni-logs-export-"));
        try {
            const date = new Date().toISOString().slice(0, 10);
            // get_logs_dir(base) = <base>/logs，与桌面 exportCurrentLog 同路径语义。
            await mkdir(join(logs_home, "logs"), { recursive: true });
            await writeFile(join(logs_home, "logs", `app-${date}.log`), "export-sentinel-line\n");
            const export_api = create_local_api_server(store, {
                port: 0,
                token_stats_store,
                connector_deps,
                user_data_path: logs_home,
            });
            await export_api.start();
            try {
                const res = await fetch(
                    `http://127.0.0.1:${String(export_api.get_port())}/v1/logs/export`,
                );
                expect(res.status).toBe(200);
                expect(res.headers.get("content-disposition")).toContain(
                    `omni-panel-log-${date}.log`,
                );
                expect(await res.text()).toBe("export-sentinel-line\n");
            } finally {
                await export_api.stop();
            }
        } finally {
            await rm(logs_home, { recursive: true, force: true });
        }
    });

    it("GET /v1/logs/export 日志文件缺失时返回 200 空下载", async () => {
        const logs_home = await mkdtemp(join(tmpdir(), "omni-logs-export-missing-"));
        try {
            const export_api = create_local_api_server(store, {
                port: 0,
                token_stats_store,
                connector_deps,
                user_data_path: logs_home,
            });
            await export_api.start();
            try {
                const res = await fetch(
                    `http://127.0.0.1:${String(export_api.get_port())}/v1/logs/export`,
                );
                expect(res.status).toBe(200);
                expect(res.headers.get("content-disposition")).toContain(".log");
                expect(await res.text()).toBe("");
            } finally {
                await export_api.stop();
            }
        } finally {
            await rm(logs_home, { recursive: true, force: true });
        }
    });

    it("未配置 user_data_path 时 /v1/logs/export 返回 503", async () => {
        const plain_api = create_local_api_server(store, {
            port: 0,
            token_stats_store,
            connector_deps,
        });
        await plain_api.start();
        try {
            const res = await fetch(
                `http://127.0.0.1:${String(plain_api.get_port())}/v1/logs/export`,
            );
            expect(res.status).toBe(503);
        } finally {
            await plain_api.stop();
        }
    });
});

describe("local-api renderer log ingest (t325)", () => {
    it("POST /v1/logs/renderer 无鉴权写 renderer:* 日志 (AC-001)", async () => {
        const original_node_env = process.env["NODE_ENV"];
        process.env["NODE_ENV"] = "development";
        const log_lines: string[] = [];
        const remove_transport = addTransport({
            write(level, module, message, meta) {
                log_lines.push(`${level}:${module}:${message}:${JSON.stringify(meta)}`);
            },
        });
        setLogLevel("debug");

        try {
            await api.start();
            const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/logs/renderer`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    level: "info",
                    module: "web-panel",
                    message: "renderer log line",
                    meta: { source: "web" },
                }),
            });
            expect(res.status).toBe(200);
            const output = log_lines.join("\n");
            expect(output).toContain("renderer:web-panel");
            expect(output).toContain("renderer log line");
            expect(output).toContain('"source":"web"');
        } finally {
            remove_transport();
            setLogLevel("debug");
            process.env["NODE_ENV"] = original_node_env;
        }
    });

    it("POST /v1/logs/renderer 非法 payload 返回成功且不落盘不抛错 (AC-002)", async () => {
        const log_lines: string[] = [];
        const remove_transport = addTransport({
            write(level, module, message, meta) {
                log_lines.push(`${level}:${module}:${message}:${JSON.stringify(meta)}`);
            },
        });
        setLogLevel("debug");
        try {
            await api.start();
            const base = `http://127.0.0.1:${String(api.get_port())}/v1/logs/renderer`;
            const bad_bodies: unknown[] = [
                { level: "info", module: "web-panel", message: 42 },
                { level: "info", message: "no module" },
                { level: "info", module: 42, message: "bad module" },
                null,
                "plain string",
                42,
            ];
            for (const body of bad_bodies) {
                const res = await fetch(base, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });
                expect(res.status, JSON.stringify(body)).toBe(200);
            }
            // api.start() 本身会经全局 logger 写一条 local-api 启动日志，只断言无 renderer:* 落盘。
            expect(log_lines.filter((line) => line.includes("renderer:"))).toHaveLength(0);
        } finally {
            remove_transport();
            setLogLevel("debug");
        }
    });

    it("POST /v1/logs/renderer 非法 JSON 返回 400", async () => {
        await api.start();
        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/logs/renderer`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{",
        });
        expect(res.status).toBe(400);
    });

    it("POST /v1/logs/renderer 已注册 secret 值被 scrub 不落明文 (AC-003)", async () => {
        const original_node_env = process.env["NODE_ENV"];
        process.env["NODE_ENV"] = "development";
        scrubber.register("renderer-secret-token-abc");
        const log_lines: string[] = [];
        const remove_transport = addTransport({
            write(level, module, message, meta) {
                log_lines.push(`${level}:${module}:${message}:${JSON.stringify(meta)}`);
            },
        });
        setLogLevel("debug");

        try {
            await api.start();
            const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/logs/renderer`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    level: "error",
                    module: "web-panel",
                    message: "failed with token renderer-secret-token-abc",
                    meta: { token: "renderer-secret-token-abc" },
                }),
            });
            expect(res.status).toBe(200);
            const output = log_lines.join("\n");
            expect(output).toContain("renderer:web-panel");
            expect(output).not.toContain("renderer-secret-token-abc");
        } finally {
            remove_transport();
            scrubber.unregister("renderer-secret-token-abc");
            setLogLevel("debug");
            process.env["NODE_ENV"] = original_node_env;
        }
    });
});

describe("local-api SSE events", () => {
    it("GET /v1/events streams state changes as text/event-stream", async () => {
        await api.start();
        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/events`);
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toContain("text/event-stream");
        const reader = res.body?.getReader();
        if (!reader) throw new Error("no response body");
        runtime_store.updateState("inst-sse-1", { status: "idle" });
        const { value } = await reader.read();
        const text = new TextDecoder().decode(value);
        expect(text).toContain("data:");
        expect(text).toContain("inst-sse-1");
        await reader.cancel();
    });

    it("SSE connection unsubscribes on client disconnect", async () => {
        await api.start();
        let subscribe_count = 0;
        let unsub_count = 0;
        const real_subscribe = runtime_store.subscribe.bind(runtime_store);
        const spy = vi.spyOn(runtime_store, "subscribe").mockImplementation((listener) => {
            subscribe_count += 1;
            const unsub = real_subscribe(listener);
            return () => {
                unsub_count += 1;
                unsub();
            };
        });

        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/events`);
        const reader = res.body?.getReader();
        if (!reader) throw new Error("no response body");
        runtime_store.updateState("inst-sse-1", { status: "idle" });
        await reader.read();
        expect(subscribe_count).toBeGreaterThanOrEqual(1);
        expect(unsub_count).toBe(0);

        await reader.cancel();
        await new Promise((resolve) => {
            setTimeout(resolve, 80);
        });
        // Every SSE subscription must be cleaned up on disconnect. cleanup may
        // fire more than once (req + res close) and undici may open >1 transport;
        // both are idempotent, so require every subscription to be unsubscribed
        // at least once — catches a missing-cleanup leak (unsub_count stays 0).
        expect(subscribe_count).toBeGreaterThanOrEqual(1);
        expect(unsub_count).toBeGreaterThanOrEqual(subscribe_count);
        spy.mockRestore();
    });
});

describe("local-api 控制端点（t276）", () => {
    let control_api: LocalAPIServer;
    let control_calls: string[];
    let control_obs: ObservationStore;
    let control_ts: TokenStatsStore;

    beforeEach(async () => {
        temp_dir = await mkdtemp(join(tmpdir(), "omni-control-"));
        web_root = join(temp_dir, "web");
        await mkdir(web_root, { recursive: true });
        await writeFile(join(web_root, "index.html"), "<html>panel</html>");
        sync_store = create_observation_store(join(temp_dir, "observations.sqlite"));
        control_obs = sync_store;
        token_stats_store = create_token_stats_store(join(temp_dir, "token.sqlite"));
        control_ts = token_stats_store;
        control_calls = [];
        control_api = create_local_api_server(control_obs, {
            port: 0,
            token_stats_store: control_ts,
            control_deps: {
                refresh_all: () => {
                    control_calls.push("refresh-all");
                },
                pause: () => {
                    control_calls.push("pause");
                },
                resume: () => {
                    control_calls.push("resume");
                },
                restart: () => {
                    control_calls.push("restart");
                },
                quit: () => {
                    control_calls.push("quit");
                },
            },
            web_root,
        });
        await control_api.start();
    });

    afterEach(async () => {
        await control_api.stop();
        control_obs.close();
        control_ts.close();
        await rm(temp_dir, { recursive: true, force: true });
    });

    it("POST /v1/control/refresh-all 触发 refresh_all 免认证", async () => {
        const res = await fetch(
            `http://127.0.0.1:${String(control_api.get_port())}/v1/control/refresh-all`,
            { method: "POST" },
        );
        expect(res.status).toBe(200);
        expect(control_calls).toEqual(["refresh-all"]);
    });

    it("POST /v1/control/pause/resume/restart/quit 均触发对应动作", async () => {
        const base = `http://127.0.0.1:${String(control_api.get_port())}/v1/control`;
        for (const action of ["pause", "resume", "restart", "quit"]) {
            const res = await fetch(`${base}/${action}`, { method: "POST" });
            expect(res.status).toBe(200);
        }
        expect(control_calls).toEqual(["pause", "resume", "restart", "quit"]);
    });

    it("GET 控制端点返回 405", async () => {
        const res = await fetch(
            `http://127.0.0.1:${String(control_api.get_port())}/v1/control/pause`,
        );
        expect(res.status).toBe(405);
    });

    it("未知控制动作落入认证门返回 401（非已注册端点）", async () => {
        const res = await fetch(
            `http://127.0.0.1:${String(control_api.get_port())}/v1/control/nonexistent`,
            { method: "POST" },
        );
        expect(res.status).toBe(401);
    });

    it("未配置 control_deps 时控制端点 401（落入认证门，桌面/旧实例无控制面）", async () => {
        const plain_api = create_local_api_server(control_obs, {
            port: 0,
            token_stats_store: control_ts,
            web_root,
        });
        await plain_api.start();
        try {
            const res = await fetch(
                `http://127.0.0.1:${String(plain_api.get_port())}/v1/control/pause`,
                { method: "POST" },
            );
            expect(res.status).toBe(401);
        } finally {
            await plain_api.stop();
        }
    });
});
