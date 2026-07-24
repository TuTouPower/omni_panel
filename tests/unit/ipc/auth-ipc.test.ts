import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ConnectorDefinition } from "../../../src/main/core/connector/manifest-loader";
import type { SessionManager, LoginRequest } from "../../../src/main/core/session/session-manager";

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
                scheduleSave: vi.fn(),
                flushPendingSave: vi.fn(),
                hasPendingSave: vi.fn().mockReturnValue(false),
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
                scheduleSave: vi.fn(),
                flushPendingSave: vi.fn(),
                hasPendingSave: vi.fn().mockReturnValue(false),
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
        const ok = await mod.trySilentCookieRefresh(deps, "silent-test-1");

        expect(ok).toBe(true);
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
                scheduleSave: vi.fn(),
                flushPendingSave: vi.fn(),
                hasPendingSave: vi.fn().mockReturnValue(false),
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
        const ok = await mod.trySilentCookieRefresh(deps, "no-cookies-test-1");

        expect(ok).toBe(false);
    });
});
