import { describe, it, expect, vi } from "vitest";
import type { PluginSnapshotDTO } from "../../../src/shared/types/ipc";
import type { AppConfiguration } from "../../../src/shared/types/config";
import type { RuntimeStore } from "../../../src/main/core/scheduler/runtime-store";

function createMockDeps() {
    const configStore = {
        load: vi.fn<() => Promise<AppConfiguration>>().mockResolvedValue({
            schemaVersion: 1,
            language: "zh-Hans" as const,
            plugins: [
                {
                    instanceId: "claude",
                    stateId: "claude",
                    name: "Claude",
                    enabled: true,
                    executablePath: "/plugins/claude.py",
                    refreshIntervalSeconds: 300,
                    parameterValues: { API_KEY: "sk-real-key", MODEL: "gpt-4" },
                    endpointOverrides: {},
                },
            ],
            launchAtLogin: false,
        }),
        save: vi.fn(),
        scheduleSave: vi.fn(),
        flushPendingSave: vi.fn().mockResolvedValue(undefined),
        hasPendingSave: vi.fn().mockReturnValue(false),
    };

    const readyState: PluginSnapshotDTO = {
        status: "ready",
        items: [
            {
                id: "tokens",
                provider: "claude",
                source: "api_key",
                sourceInstanceId: "claude",
                accountId: "claude",
                accountLabel: "Claude",
                name: "Tokens",
                used: 2340,
                limit: 10000,
                displayStyle: "percent",
                status: "normal",
            },
        ],
        updatedAt: "2026-05-24T14:00:00.000Z",
    };

    const runtimeStore: RuntimeStore = {
        getSnapshot: vi.fn().mockReturnValue({
            status: "ready",
            items: readyState.items,
            updatedAt: new Date("2026-05-24T14:00:00.000Z"),
        }),
        updateState: vi.fn(),
        getAll: vi.fn().mockReturnValue(new Map()),
        subscribe: vi.fn().mockReturnValue(() => undefined),
        removeInstance: vi.fn(),
    };

    const refreshService = {
        refresh: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        refreshAll: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };

    return { configStore, runtimeStore, refreshService, definitions: [] };
}

describe("plugin-ipc", () => {
    it("handlePluginList returns PluginInfo[]", async () => {
        const deps = createMockDeps();
        const { handlePluginList } = await import("../../../src/main/ipc/plugin-ipc");
        const result = await handlePluginList(deps);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data).toHaveLength(1);
        const item = result.data[0];
        expect(item?.stateId).toBe("claude");
        expect(item?.displayName).toBe("Claude");
        expect(item?.snapshot.status).toBe("ready");
    });

    it("handlePluginGetState returns DTO for valid stateId", async () => {
        const deps = createMockDeps();
        const { handlePluginGetState } = await import("../../../src/main/ipc/plugin-ipc");
        const result = handlePluginGetState(deps, "claude");

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.status).toBe("ready");
    });

    it("handlePluginGetState rejects empty stateId", async () => {
        const deps = createMockDeps();
        const { handlePluginGetState } = await import("../../../src/main/ipc/plugin-ipc");
        const result = handlePluginGetState(deps, "");

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("VALIDATION_ERROR");
        }
    });

    it("handlePluginRefresh calls refreshService.refresh with force", async () => {
        const deps = createMockDeps();
        const { handlePluginRefresh } = await import("../../../src/main/ipc/plugin-ipc");
        const result = await handlePluginRefresh(deps, "claude");

        expect(result.ok).toBe(true);
        expect(deps.refreshService.refresh).toHaveBeenCalledWith("claude", { force: true });
    });

    it("handlePluginRefreshAll calls refreshService.refreshAll", async () => {
        const deps = createMockDeps();
        const { handlePluginRefreshAll } = await import("../../../src/main/ipc/plugin-ipc");
        const result = await handlePluginRefreshAll(deps);

        expect(result.ok).toBe(true);
        expect(deps.refreshService.refreshAll).toHaveBeenCalled();
    });

    it("handlePluginList resolves metadata on Windows backslash paths", async () => {
        const { handlePluginList } = await import("../../../src/main/ipc/plugin-ipc");
        const configStore = {
            load: vi.fn<() => Promise<AppConfiguration>>().mockResolvedValue({
                schemaVersion: 1,
                language: "zh-Hans" as const,
                plugins: [
                    {
                        instanceId: "deepseek-1",
                        stateId: "deepseek-1",
                        name: "DeepSeek",
                        enabled: true,
                        executablePath: "assets\\plugins\\deepseek-usage-plugin.ts",
                        refreshIntervalSeconds: 300,
                        parameterValues: {},
                        endpointOverrides: {},
                    },
                ],
                launchAtLogin: false,
            }),
            save: vi.fn(),
            scheduleSave: vi.fn(),
            flushPendingSave: vi.fn().mockResolvedValue(undefined),
            hasPendingSave: vi.fn().mockReturnValue(false),
        };
        const runtimeStore: RuntimeStore = {
            getSnapshot: vi.fn().mockReturnValue({ status: "idle" }),
            updateState: vi.fn(),
            getAll: vi.fn().mockReturnValue(new Map()),
            subscribe: vi.fn().mockReturnValue(() => undefined),
            removeInstance: vi.fn(),
        };
        const refreshService = {
            refresh: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
            refreshAll: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        };
        const definitions = [
            {
                scriptName: "deepseek-usage-plugin.ts",
                executablePath: "assets\\plugins\\deepseek-usage-plugin.ts",
                metadata: {
                    schemaVersion: 1,
                    name: "DeepSeek",
                    defaultSource: "api_key" as const,
                    supportedProviders: ["deepseek" as const],
                    parameters: [
                        {
                            name: "API_KEY",
                            label: "Api Key",
                            type: "secret" as const,
                            required: true,
                        },
                    ],
                },
                source: "bundled" as const,
            },
        ];
        const deps = { configStore, runtimeStore, refreshService, definitions };
        const result = await handlePluginList(deps);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data).toHaveLength(1);
        const plugin = result.data[0];
        expect(plugin?.metadata).not.toBeNull();
        expect(plugin?.sourceInstanceId).toBe("deepseek-1");
        expect(plugin?.source).toBe("api_key");
        expect(plugin?.supportedProviders).toEqual(["deepseek"]);
        expect(plugin?.activeProviders).toEqual(["deepseek"]);
        const params = plugin?.metadata?.parameters;
        expect(params).toHaveLength(1);
        expect(params?.[0]?.name).toBe("API_KEY");
    });

    it("handlePluginList exposes CPA connector provider switches", async () => {
        const { handlePluginList } = await import("../../../src/main/ipc/plugin-ipc");
        const configStore = {
            load: vi.fn<() => Promise<AppConfiguration>>().mockResolvedValue({
                schemaVersion: 1,
                language: "zh-Hans" as const,
                plugins: [
                    {
                        instanceId: "cpa-1",
                        stateId: "cpa-1",
                        name: "CPA",
                        enabled: true,
                        executablePath: "/plugins/cpa-connector.js",
                        refreshIntervalSeconds: 300,
                        parameterValues: {
                            monitor_claude: "true",
                            monitor_codex: "true",
                            monitor_gemini: "false",
                        },
                        endpointOverrides: {},
                    },
                    {
                        instanceId: "cpa-2",
                        stateId: "cpa-2",
                        name: "CPA",
                        enabled: true,
                        executablePath: "/plugins/cpa-connector.js",
                        refreshIntervalSeconds: 300,
                        parameterValues: {},
                        endpointOverrides: {},
                    },
                ],
                launchAtLogin: false,
            }),
            save: vi.fn(),
            scheduleSave: vi.fn(),
            flushPendingSave: vi.fn().mockResolvedValue(undefined),
            hasPendingSave: vi.fn().mockReturnValue(false),
        };
        const runtimeStore: RuntimeStore = {
            getSnapshot: vi.fn().mockReturnValue({ status: "idle" }),
            updateState: vi.fn(),
            getAll: vi.fn().mockReturnValue(new Map()),
            subscribe: vi.fn().mockReturnValue(() => undefined),
            removeInstance: vi.fn(),
        };
        const refreshService = {
            refresh: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
            refreshAll: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        };
        const definitions = [
            {
                scriptName: "cpa-connector.js",
                executablePath: "/plugins/cpa-connector.js",
                metadata: {
                    schemaVersion: 1,
                    name: "CPA",
                    defaultSource: "cpa" as const,
                    supportedProviders: [
                        "claude" as const,
                        "codex" as const,
                        "gemini" as const,
                        "antigravity" as const,
                        "kimi" as const,
                    ],
                    parameters: [
                        {
                            name: "monitor_claude",
                            label: "Claude",
                            type: "boolean" as const,
                            required: false,
                            defaultValue: "TRUE",
                        },
                        {
                            name: "monitor_codex",
                            label: "Codex",
                            type: "boolean" as const,
                            required: false,
                            defaultValue: "true",
                        },
                        {
                            name: "monitor_gemini",
                            label: "Gemini",
                            type: "boolean" as const,
                            required: false,
                            defaultValue: "true",
                        },
                        {
                            name: "monitor_antigravity",
                            label: "Antigravity",
                            type: "boolean" as const,
                            required: false,
                            defaultValue: "false",
                        },
                        {
                            name: "monitor_kimi",
                            label: "Kimi",
                            type: "boolean" as const,
                            required: false,
                            defaultValue: "false",
                        },
                    ],
                },
                source: "bundled" as const,
            },
        ];
        const deps = { configStore, runtimeStore, refreshService, definitions };
        const result = await handlePluginList(deps);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data).toHaveLength(2);
        const connector = result.data.find((item) => item.instanceId === "cpa-1");
        expect(connector?.source).toBe("cpa");
        expect(connector?.supportedProviders).toEqual([
            "claude",
            "codex",
            "gemini",
            "antigravity",
            "kimi",
        ]);
        expect(connector?.activeProviders).toEqual(["claude", "codex"]);
        const defaultConnector = result.data.find((item) => item.instanceId === "cpa-2");
        expect(defaultConnector?.activeProviders).toEqual(["claude", "codex", "gemini"]);
    });
});
