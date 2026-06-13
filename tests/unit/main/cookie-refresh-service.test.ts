import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCookieRefreshService } from "../../../src/main/core/cookie-refresh/cookie-refresh-service";
import type { AppConfiguration, PluginConfiguration } from "../../../src/shared/types/config";
import type { ConnectorDefinition } from "../../../src/main/core/connector/manifest-loader";
import type { UsageProvider } from "../../../src/shared/schemas/plugin-output";
import { addTransport, setLogLevel } from "../../../src/shared/lib/logger";

const { mock_browser_window, mock_session, mock_cookies } = vi.hoisted(() => {
    const mock_cookies = {
        get: vi.fn<() => Promise<{ name: string; value: string; domain?: string }[]>>(),
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

function make_connector_def(
    id: string,
    provider: UsageProvider,
    opts?: {
        has_secret?: boolean;
        login_url?: string;
    },
): ConnectorDefinition {
    return {
        directory: `/connectors/${id}`,
        executablePath: `/connectors/${id}`,
        manifest: {
            id,
            provider,
            capabilities: ["poll"],
            parameters: opts?.has_secret
                ? [
                      {
                          name: "SESSION_COOKIE",
                          label: "Cookie",
                          type: "secret" as const,
                          required: true,
                          exposeToScript: false,
                      },
                  ]
                : [],
            endpoints: opts?.login_url ? { login: opts.login_url } : undefined,
            poll: {
                request: { endpoint: "default", path: "/usage", method: "GET" },
                map: {},
            },
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

    it("skips connector with no secret-type parameters", async () => {
        const def = make_connector_def("mimo", "mimo", { has_secret: false });

        config_store_mock.load.mockResolvedValue(
            make_config([make_plugin_config("inst1", def.executablePath)]),
        );

        const service = createCookieRefreshService({
            configStore: config_store_mock,
            secretsStore: secrets_store_mock,
            definitions: [def],
        });

        const result = await service.refreshAll();
        expect(result).toEqual({ refreshed: 0, failed: 0 });
    });

    it("skips CPA connector", async () => {
        const def = make_connector_def("cpa", "mimo", { has_secret: true });

        config_store_mock.load.mockResolvedValue(
            make_config([make_plugin_config("inst1", def.executablePath)]),
        );

        const service = createCookieRefreshService({
            configStore: config_store_mock,
            secretsStore: secrets_store_mock,
            definitions: [def],
        });

        const result = await service.refreshAll();
        expect(result).toEqual({ refreshed: 0, failed: 0 });
    });

    it("skips provider not in vendor cookie map", async () => {
        const def = make_connector_def("claude", "claude", { has_secret: true });

        config_store_mock.load.mockResolvedValue(
            make_config([make_plugin_config("inst1", def.executablePath)]),
        );

        const service = createCookieRefreshService({
            configStore: config_store_mock,
            secretsStore: secrets_store_mock,
            definitions: [def],
        });

        const result = await service.refreshAll();
        expect(result).toEqual({ refreshed: 0, failed: 0 });
    });

    it("returns zero refreshed when persistent session has no cookie", async () => {
        const def = make_connector_def("mimo", "mimo", { has_secret: true });

        config_store_mock.load.mockResolvedValue(
            make_config([make_plugin_config("inst1", def.executablePath)]),
        );

        mock_cookies.get.mockResolvedValue([]);

        const service = createCookieRefreshService({
            configStore: config_store_mock,
            secretsStore: secrets_store_mock,
            definitions: [def],
        });

        const result = await service.refreshAll();
        expect(result).toEqual({ refreshed: 0, failed: 1 });
    });

    it("groups two instances and saves joined domain cookies", async () => {
        const mimo_def = make_connector_def("mimo", "mimo", { has_secret: true });

        config_store_mock.load.mockResolvedValue(
            make_config([
                make_plugin_config("inst1", mimo_def.executablePath),
                make_plugin_config("inst2", mimo_def.executablePath),
            ]),
        );

        mock_cookies.get.mockResolvedValue([
            { name: "api-platform_serviceToken", value: "tok123", domain: ".xiaomimimo.com" },
            { name: "api-platform_slh", value: "slh456", domain: ".xiaomimimo.com" },
            { name: "api-platform_ph", value: "ph789", domain: ".xiaomimimo.com" },
            { name: "other", value: "included", domain: ".xiaomimimo.com" },
        ]);

        const service = createCookieRefreshService({
            configStore: config_store_mock,
            secretsStore: secrets_store_mock,
            definitions: [mimo_def],
        });

        const result = await service.refreshAll();

        expect(result).toEqual({ refreshed: 1, failed: 0 });
        expect(secrets_store_mock.set).toHaveBeenCalledTimes(2);
        const expected_cookie =
            "api-platform_serviceToken=tok123; api-platform_slh=slh456; api-platform_ph=ph789; other=included";
        expect(secrets_store_mock.set).toHaveBeenCalledWith(
            "inst1:SESSION_COOKIE",
            expected_cookie,
        );
        expect(secrets_store_mock.set).toHaveBeenCalledWith(
            "inst2:SESSION_COOKIE",
            expected_cookie,
        );
    });

    it("skips vendors already in progress on concurrent refreshAll", async () => {
        const mimo_def = make_connector_def("mimo", "mimo", { has_secret: true });

        config_store_mock.load.mockResolvedValue(
            make_config([make_plugin_config("inst1", mimo_def.executablePath)]),
        );

        let resolve_get: ((value: { name: string; value: string }[]) => void) | undefined;
        const get_promise = new Promise<{ name: string; value: string }[]>((resolve) => {
            resolve_get = resolve;
        });
        mock_cookies.get.mockReturnValue(get_promise);

        const service = createCookieRefreshService({
            configStore: config_store_mock,
            secretsStore: secrets_store_mock,
            definitions: [mimo_def],
        });

        void service.refreshAll();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        const result2 = await service.refreshAll();

        expect(result2).toEqual({ refreshed: 0, failed: 0 });
        expect(service.inProgress.has("mimo")).toBe(true);

        resolve_get?.([{ name: "api-platform_serviceToken", value: "token" }]);
        await Promise.resolve();
    });

    it("returns zeros when no eligible connectors have cookies in session", async () => {
        const cpa_def = make_connector_def("cpa", "mimo", { has_secret: true });
        const no_secret_def = make_connector_def("kimi", "kimi", { has_secret: false });
        const unknown_vendor_def = make_connector_def("claude", "claude", { has_secret: true });

        config_store_mock.load.mockResolvedValue(
            make_config([
                make_plugin_config("cpa", cpa_def.executablePath),
                make_plugin_config("nosecret", no_secret_def.executablePath),
                make_plugin_config("unknown", unknown_vendor_def.executablePath),
            ]),
        );

        mock_cookies.get.mockResolvedValue([]);

        const service = createCookieRefreshService({
            configStore: config_store_mock,
            secretsStore: secrets_store_mock,
            definitions: [cpa_def, no_secret_def, unknown_vendor_def],
        });

        const result = await service.refreshAll();
        expect(result).toEqual({ refreshed: 0, failed: 0 });
    });

    it("does not leak cookie values into logs when cookies.get fails with cookie in error", async () => {
        const mimo_def = make_connector_def("mimo", "mimo", { has_secret: true });
        const secret_cookie_value = "super-secret-cookie-value-1234567890";

        config_store_mock.load.mockResolvedValue(
            make_config([make_plugin_config("inst1", mimo_def.executablePath)]),
        );

        // cookies.get throws an Error whose message references the cookie value
        // (e.g. a validation error that echoes the offending payload).
        mock_cookies.get.mockRejectedValue(
            new Error(`cookie read aborted near=${secret_cookie_value}`),
        );

        const lines: string[] = [];
        const remove_transport = addTransport({
            write(level, module, message, meta) {
                lines.push(
                    `${level}:${module}:${message}:${typeof meta === "string" ? meta : JSON.stringify(meta)}`,
                );
            },
        });
        setLogLevel("debug");

        try {
            const service = createCookieRefreshService({
                configStore: config_store_mock,
                secretsStore: secrets_store_mock,
                definitions: [mimo_def],
            });

            const result = await service.refreshAll();
            expect(result).toEqual({ refreshed: 0, failed: 1 });

            const output = lines.join("\n");
            // Full cookie value must never appear in any log line.
            expect(output).not.toContain(secret_cookie_value);
        } finally {
            remove_transport();
        }
    });
});
