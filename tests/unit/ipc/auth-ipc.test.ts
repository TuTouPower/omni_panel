import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ConnectorDefinition } from "../../../src/main/core/connector/manifest-loader";
import type { UsageProvider } from "../../../src/shared/schemas/plugin-output";

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
        capabilities: ["poll"],
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
        poll: {
            request: { endpoint: "default", path: "/usage", method: "GET" },
            map: {},
        },
    },
};

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

    function build_deps(instance_id: string) {
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
                            executablePath: mimo_definition.executablePath,
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
            definitions: [mimo_definition],
        };
    }

    it("uses a provider-scoped persistent partition persist:<provider>-login for interactive login", async () => {
        const mod = await import("../../../src/main/ipc/auth-ipc");
        const promise = mod.handleCookieLogin(build_deps("mimo-test-1"), "mimo-test-1");

        await vi.waitFor(() => {
            if (!mock_window_events["closed"]) throw new Error("not ready");
        });

        mock_window_events["closed"]?.();
        await promise;

        expect(mock_partitions).toEqual(["persist:mimo-login"]);
    });

    it("returns saved:false and does not read cookie jar when no cookie captured (P0-5)", async () => {
        // Cookie jar 有匹配的 cookie，但未捕获到请求头 Cookie 时不应该回退到 cookie jar。
        mock_cookie_get_result = [
            { name: "api-platform_serviceToken", value: "tok_abc" },
            { name: "api-platform_slh", value: "slh_xyz" },
            { name: "api-platform_ph", value: "ph_123" },
            { name: "other_cookie", value: "should_be_ignored" },
        ];

        const mod = await import("../../../src/main/ipc/auth-ipc");
        const promise = mod.handleCookieLogin(build_deps("mimo-test-1"), "mimo-test-1");

        await vi.waitFor(() => {
            if (!mock_window_events["closed"]) throw new Error("not ready");
        });

        mock_window_events["closed"]?.();
        await Promise.resolve();

        const result = await promise;
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.saved).toBe(false);
        }
        expect(secrets_store["mimo-test-1:SESSION_COOKIE"]).toBeUndefined();
    });

    it("returns saved:false when only partial cookies in jar and none captured (P0-5)", async () => {
        mock_cookie_get_result = [
            { name: "api-platform_serviceToken", value: "tok_abc" },
            { name: "api-platform_slh", value: "slh_xyz" },
        ];

        const mod = await import("../../../src/main/ipc/auth-ipc");
        const promise = mod.handleCookieLogin(build_deps("mimo-test-1"), "mimo-test-1");

        await vi.waitFor(() => {
            if (!mock_window_events["closed"]) throw new Error("not ready");
        });

        mock_window_events["closed"]?.();
        await Promise.resolve();

        const result = await promise;
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.saved).toBe(false);
        }
        expect(secrets_store["mimo-test-1:SESSION_COOKIE"]).toBeUndefined();
    });

    it("rejects loginUrl with disallowed domain", async () => {
        const evil_definition: ConnectorDefinition = {
            directory: "connectors/evil",
            executablePath: "connectors/evil",
            manifest: {
                id: "evil",
                provider: "evil" as unknown as UsageProvider,
                capabilities: ["poll"],
                parameters: [],
                endpoints: {
                    default: "https://evil-phishing.example.com",
                    login: "https://evil-phishing.example.com/login",
                },
                // 声明的登录域名不含钓鱼域名 → 触发 hostname 拒绝路径
                loginDomains: ["allowed.example.com"],
                poll: {
                    request: { endpoint: "default", path: "/usage", method: "GET" },
                    map: {},
                },
            },
        };

        const deps = {
            configStore: {
                load: vi.fn().mockResolvedValue({
                    schemaVersion: 1,
                    language: "zh-Hans",
                    plugins: [
                        {
                            instanceId: "evil-test-1",
                            stateId: "evil-test-1",
                            name: "Evil",
                            enabled: true,
                            executablePath: evil_definition.executablePath,
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
            definitions: [evil_definition],
        };

        const mod = await import("../../../src/main/ipc/auth-ipc");
        const result = await mod.handleCookieLogin(deps, "evil-test-1");

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("VALIDATION_ERROR");
            expect(result.error.message).toContain("evil-phishing.example.com");
        }
    });

    it("accepts loginUrl with allowed domain", async () => {
        const mod = await import("../../../src/main/ipc/auth-ipc");
        const promise = mod.handleCookieLogin(build_deps("mimo-test-1"), "mimo-test-1");

        await vi.waitFor(() => {
            if (!mock_window_events["closed"]) throw new Error("not ready");
        });

        mock_window_events["closed"]?.();
        await Promise.resolve();

        const result = await promise;
        expect(result.ok).toBe(true);
    });

    it("returns saved:false when no required cookies present", async () => {
        mock_cookie_get_result = [];

        const mod = await import("../../../src/main/ipc/auth-ipc");
        const promise = mod.handleCookieLogin(build_deps("mimo-test-1"), "mimo-test-1");

        await vi.waitFor(() => {
            if (!mock_window_events["closed"]) throw new Error("not ready");
        });

        mock_window_events["closed"]?.();
        await Promise.resolve();

        const result = await promise;
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.saved).toBe(false);
        }
    });

    // P1-4: 登录域名应从 manifest.loginDomains 读取，不再依赖宿主硬编码白名单。
    it("accepts loginUrl with domain declared in manifest loginDomains even if not in legacy hardcoded set (P1-4)", async () => {
        const custom_definition: ConnectorDefinition = {
            directory: "connectors/custom-session",
            executablePath: "connectors/custom-session",
            manifest: {
                id: "custom-session",
                provider: "mimo",
                capabilities: ["poll"],
                parameters: [],
                endpoints: {
                    default: "https://custom-login.example.com",
                    login: "https://custom-login.example.com/login",
                },
                loginDomains: ["custom-login.example.com"],
                poll: {
                    request: { endpoint: "default", path: "/usage", method: "GET" },
                    map: {},
                },
            },
        };

        const deps = {
            configStore: {
                load: vi.fn().mockResolvedValue({
                    schemaVersion: 1,
                    language: "zh-Hans",
                    plugins: [
                        {
                            instanceId: "custom-test-1",
                            stateId: "custom-test-1",
                            name: "Custom",
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
                set: vi.fn(),
                get: vi.fn(),
                delete: vi.fn(),
                exportAll: vi.fn(),
                importAll: vi.fn(),
            },
            definitions: [custom_definition],
        };

        const mod = await import("../../../src/main/ipc/auth-ipc");
        const promise = mod.handleCookieLogin(deps, "custom-test-1");

        await vi.waitFor(() => {
            if (!mock_window_events["closed"]) throw new Error("not ready");
        });

        mock_window_events["closed"]?.();
        await Promise.resolve();

        const result = await promise;
        expect(result.ok).toBe(true);
    });

    // P1-4: manifest 未声明 loginDomains 时应拒绝登录（无隐式白名单）。
    it("rejects loginUrl when manifest declares no loginDomains (P1-4)", async () => {
        const no_domains_definition: ConnectorDefinition = {
            directory: "connectors/no-domains",
            executablePath: "connectors/no-domains",
            manifest: {
                id: "no-domains",
                provider: "mimo",
                capabilities: ["poll"],
                parameters: [],
                endpoints: {
                    default: "https://platform.xiaomimimo.com",
                    login: "https://platform.xiaomimimo.com/login",
                },
                poll: {
                    request: { endpoint: "default", path: "/usage", method: "GET" },
                    map: {},
                },
            },
        };

        const deps = {
            configStore: {
                load: vi.fn().mockResolvedValue({
                    schemaVersion: 1,
                    language: "zh-Hans",
                    plugins: [
                        {
                            instanceId: "no-domains-test-1",
                            stateId: "no-domains-test-1",
                            name: "NoDomains",
                            enabled: true,
                            executablePath: no_domains_definition.executablePath,
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
            definitions: [no_domains_definition],
        };

        const mod = await import("../../../src/main/ipc/auth-ipc");
        const result = await mod.handleCookieLogin(deps, "no-domains-test-1");

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("VALIDATION_ERROR");
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

    // P1-4: cookie 名应从 manifest.cookieNames 读取，不再硬编码 MiMo 的 4 个名字。
    it("uses cookie names from manifest.cookieNames instead of hardcoded MiMo names (P1-4)", async () => {
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
        };

        const mod = await import("../../../src/main/ipc/auth-ipc");
        const ok = await mod.trySilentCookieRefresh(deps, "silent-test-1");

        expect(ok).toBe(true);
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
        };

        const mod = await import("../../../src/main/ipc/auth-ipc");
        const ok = await mod.trySilentCookieRefresh(deps, "no-cookies-test-1");

        expect(ok).toBe(false);
    });
});
