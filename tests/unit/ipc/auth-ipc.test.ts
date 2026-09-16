import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ConnectorDefinition } from "../../../src/main/core/connector/manifest-loader";
import type { SessionManager, LoginRequest } from "../../../src/main/core/session/session-manager";
import type { AuthIpcDeps } from "../../../src/main/ipc/auth-ipc";

const mock_window_events: Record<string, (() => void) | undefined> = {};
let mock_cookie_get_result: { name: string; value: string }[] = [];
const mock_partitions: string[] = [];

vi.mock("electron", () => ({
    BrowserWindow: vi.fn().mockImplementation(() => ({
        on: (event: string, handler: () => void) => {
            mock_window_events[event] = handler;
        },
        close: vi.fn(() => {
            const h = mock_window_events["closed"];
            if (h) h();
        }),
        isDestroyed: () => false,
        loadURL: vi.fn(),
    })),
    session: {
        fromPartition: vi.fn((partition: string) => {
            mock_partitions.push(partition);
            return {
                cookies: {
                    get: vi.fn(() => Promise.resolve(mock_cookie_get_result)),
                },
                webRequest: {
                    onBeforeSendHeaders: vi.fn(),
                },
            };
        }),
    },
    ipcMain: {
        handle: vi.fn(),
    },
}));

const mimo_definition: ConnectorDefinition = {
    directory: "connectors/mimo",
    executablePath: "connectors/mimo",
    manifest: {
        id: "mimo",
        provider: "mimo",
        capabilities: ["session"],
        parameters: [
            {
                name: "SESSION_COOKIE",
                type: "secret",
                required: true,
                exposeToScript: false,
            },
        ],
        endpoints: {
            default: "https://platform.xiaomimimo.com",
            login: "https://platform.xiaomimimo.com/console/plan-manage",
        },
        loginDomains: ["platform.xiaomimimo.com"],
        cookieNames: ["api-platform_serviceToken", "api-platform_slh", "api-platform_ph", "userId"],
    },
};

const kimi_web_definition: ConnectorDefinition = {
    directory: "connectors/kimi_web",
    executablePath: "connectors/kimi_web",
    manifest: {
        id: "kimi_web",
        provider: "kimi_web",
        capabilities: ["session"],
        parameters: [],
        endpoints: {
            default: "https://www.kimi.com",
            login: "https://www.kimi.com/settings/subscription?tab=quota",
        },
        loginDomains: ["kimi.com", "www.kimi.com", "auth.kimi.com"],
        cookieNames: ["*"],
    },
};

function create_mock_session_manager(
    result: { saved: boolean } = { saved: true },
): SessionManager & { calls: LoginRequest[] } {
    const calls: LoginRequest[] = [];
    return {
        calls,
        start_login(request: LoginRequest) {
            calls.push(request);
            return Promise.resolve(result);
        },
    };
}

describe("handleCookieLogin", () => {
    let secrets_store: Record<string, string>;

    beforeEach(() => {
        secrets_store = {};
        mock_cookie_get_result = [];
        mock_partitions.length = 0;
        Object.keys(mock_window_events).forEach((k) => {
            mock_window_events[k] = undefined;
        });
        vi.clearAllMocks();
    });

    function build_deps(
        instance_id: string,
        session_manager: SessionManager,
        definition: ConnectorDefinition = mimo_definition,
    ) {
        return {
            configStore: {
                load: vi.fn().mockResolvedValue({
                    schemaVersion: 1,
                    language: "zh-Hans",
                    plugins: [
                        {
                            instanceId: instance_id,
                            stateId: instance_id,
                            manifestId: definition.manifest.id,
                            name: "MiMo",
                            enabled: true,
                            executablePath: definition.executablePath,
                            refreshIntervalSeconds: 300,
                            parameterValues: {},
                            endpointOverrides: {},
                        },
                    ],
                    launchAtLogin: false,
                }),
                save: vi.fn(),
                saveIfBaseMatches: vi.fn().mockResolvedValue("saved"),
                scheduleSave: vi.fn(),
                flushPendingSave: vi.fn(),
                hasPendingSave: vi.fn().mockReturnValue(false),
                prune_unhealthy_plugins: vi.fn().mockResolvedValue({}),
            },
            secretsStore: {
                set: vi.fn((_key: string, value: string) => {
                    secrets_store[_key] = value;
                    return Promise.resolve();
                }),
                get: vi.fn((key: string) => Promise.resolve(secrets_store[key] ?? null)),
                delete: vi.fn(),
                exportAll: vi.fn(),
                importAll: vi.fn(),
            },
            definitions: [definition],
            sessionManager: session_manager,
        };
    }

    it("delegates to sessionManager.start_login with instance-scoped partition and auto_close", async () => {
        const sm = create_mock_session_manager({ saved: true });
        const mod = await import("../../../src/main/ipc/auth-ipc");
        const result = await mod.handleCookieLogin(build_deps("mimo-test-1", sm), "mimo-test-1");

        expect(result.ok).toBe(true);
        expect(sm.calls).toHaveLength(1);
        expect(sm.calls[0]).toMatchObject({
            instance_id: "mimo-test-1",
            provider: "mimo",
            login_url: "https://platform.xiaomimimo.com/console/plan-manage",
            cookie_names: [
                "api-platform_serviceToken",
                "api-platform_slh",
                "api-platform_ph",
                "userId",
            ],
            auto_close_ms: 1500,
        });
    });

    // p239：kimi_web 的续期材料由登录页在存活期间写入，自动关窗会让捕获落在错误时刻；
    // 渲染层（WebLoginSection）自 t464 起即不传 auto_close_ms，此处对齐同一条规则。
    it("p239: kimi_web 不传 auto_close_ms，登录窗保持打开待用户关闭", async () => {
        const sm = create_mock_session_manager({ saved: true });
        const mod = await import("../../../src/main/ipc/auth-ipc");
        const result = await mod.handleCookieLogin(
            build_deps("kimi-web-1", sm, kimi_web_definition),
            "kimi-web-1",
        );

        expect(result.ok).toBe(true);
        expect(sm.calls).toHaveLength(1);
        expect(sm.calls[0]).toMatchObject({
            instance_id: "kimi-web-1",
            provider: "kimi_web",
            login_url: "https://www.kimi.com/settings/subscription?tab=quota",
            cookie_names: ["*"],
        });
        expect(sm.calls[0]).not.toHaveProperty("auto_close_ms");
    });

    it("returns the result from sessionManager.start_login", async () => {
        const sm = create_mock_session_manager({ saved: false });
        const mod = await import("../../../src/main/ipc/auth-ipc");
        const result = await mod.handleCookieLogin(build_deps("mimo-test-1", sm), "mimo-test-1");

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.saved).toBe(false);
        }
    });

    it("falls back to endpoints.default when endpoints.login is missing", async () => {
        const no_login_endpoint_def: ConnectorDefinition = {
            ...mimo_definition,
            manifest: {
                ...mimo_definition.manifest,
                endpoints: {
                    default: "https://platform.xiaomimimo.com",
                },
            },
        };
        const sm = create_mock_session_manager();
        const mod = await import("../../../src/main/ipc/auth-ipc");
        const result = await mod.handleCookieLogin(
            build_deps("mimo-test-1", sm, no_login_endpoint_def),
            "mimo-test-1",
        );

        expect(result.ok).toBe(true);
        expect(sm.calls[0]?.login_url).toBe("https://platform.xiaomimimo.com");
    });

    it("returns VALIDATION_ERROR when manifest has no endpoints", async () => {
        const no_endpoints_def: ConnectorDefinition = {
            ...mimo_definition,
            manifest: {
                ...mimo_definition.manifest,
                endpoints: undefined,
            },
        };
        const sm = create_mock_session_manager();
        const mod = await import("../../../src/main/ipc/auth-ipc");
        const result = await mod.handleCookieLogin(
            build_deps("mimo-test-1", sm, no_endpoints_def),
            "mimo-test-1",
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("VALIDATION_ERROR");
        }
        expect(sm.calls).toHaveLength(0);
    });

    it("returns VALIDATION_ERROR when manifest declares no cookieNames", async () => {
        const no_cookies_def: ConnectorDefinition = {
            ...mimo_definition,
            manifest: {
                ...mimo_definition.manifest,
                cookieNames: undefined,
            },
        };
        const sm = create_mock_session_manager();
        const mod = await import("../../../src/main/ipc/auth-ipc");
        const result = await mod.handleCookieLogin(
            build_deps("mimo-test-1", sm, no_cookies_def),
            "mimo-test-1",
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("VALIDATION_ERROR");
        }
        expect(sm.calls).toHaveLength(0);
    });

    it("rejects loginUrl with disallowed domain", async () => {
        const evil_definition: ConnectorDefinition = {
            directory: "connectors/evil",
            executablePath: "connectors/evil",
            manifest: {
                id: "evil",
                provider: "evil",
                capabilities: ["session"],
                parameters: [],
                endpoints: {
                    default: "https://evil-phishing.example.com",
                    login: "https://evil-phishing.example.com/login",
                },
                loginDomains: ["allowed.example.com"],
                cookieNames: ["session"],
            },
        };

        const sm = create_mock_session_manager();
        const deps = build_deps("evil-test-1", sm, evil_definition);

        const mod = await import("../../../src/main/ipc/auth-ipc");
        const result = await mod.handleCookieLogin(deps, "evil-test-1");

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("VALIDATION_ERROR");
            expect(result.error.message).toContain("evil-phishing.example.com");
        }
        expect(sm.calls).toHaveLength(0);
    });

    it("rejects loginUrl when manifest declares no loginDomains (P1-4)", async () => {
        const no_domains_definition: ConnectorDefinition = {
            directory: "connectors/no-domains",
            executablePath: "connectors/no-domains",
            manifest: {
                id: "no-domains",
                provider: "mimo",
                capabilities: ["session"],
                parameters: [],
                endpoints: {
                    default: "https://platform.xiaomimimo.com",
                    login: "https://platform.xiaomimimo.com/login",
                },
                cookieNames: ["session"],
            },
        };

        const sm = create_mock_session_manager();
        const deps = build_deps("no-domains-test-1", sm, no_domains_definition);

        const mod = await import("../../../src/main/ipc/auth-ipc");
        const result = await mod.handleCookieLogin(deps, "no-domains-test-1");

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("VALIDATION_ERROR");
        }
        expect(sm.calls).toHaveLength(0);
    });

    it("accepts loginUrl with domain declared in manifest loginDomains (P1-4)", async () => {
        const custom_definition: ConnectorDefinition = {
            directory: "connectors/custom-session",
            executablePath: "connectors/custom-session",
            manifest: {
                id: "custom-session",
                provider: "mimo",
                capabilities: ["session"],
                parameters: [],
                endpoints: {
                    default: "https://custom-login.example.com",
                    login: "https://custom-login.example.com/login",
                },
                loginDomains: ["custom-login.example.com"],
                cookieNames: ["session"],
            },
        };

        const sm = create_mock_session_manager();
        const deps = build_deps("custom-test-1", sm, custom_definition);

        const mod = await import("../../../src/main/ipc/auth-ipc");
        const result = await mod.handleCookieLogin(deps, "custom-test-1");

        expect(result.ok).toBe(true);
        expect(sm.calls).toHaveLength(1);
    });

    it("propagates sessionManager errors as INTERNAL_ERROR", async () => {
        const sm: SessionManager = {
            start_login: vi.fn().mockRejectedValue(new Error("vault write failed")),
        };
        const mod = await import("../../../src/main/ipc/auth-ipc");
        const result = await mod.handleCookieLogin(build_deps("mimo-test-1", sm), "mimo-test-1");

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("INTERNAL_ERROR");
        }
    });

    it("returns only boolean login status and never exposes the saved cookie", async () => {
        const sm = {
            ...create_mock_session_manager(),
            is_login_in_progress: vi.fn().mockReturnValue(true),
        };
        const deps = build_deps("mimo-test-1", sm);
        secrets_store["mimo-test-1:SESSION_COOKIE"] = "session=secret-cookie";
        const mod = await import("../../../src/main/ipc/auth-ipc");

        const result = await mod.handleCookieLoginStatus(deps, "mimo-test-1");

        expect(result).toEqual({
            ok: true,
            data: { in_progress: true, saved: true, state: "running" },
        });
        expect(JSON.stringify(result)).not.toContain("secret-cookie");
        expect(sm.is_login_in_progress).toHaveBeenCalledWith("mimo-test-1");
    });

    it("reports an idle login without a saved cookie", async () => {
        const sm = {
            ...create_mock_session_manager(),
            is_login_in_progress: vi.fn().mockReturnValue(false),
        };
        const deps = build_deps("mimo-test-1", sm);
        const mod = await import("../../../src/main/ipc/auth-ipc");

        await expect(mod.handleCookieLoginStatus(deps, "mimo-test-1")).resolves.toEqual({
            ok: true,
            data: { in_progress: false, saved: false, state: "canceled" },
        });
    });
});

describe("startCookieLogin", () => {
    let secrets_store: Record<string, string>;

    beforeEach(() => {
        secrets_store = {};
        mock_cookie_get_result = [];
        mock_partitions.length = 0;
        Object.keys(mock_window_events).forEach((k) => {
            mock_window_events[k] = undefined;
        });
        vi.clearAllMocks();
        vi.resetModules();
    });

    function build_deps(
        instance_id: string,
        session_manager: SessionManager,
        definition: ConnectorDefinition = mimo_definition,
    ) {
        return {
            configStore: {
                load: vi.fn().mockResolvedValue({
                    schemaVersion: 1,
                    language: "zh-Hans",
                    plugins: [
                        {
                            instanceId: instance_id,
                            stateId: instance_id,
                            name: "Test",
                            enabled: true,
                            executablePath: definition.executablePath,
                            refreshIntervalSeconds: 300,
                            parameterValues: {},
                            endpointOverrides: {},
                        },
                    ],
                    launchAtLogin: false,
                }),
                save: vi.fn(),
                saveIfBaseMatches: vi.fn().mockResolvedValue("saved"),
                scheduleSave: vi.fn(),
                flushPendingSave: vi.fn(),
                hasPendingSave: vi.fn().mockReturnValue(false),
                prune_unhealthy_plugins: vi.fn().mockResolvedValue({}),
            },
            secretsStore: {
                get: vi.fn((key: string) => Promise.resolve(secrets_store[key] ?? null)),
                set: vi.fn((key: string, value: string) => {
                    secrets_store[key] = value;
                    return Promise.resolve();
                }),
                delete: vi.fn(),
                exportAll: vi.fn(),
                importAll: vi.fn(),
            },
            definitions: [definition],
            sessionManager: session_manager,
        };
    }

    it("returns CONFLICT with Chinese message when is_login_in_progress is true and does not start_login", async () => {
        const start_login = vi.fn().mockResolvedValue({ saved: true });
        const sm = {
            start_login,
            is_login_in_progress: vi.fn().mockReturnValue(true),
        };
        const deps = build_deps("mimo-test-1", sm);
        const mod = await import("../../../src/main/ipc/auth-ipc");

        const result = mod.startCookieLogin(deps, "mimo-test-1");

        expect(result).toEqual({
            ok: true,
            data: {
                started: false,
                conflict: true,
                error_code: "CONFLICT",
                error: "已有登录正在进行中，请等待当前登录完成",
            },
        });
        expect(start_login).not.toHaveBeenCalled();
        expect(sm.is_login_in_progress).toHaveBeenCalledWith("mimo-test-1");
    });

    it("returns CONFLICT when cookie login state is already in_progress", async () => {
        let resolve_login: ((value: { saved: boolean }) => void) | undefined;
        const start_login = vi.fn().mockImplementation(
            () =>
                new Promise<{ saved: boolean }>((resolve) => {
                    resolve_login = resolve;
                }),
        );
        const sm = {
            start_login,
            is_login_in_progress: vi.fn().mockReturnValue(false),
        };
        const deps = build_deps("mimo-test-1", sm);
        const mod = await import("../../../src/main/ipc/auth-ipc");

        const first = mod.startCookieLogin(deps, "mimo-test-1");
        expect(first).toEqual({ ok: true, data: { started: true } });

        // Concurrent start must see state.in_progress before the async start_login settles.
        const second = mod.startCookieLogin(deps, "mimo-test-1");
        expect(second).toEqual({
            ok: true,
            data: {
                started: false,
                conflict: true,
                error_code: "CONFLICT",
                error: "已有登录正在进行中，请等待当前登录完成",
            },
        });

        resolve_login?.({ saved: true });
        await Promise.resolve();
        await Promise.resolve();
    });
});

describe("trySilentCookieRefresh", () => {
    let secrets_store: Record<string, string>;

    beforeEach(() => {
        secrets_store = {};
        mock_cookie_get_result = [];
        mock_partitions.length = 0;
        Object.keys(mock_window_events).forEach((k) => {
            mock_window_events[k] = undefined;
        });
        vi.clearAllMocks();
    });

    const b64 = (value: unknown): string =>
        Buffer.from(JSON.stringify(value)).toString("base64url");
    /** 形状与 Kimi 真 JWT 一致（仅 payload 的 exp 参与判定）。 */
    const make_jwt = (exp_seconds: number): string =>
        `${b64({ alg: "RS256" })}.${b64({ exp: exp_seconds })}.sig`;
    const seconds_from_now = (offset: number): number => Math.floor(Date.now() / 1000) + offset;

    const kimi_definition: ConnectorDefinition = {
        directory: "connectors/kimi_web",
        executablePath: "connectors/kimi_web",
        manifest: {
            id: "kimi_web",
            provider: "kimi_web",
            capabilities: ["session"],
            parameters: [],
            cookieNames: ["*"],
        },
    };

    function kimi_deps(
        instance_id: string,
        options: { kimi_web_refresh?: (refresh_token: string) => Promise<unknown> } = {},
    ): AuthIpcDeps {
        return {
            configStore: {
                load: vi.fn().mockResolvedValue({
                    schemaVersion: 1,
                    language: "zh-Hans",
                    plugins: [
                        {
                            instanceId: instance_id,
                            stateId: instance_id,
                            manifestId: "kimi_web",
                            name: "Kimi Web",
                            enabled: true,
                            executablePath: kimi_definition.executablePath,
                            refreshIntervalSeconds: 300,
                            parameterValues: {},
                            endpointOverrides: {},
                        },
                    ],
                    launchAtLogin: false,
                }),
            },
            secretsStore: {
                set: vi.fn((key: string, value: string) => {
                    secrets_store[key] = value;
                    return Promise.resolve();
                }),
                get: vi.fn((key: string) => Promise.resolve(secrets_store[key] ?? null)),
                delete: vi.fn(),
                exportAll: vi.fn(),
                importAll: vi.fn(),
            },
            definitions: [kimi_definition],
            sessionManager: { start_login: vi.fn() },
            ...(options.kimi_web_refresh ? { kimi_web_refresh: options.kimi_web_refresh } : {}),
        } as unknown as AuthIpcDeps;
    }

    // t492：t469 原用例断言「静默刷新报成功且原样保留过期 authorization」——那正是
    // 本缺陷语义（Bearer 15 分钟过期后采集必失败）。整体替换为新语义：以 refresh
    // token 走 HTTP 续期端点换新 Bearer。
    it("t492 AC-001/004: Kimi 静默刷新换新 Bearer，保留 session/device 并落盘轮换后的 refresh token", async () => {
        mock_cookie_get_result = [{ name: "kimi_session", value: "new-cookie" }];
        secrets_store["kimi-web:SESSION_COOKIE"] = JSON.stringify({
            cookie: "old-cookie=stale",
            authorization: `Bearer ${make_jwt(seconds_from_now(-300))}`,
            session_id: "session-sentinel",
            device_id: "device-sentinel",
            refresh_token: "refresh-sentinel",
        });
        const tokens = {
            access_token: make_jwt(seconds_from_now(900)),
            refresh_token: "rotated-refresh",
        };
        const kimi_web_refresh = vi.fn().mockResolvedValue({ ok: true, tokens });

        const mod = await import("../../../src/main/ipc/auth-ipc");
        const result = await mod.trySilentCookieRefresh(
            kimi_deps("kimi-web", { kimi_web_refresh }),
            "kimi-web",
        );

        expect(result).toEqual({ refreshed: true, credential_changed: true });
        expect(kimi_web_refresh).toHaveBeenCalledWith("refresh-sentinel");
        const saved = JSON.parse(secrets_store["kimi-web:SESSION_COOKIE"] ?? "{}") as Record<
            string,
            unknown
        >;
        expect(saved["cookie"]).toBe("kimi_session=new-cookie");
        expect(saved["authorization"]).toBe(`Bearer ${tokens.access_token}`);
        expect(saved["refresh_token"]).toBe("rotated-refresh");
        expect(saved["session_id"]).toBe("session-sentinel");
        expect(saved["device_id"]).toBe("device-sentinel");
    });

    it("t492 AC-001: partition 无 cookie 时 Kimi 仍能靠 refresh token 续期（cookie 保持原值）", async () => {
        mock_cookie_get_result = [];
        secrets_store["kimi-web:SESSION_COOKIE"] = JSON.stringify({
            cookie: "stored-cookie=keep",
            authorization: `Bearer ${make_jwt(seconds_from_now(-300))}`,
            session_id: "session-sentinel",
            device_id: "device-sentinel",
            refresh_token: "refresh-sentinel",
        });
        const kimi_web_refresh = vi.fn().mockResolvedValue({
            ok: true,
            tokens: {
                access_token: make_jwt(seconds_from_now(900)),
                refresh_token: "rotated-refresh",
            },
        });

        const mod = await import("../../../src/main/ipc/auth-ipc");
        const result = await mod.trySilentCookieRefresh(
            kimi_deps("kimi-web", { kimi_web_refresh }),
            "kimi-web",
        );

        expect(result).toEqual({ refreshed: true, credential_changed: true });
        const saved = JSON.parse(secrets_store["kimi-web:SESSION_COOKIE"] ?? "{}") as Record<
            string,
            unknown
        >;
        expect(saved["cookie"]).toBe("stored-cookie=keep");
    });

    it("t492 AC-002: refresh token 被拒时静默刷新不报成功，也不改凭据", async () => {
        mock_cookie_get_result = [{ name: "kimi_session", value: "new-cookie" }];
        const original = JSON.stringify({
            cookie: "old-cookie=stale",
            authorization: `Bearer ${make_jwt(seconds_from_now(-300))}`,
            session_id: "session-sentinel",
            device_id: "device-sentinel",
            refresh_token: "rejected-refresh",
        });
        secrets_store["kimi-web:SESSION_COOKIE"] = original;
        const kimi_web_refresh = vi.fn().mockResolvedValue({
            ok: false,
            unauthenticated: true,
            error: "kimi refresh rejected: unauthenticated",
        });

        const mod = await import("../../../src/main/ipc/auth-ipc");
        const result = await mod.trySilentCookieRefresh(
            kimi_deps("kimi-web", { kimi_web_refresh }),
            "kimi-web",
        );

        expect(result).toEqual({ refreshed: false, credential_changed: false });
        expect(secrets_store["kimi-web:SESSION_COOKIE"]).toBe(original);
    });

    it("t492 AC-002: 无 refresh token 的旧凭据在 Bearer 过期时不报成功", async () => {
        mock_cookie_get_result = [{ name: "kimi_session", value: "new-cookie" }];
        const original = JSON.stringify({
            cookie: "old-cookie=stale",
            authorization: `Bearer ${make_jwt(seconds_from_now(-60))}`,
            session_id: "session-sentinel",
            device_id: "device-sentinel",
        });
        secrets_store["kimi-legacy:SESSION_COOKIE"] = original;
        const kimi_web_refresh = vi.fn();

        const mod = await import("../../../src/main/ipc/auth-ipc");
        const result = await mod.trySilentCookieRefresh(
            kimi_deps("kimi-legacy", { kimi_web_refresh }),
            "kimi-legacy",
        );

        expect(result).toEqual({ refreshed: false, credential_changed: false });
        expect(kimi_web_refresh).not.toHaveBeenCalled();
        expect(secrets_store["kimi-legacy:SESSION_COOKIE"]).toBe(original);
    });

    it("t492: 无 refresh token 但 Bearer 仍有效时只更新 cookie，且不报成换到新凭据", async () => {
        mock_cookie_get_result = [{ name: "kimi_session", value: "new-cookie" }];
        secrets_store["kimi-legacy:SESSION_COOKIE"] = JSON.stringify({
            cookie: "old-cookie=stale",
            authorization: `Bearer ${make_jwt(seconds_from_now(600))}`,
            session_id: "session-sentinel",
            device_id: "device-sentinel",
        });

        const mod = await import("../../../src/main/ipc/auth-ipc");
        const result = await mod.trySilentCookieRefresh(kimi_deps("kimi-legacy"), "kimi-legacy");

        // cookie 变了但 Bearer 没变：刷新服务不应据此判定重登成功（AC-003）。
        expect(result).toEqual({ refreshed: true, credential_changed: false });
        const saved = JSON.parse(secrets_store["kimi-legacy:SESSION_COOKIE"] ?? "{}") as Record<
            string,
            unknown
        >;
        expect(saved["cookie"]).toBe("kimi_session=new-cookie");
        expect(saved["session_id"]).toBe("session-sentinel");
        expect(saved["device_id"]).toBe("device-sentinel");
    });

    it("t492 AC-002: Bearer 字段缺失时静默刷新不报成功", async () => {
        mock_cookie_get_result = [{ name: "kimi_session", value: "new-cookie" }];
        const original = JSON.stringify({
            cookie: "old-cookie=stale",
            session_id: "session-sentinel",
            device_id: "device-sentinel",
        });
        secrets_store["kimi-missing-bearer:SESSION_COOKIE"] = original;

        const mod = await import("../../../src/main/ipc/auth-ipc");
        const result = await mod.trySilentCookieRefresh(
            kimi_deps("kimi-missing-bearer"),
            "kimi-missing-bearer",
        );

        expect(result).toEqual({ refreshed: false, credential_changed: false });
        expect(secrets_store["kimi-missing-bearer:SESSION_COOKIE"]).toBe(original);
    });

    it("t492: 非 JSON 的旧凭据（纯 cookie 字符串）不报成功也不被覆盖", async () => {
        mock_cookie_get_result = [{ name: "kimi_session", value: "new-cookie" }];
        const original = "legacy-cookie-only";
        secrets_store["kimi-non-json:SESSION_COOKIE"] = original;

        const mod = await import("../../../src/main/ipc/auth-ipc");
        const result = await mod.trySilentCookieRefresh(
            kimi_deps("kimi-non-json"),
            "kimi-non-json",
        );

        expect(result).toEqual({ refreshed: false, credential_changed: false });
        expect(secrets_store["kimi-non-json:SESSION_COOKIE"]).toBe(original);
    });

    it("t492: 实例没有任何 kimi 凭据时不报成功也不写入", async () => {
        mock_cookie_get_result = [{ name: "kimi_session", value: "new-cookie" }];

        const mod = await import("../../../src/main/ipc/auth-ipc");
        const result = await mod.trySilentCookieRefresh(kimi_deps("kimi-absent"), "kimi-absent");

        expect(result).toEqual({ refreshed: false, credential_changed: false });
        expect(secrets_store["kimi-absent:SESSION_COOKIE"]).toBeUndefined();
    });

    it("uses instance-scoped partition persist:session-login:<instance_id>", async () => {
        mock_cookie_get_result = [
            { name: "my_custom_cookie", value: "val_abc" },
            { name: "another_custom", value: "val_xyz" },
        ];

        const custom_definition: ConnectorDefinition = {
            directory: "connectors/custom-silent",
            executablePath: "connectors/custom-silent",
            manifest: {
                id: "custom-silent",
                provider: "mimo",
                capabilities: ["session"],
                parameters: [],
                cookieNames: ["my_custom_cookie", "another_custom"],
            },
        };

        const deps = {
            configStore: {
                load: vi.fn().mockResolvedValue({
                    schemaVersion: 1,
                    language: "zh-Hans",
                    plugins: [
                        {
                            instanceId: "silent-test-1",
                            stateId: "silent-test-1",
                            manifestId: "custom-silent",
                            name: "CustomSilent",
                            enabled: true,
                            executablePath: custom_definition.executablePath,
                            refreshIntervalSeconds: 300,
                            parameterValues: {},
                            endpointOverrides: {},
                        },
                    ],
                    launchAtLogin: false,
                }),
                save: vi.fn(),
                saveIfBaseMatches: vi.fn().mockResolvedValue("saved"),
                scheduleSave: vi.fn(),
                flushPendingSave: vi.fn(),
                hasPendingSave: vi.fn().mockReturnValue(false),
                prune_unhealthy_plugins: vi.fn().mockResolvedValue({}),
            },
            secretsStore: {
                set: vi.fn((_key: string, value: string) => {
                    secrets_store[_key] = value;
                    return Promise.resolve();
                }),
                get: vi.fn((key: string) => Promise.resolve(secrets_store[key] ?? null)),
                delete: vi.fn(),
                exportAll: vi.fn(),
                importAll: vi.fn(),
            },
            definitions: [custom_definition],
            sessionManager: { start_login: vi.fn() },
        };

        const mod = await import("../../../src/main/ipc/auth-ipc");
        const result = await mod.trySilentCookieRefresh(deps, "silent-test-1");

        expect(result).toEqual({ refreshed: true, credential_changed: true });
        expect(mock_partitions).toEqual(["persist:session-login:silent-test-1"]);
        expect(secrets_store["silent-test-1:SESSION_COOKIE"]).toBe(
            "my_custom_cookie=val_abc; another_custom=val_xyz",
        );
    });

    it("returns false when manifest declares no cookieNames (P1-4)", async () => {
        mock_cookie_get_result = [{ name: "api-platform_serviceToken", value: "tok_abc" }];

        const no_cookies_definition: ConnectorDefinition = {
            directory: "connectors/no-cookies",
            executablePath: "connectors/no-cookies",
            manifest: {
                id: "no-cookies",
                provider: "mimo",
                capabilities: ["session"],
                parameters: [],
            },
        };

        const deps = {
            configStore: {
                load: vi.fn().mockResolvedValue({
                    schemaVersion: 1,
                    language: "zh-Hans",
                    plugins: [
                        {
                            instanceId: "no-cookies-test-1",
                            stateId: "no-cookies-test-1",
                            manifestId: "no-cookies",
                            name: "NoCookies",
                            enabled: true,
                            executablePath: no_cookies_definition.executablePath,
                            refreshIntervalSeconds: 300,
                            parameterValues: {},
                            endpointOverrides: {},
                        },
                    ],
                    launchAtLogin: false,
                }),
                save: vi.fn(),
                saveIfBaseMatches: vi.fn().mockResolvedValue("saved"),
                scheduleSave: vi.fn(),
                flushPendingSave: vi.fn(),
                hasPendingSave: vi.fn().mockReturnValue(false),
                prune_unhealthy_plugins: vi.fn().mockResolvedValue({}),
            },
            secretsStore: {
                set: vi.fn(),
                get: vi.fn(),
                delete: vi.fn(),
                exportAll: vi.fn(),
                importAll: vi.fn(),
            },
            definitions: [no_cookies_definition],
            sessionManager: { start_login: vi.fn() },
        };

        const mod = await import("../../../src/main/ipc/auth-ipc");
        const result = await mod.trySilentCookieRefresh(deps, "no-cookies-test-1");

        expect(result).toEqual({ refreshed: false, credential_changed: false });
    });
});
