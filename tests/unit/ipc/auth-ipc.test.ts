import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ConnectorDefinition } from "../../../src/main/core/connector/manifest-loader";

const mock_window_events: Record<string, (() => void) | undefined> = {};
let mock_cookie_get_result: { name: string; value: string }[] = [];

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
        fromPartition: vi.fn(() => ({
            cookies: {
                get: vi.fn(() => Promise.resolve(mock_cookie_get_result)),
            },
            webRequest: {
                onBeforeSendHeaders: vi.fn(),
            },
        })),
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

    it("returns saved:true with combined cookie string when all 3 cookies present", async () => {
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
            expect(result.data.saved).toBe(true);
        }
        expect(secrets_store["mimo-test-1:SESSION_COOKIE"]).toBe(
            "api-platform_serviceToken=tok_abc; api-platform_slh=slh_xyz; api-platform_ph=ph_123",
        );
    });

    it("returns saved:true when only partial cookies are present", async () => {
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
            expect(result.data.saved).toBe(true);
        }
        expect(secrets_store["mimo-test-1:SESSION_COOKIE"]).toBe(
            "api-platform_serviceToken=tok_abc; api-platform_slh=slh_xyz",
        );
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
});
