/// <reference types="vitest/globals" />

import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import type { PluginInfo, PluginSnapshotDTO } from "../../src/shared/types/ipc";
import type { AppConfiguration } from "../../src/shared/types/config";

type StateChangeCallback = (instanceId: string, state: PluginSnapshotDTO) => void;
type ThemeChangeCallback = (isDark: boolean) => void;

function createMockApi() {
    const stateListeners = new Set<StateChangeCallback>();
    const themeListeners = new Set<ThemeChangeCallback>();

    const plugins: PluginInfo[] = [
        {
            instanceId: "deepseek",
            sourceInstanceId: "deepseek",
            stateId: "deepseek",
            name: "DeepSeek",
            displayName: "DeepSeek",
            enabled: true,
            source: "api_key",
            supportedProviders: ["deepseek"],
            activeProviders: ["deepseek"],
            metadata: {
                name: "DeepSeek",
                description: "DeepSeek usage tracker",
                parameters: [
                    {
                        name: "API_KEY",
                        label: "API Key",
                        type: "secret" as const,
                        required: true,
                    },
                    {
                        name: "MODEL",
                        label: "Model",
                        type: "choice" as const,
                        required: false,
                        options: [
                            { label: "chat", value: "chat" },
                            { label: "coder", value: "coder" },
                        ],
                    },
                ],
            },
            snapshot: {
                status: "ready",
                items: [
                    {
                        id: "tokens",
                        provider: "deepseek" as const,
                        source: "api_key" as const,
                        sourceInstanceId: "deepseek",
                        accountId: "deepseek",
                        accountLabel: "DeepSeek",
                        name: "Tokens",
                        used: 5000,
                        limit: 10000,
                        displayStyle: "ratio" as const,
                        status: "normal" as const,
                    },
                ],
                updatedAt: "2026-05-25T00:00:00Z",
            },
        },
        {
            instanceId: "claude",
            sourceInstanceId: "claude",
            stateId: "claude",
            name: "Claude",
            displayName: "Claude",
            enabled: true,
            source: "direct",
            supportedProviders: ["claude"],
            activeProviders: ["claude"],
            metadata: null,
            snapshot: { status: "failed", error: "API 超时" },
        },
    ];

    const config: AppConfiguration = {
        schemaVersion: 1,
        language: "zh-Hans",
        plugins: [
            {
                instanceId: "deepseek",
                stateId: "deepseek",
                name: "DeepSeek",
                enabled: true,
                executablePath: "/plugins/deepseek-usage-plugin.ts",
                refreshIntervalSeconds: 300,
                parameterValues: { MODEL: "chat" },
                endpointOverrides: {},
            },
            {
                instanceId: "claude",
                stateId: "claude",
                name: "Claude",
                enabled: true,
                executablePath: "/plugins/claude-usage-plugin.ts",
                refreshIntervalSeconds: 300,
                parameterValues: {},
                endpointOverrides: {},
            },
        ],
        launchAtLogin: false,
    };

    return {
        platform: "win32" as const,
        plugin: {
            list: vi.fn<() => Promise<PluginInfo[]>>().mockResolvedValue(plugins),
            getState: vi.fn().mockResolvedValue({ status: "idle" } satisfies PluginSnapshotDTO),
            refresh: vi.fn().mockResolvedValue(undefined),
            refreshAll: vi.fn().mockResolvedValue(undefined),
        },
        config: {
            get: vi
                .fn<
                    () => Promise<{
                        config: AppConfiguration;
                        hasSecrets: Record<string, Record<string, boolean>>;
                    }>
                >()
                .mockResolvedValue({
                    config,
                    hasSecrets: {
                        deepseek: { API_KEY: false },
                        claude: {},
                    },
                }),
            save: vi.fn().mockResolvedValue(undefined),
            saveSecrets: vi.fn().mockResolvedValue(undefined),
            duplicate: vi.fn().mockResolvedValue(undefined),
        },
        event: {
            onStateChange(cb: StateChangeCallback) {
                stateListeners.add(cb);
                return () => {
                    stateListeners.delete(cb);
                };
            },
            onThemeChange(cb: ThemeChangeCallback) {
                themeListeners.add(cb);
                return () => {
                    themeListeners.delete(cb);
                };
            },
        },
        theme: {
            set: vi.fn(),
        },
        log: vi.fn(),
        popup: {
            report_content_height: vi.fn(),
        },
        _stateListeners: stateListeners,
        _themeListeners: themeListeners,
        _plugins: plugins,
        _config: config,
    };
}

type MockApi = ReturnType<typeof createMockApi>;

const _global = globalThis as unknown as { __MOCK_API__: MockApi };

export function getMockApi(): MockApi {
    return _global.__MOCK_API__;
}

beforeEach(() => {
    const api = createMockApi();
    _global.__MOCK_API__ = api;
    Object.defineProperty(window, "usageboard", {
        value: api,
        writable: true,
        configurable: true,
    });

    window.location.hash = "#popup";

    const root = document.createElement("div");
    root.id = "root";
    document.body.append(root);
});

afterEach(() => {
    document.body.innerHTML = "";
});
