import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCookieRefreshService } from "../../../src/main/core/cookie-refresh/cookie-refresh-service";
import type { AppConfiguration } from "../../../src/shared/types/config";
import type { PluginDefinition } from "../../../src/main/core/plugin/types";
import type { PluginConfiguration } from "../../../src/shared/types/config";
import type { UsageProvider } from "../../../src/shared/schemas/plugin-output";

const { mock_browser_window, mock_session, mock_cookies } = vi.hoisted(() => {
    const mock_cookies = {
        on: vi.fn(),
        removeListener: vi.fn(),
    };
    return {
        mock_cookies,
        mock_browser_window: vi.fn(),
        mock_session: {
            fromPartition: vi.fn(),
        },
    };
});

vi.mock("electron", () => ({
    BrowserWindow: mock_browser_window,
    session: mock_session,
}));

function make_plugin_def(
    script_name: string,
    providers: UsageProvider[],
    opts?: {
        default_source?: "cpa" | "direct";
        has_secret?: boolean;
        login_url?: string;
    },
): PluginDefinition {
    return {
        scriptName: script_name,
        executablePath: `/plugins/${script_name}`,
        source: "bundled" as const,
        metadata: {
            schemaVersion: 1,
            name: script_name,
            supportedProviders: providers,
            defaultSource: opts?.default_source ?? "direct",
            parameters: opts?.has_secret
                ? [
                      {
                          name: "SESSION_COOKIE",
                          label: "Cookie",
                          type: "secret" as const,
                          required: true,
                      },
                  ]
                : [],
            endpoints: opts?.login_url ? { login: opts.login_url } : undefined,
        },
    };
}

function make_plugin_config(instance_id: string, executable_path: string): PluginConfiguration {
    return {
        instanceId: instance_id,
        stateId: instance_id,
        name: `Test ${instance_id}`,
        enabled: true,
        executablePath: executable_path,
        refreshIntervalSeconds: 300,
        parameterValues: {},
        endpointOverrides: {},
    };
}

function make_config(plugins: PluginConfiguration[]): AppConfiguration {
    return {
        schemaVersion: 1,
        language: "zh-Hans",
        plugins,
        launchAtLogin: false,
    };
}

function make_config_store_mock() {
    return {
        load: vi.fn<() => Promise<AppConfiguration>>(),
        save: vi.fn<(config: AppConfiguration) => Promise<void>>(),
        scheduleSave: vi.fn<(config: AppConfiguration, delayMs?: number) => void>(),
        flushPendingSave: vi.fn<() => Promise<void>>(),
        hasPendingSave: vi.fn<() => boolean>(),
    };
}

function make_secrets_store_mock() {
    return {
        get: vi.fn<(key: string) => Promise<string | null>>(),
        set: vi.fn<(key: string, value: string) => Promise<void>>(),
        delete: vi.fn<(key: string) => Promise<void>>(),
        exportAll: vi.fn<() => Promise<Record<string, string>>>(),
        importAll: vi.fn<(decrypted: Record<string, string>) => Promise<void>>(),
    };
}

describe("createCookieRefreshService", () => {
    let config_store_mock: ReturnType<typeof make_config_store_mock>;
    let secrets_store_mock: ReturnType<typeof make_secrets_store_mock>;

    beforeEach(() => {
        vi.clearAllMocks();

        config_store_mock = make_config_store_mock();
        secrets_store_mock = make_secrets_store_mock();
        secrets_store_mock.set.mockResolvedValue(undefined);

        mock_browser_window.mockImplementation(() => ({
            on: vi.fn(),
            isDestroyed: vi.fn().mockReturnValue(false),
            close: vi.fn(),
            loadURL: vi.fn().mockResolvedValue(undefined),
        }));

        mock_session.fromPartition.mockReturnValue({
            cookies: mock_cookies,
        });
    });

    // Test 1: No plugins
    it("returns zeros when plugins array is empty", async () => {
        config_store_mock.load.mockResolvedValue(make_config([]));

        const service = createCookieRefreshService({
            configStore: config_store_mock,
            secretsStore: secrets_store_mock,
            definitions: [],
        });

        const result = await service.refreshAll();
        expect(result).toEqual({ refreshed: 0, failed: 0 });
    });

    // Test 2: No secret params
    it("skips plugin with no secret-type parameters", async () => {
        const def = make_plugin_def("mimo_plugin", ["mimo"], {
            has_secret: false,
            login_url: "https://mimo.example.com/login",
        });

        config_store_mock.load.mockResolvedValue(
            make_config([make_plugin_config("inst1", "/plugins/mimo_plugin")]),
        );

        const service = createCookieRefreshService({
            configStore: config_store_mock,
            secretsStore: secrets_store_mock,
            definitions: [def],
        });

        const result = await service.refreshAll();
        expect(result).toEqual({ refreshed: 0, failed: 0 });
    });

    // Test 3: CPA source
    it("skips plugin where defaultSource is cpa", async () => {
        const def = make_plugin_def("mimo_plugin", ["mimo"], {
            default_source: "cpa",
            has_secret: true,
            login_url: "https://mimo.example.com/login",
        });

        config_store_mock.load.mockResolvedValue(
            make_config([make_plugin_config("inst1", "/plugins/mimo_plugin")]),
        );

        const service = createCookieRefreshService({
            configStore: config_store_mock,
            secretsStore: secrets_store_mock,
            definitions: [def],
        });

        const result = await service.refreshAll();
        expect(result).toEqual({ refreshed: 0, failed: 0 });
    });

    // Test 4: Vendor not in map
    it("skips provider not in vendor cookie map", async () => {
        const def = make_plugin_def("claude_plugin", ["claude"], {
            has_secret: true,
            login_url: "https://claude.example.com/login",
        });

        config_store_mock.load.mockResolvedValue(
            make_config([make_plugin_config("inst1", "/plugins/claude_plugin")]),
        );

        const service = createCookieRefreshService({
            configStore: config_store_mock,
            secretsStore: secrets_store_mock,
            definitions: [def],
        });

        const result = await service.refreshAll();
        expect(result).toEqual({ refreshed: 0, failed: 0 });
    });

    // Test 5: No login URL
    it("skips plugin without a login endpoint", async () => {
        const def = make_plugin_def("mimo_plugin", ["mimo"], {
            has_secret: true,
        });

        config_store_mock.load.mockResolvedValue(
            make_config([make_plugin_config("inst1", "/plugins/mimo_plugin")]),
        );

        const service = createCookieRefreshService({
            configStore: config_store_mock,
            secretsStore: secrets_store_mock,
            definitions: [def],
        });

        const result = await service.refreshAll();
        expect(result).toEqual({ refreshed: 0, failed: 0 });
    });

    // Test 6: Deduplication
    it("groups two instances with same vendor into one vendor entry", async () => {
        const mimo_def = make_plugin_def("mimo_plugin", ["mimo"], {
            has_secret: true,
            login_url: "https://mimo.example.com/login",
        });

        config_store_mock.load.mockResolvedValue(
            make_config([
                make_plugin_config("inst1", "/plugins/mimo_plugin"),
                make_plugin_config("inst2", "/plugins/mimo_plugin"),
            ]),
        );

        const service = createCookieRefreshService({
            configStore: config_store_mock,
            secretsStore: secrets_store_mock,
            definitions: [mimo_def],
        });

        const result_promise = service.refreshAll();

        // refreshAll is async — yield to let the continuation past `await load()`
        // register the cookie listener before we read the mock calls
        await Promise.resolve();

        const on_calls = mock_cookies.on.mock.calls.filter((c: unknown[]) => c[0] === "changed");
        expect(on_calls.length).toBe(1);

        const call = on_calls[0];
        if (!call) throw new Error("expected a changed listener call");
        const listener = call[1] as (
            event: unknown,
            cookie: { name: string; value: string },
            cause: string,
            removed: boolean,
        ) => void;

        // Trigger the cookie changed event with matching cookie name
        listener(
            null,
            { name: "api-platform_serviceToken", value: "test-token" },
            "explicit",
            false,
        );

        const result = await result_promise;

        expect(result).toEqual({ refreshed: 1, failed: 0 });
        expect(secrets_store_mock.set).toHaveBeenCalledTimes(2);
        expect(secrets_store_mock.set).toHaveBeenCalledWith(
            "inst1:SESSION_COOKIE",
            "api-platform_serviceToken=test-token",
        );
        expect(secrets_store_mock.set).toHaveBeenCalledWith(
            "inst2:SESSION_COOKIE",
            "api-platform_serviceToken=test-token",
        );
    });

    // Test 7: Concurrency guard
    it("skips vendors already in progress on concurrent refreshAll", async () => {
        const mimo_def = make_plugin_def("mimo_plugin", ["mimo"], {
            has_secret: true,
            login_url: "https://mimo.example.com/login",
        });

        config_store_mock.load.mockResolvedValue(
            make_config([make_plugin_config("inst1", "/plugins/mimo_plugin")]),
        );

        const service = createCookieRefreshService({
            configStore: config_store_mock,
            secretsStore: secrets_store_mock,
            definitions: [mimo_def],
        });

        // Start first refresh (don't await - it will hang on cookie listener)
        void service.refreshAll();

        // Yield so the first call processes past `await load()` and registers in_progress
        await new Promise<void>((resolve) => setTimeout(resolve, 0));

        // Second concurrent call should skip mimo (already in progress)
        const result2 = await service.refreshAll();

        expect(result2).toEqual({ refreshed: 0, failed: 0 });
        expect(service.inProgress.has("mimo")).toBe(true);
    });

    // Test 8: Empty plugins (no eligible plugins after filtering)
    it("returns zeros when no plugins are eligible after filtering", async () => {
        // Mix of ineligible plugins: CPA, no secret, unknown vendor, no login
        const cpa_def = make_plugin_def("cpa_plugin", ["mimo"], {
            default_source: "cpa",
            has_secret: true,
            login_url: "https://example.com/login",
        });
        const no_secret_def = make_plugin_def("nosecret_plugin", ["kimi"], {
            has_secret: false,
            login_url: "https://example.com/login",
        });
        const unknown_vendor_def = make_plugin_def("unknown_plugin", ["claude"], {
            has_secret: true,
            login_url: "https://example.com/login",
        });
        const no_login_def = make_plugin_def("nologin_plugin", ["mimo"], {
            has_secret: true,
        });

        config_store_mock.load.mockResolvedValue(
            make_config([
                make_plugin_config("cpa", "/plugins/cpa_plugin"),
                make_plugin_config("nosecret", "/plugins/nosecret_plugin"),
                make_plugin_config("unknown", "/plugins/unknown_plugin"),
                make_plugin_config("nologin", "/plugins/nologin_plugin"),
            ]),
        );

        const service = createCookieRefreshService({
            configStore: config_store_mock,
            secretsStore: secrets_store_mock,
            definitions: [cpa_def, no_secret_def, unknown_vendor_def, no_login_def],
        });

        const result = await service.refreshAll();
        expect(result).toEqual({ refreshed: 0, failed: 0 });
    });
});
