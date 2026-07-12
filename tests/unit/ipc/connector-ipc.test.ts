import { describe, it, expect, vi } from "vitest";
import type { ConnectorSnapshotDTO } from "../../../src/shared/types/ipc";
import type { AppConfiguration } from "../../../src/shared/types/config";
import type { RuntimeStore } from "../../../src/main/core/scheduler/runtime-store";
import type { ConnectorDefinition } from "../../../src/main/core/connector/manifest-loader";

const claude_definition: ConnectorDefinition = {
    directory: "/connectors/claude",
    executablePath: "/connectors/claude",
    manifest: {
        id: "claude",
        provider: "claude",
        capabilities: ["poll"],
        parameters: [
            {
                name: "API_KEY",
                label: "Api Key",
                type: "secret",
                required: true,
                exposeToScript: false,
            },
        ],
        poll: {
            request: { endpoint: "default", path: "/usage", method: "GET" },
            map: {},
        },
    },
};

function create_runtime_store(snapshot: ConnectorSnapshotDTO["status"] = "ready"): RuntimeStore {
    return {
        getSnapshot: vi.fn().mockReturnValue(
            snapshot === "ready"
                ? {
                      status: "ready",
                      items: [
                          {
                              id: "tokens",
                              provider: "claude",
                              source: "poll",
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
                      updatedAt: new Date("2026-05-24T14:00:00.000Z"),
                  }
                : { status: snapshot },
        ),
        updateState: vi.fn(),
        getAll: vi.fn().mockReturnValue(new Map()),
        subscribe: vi.fn().mockReturnValue(() => undefined),
        removeInstance: vi.fn(),
        hydrateFromCache: vi.fn().mockResolvedValue(undefined),
        flushPendingCache: vi.fn().mockResolvedValue(undefined),
    };
}

function create_config_store(plugins: AppConfiguration["plugins"]) {
    return {
        load: vi.fn<() => Promise<AppConfiguration>>().mockResolvedValue({
            schemaVersion: 1,
            language: "zh-Hans" as const,
            plugins,
            launchAtLogin: false,
        }),
        save: vi.fn(),
        scheduleSave: vi.fn(),
        flushPendingSave: vi.fn().mockResolvedValue(undefined),
        hasPendingSave: vi.fn().mockReturnValue(false),
    };
}

function createMockDeps() {
    const configStore = create_config_store([
        {
            instanceId: "claude",
            stateId: "claude",
            name: "Claude",
            enabled: true,
            executablePath: claude_definition.executablePath,
            refreshIntervalSeconds: 300,
            parameterValues: { API_KEY: "sk-real-key", MODEL: "gpt-4" },
            endpointOverrides: {},
        },
    ]);
    const refreshService = {
        refresh: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        refreshAll: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };

    return {
        configStore,
        runtimeStore: create_runtime_store(),
        refreshService,
        definitions: [claude_definition],
    };
}

describe("connector-ipc", () => {
    it("handleConnectorList returns ConnectorInfo[]", async () => {
        const deps = createMockDeps();
        const { handleConnectorList } = await import("../../../src/main/ipc/connector-ipc");
        const result = await handleConnectorList(deps);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data).toHaveLength(1);
        const item = result.data[0];
        expect(item?.stateId).toBe("claude");
        expect(item?.displayName).toBe("");
        expect(item?.source).toBe("poll");
        expect(item?.supportedProviders).toEqual(["claude"]);
        expect(item?.metadata?.parameters?.[0]?.name).toBe("API_KEY");
        expect(item?.snapshot.status).toBe("ready");
    });

    it("handleConnectorGetState returns DTO for valid stateId", async () => {
        const deps = createMockDeps();
        const { handleConnectorGetState } = await import("../../../src/main/ipc/connector-ipc");
        const result = handleConnectorGetState(deps, "claude");

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.status).toBe("ready");
    });

    it("handleConnectorGetState rejects empty stateId", async () => {
        const deps = createMockDeps();
        const { handleConnectorGetState } = await import("../../../src/main/ipc/connector-ipc");
        const result = handleConnectorGetState(deps, "");

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("VALIDATION_ERROR");
        }
    });

    it("handleConnectorRefresh calls refreshService.refresh with force", async () => {
        const deps = createMockDeps();
        const { handleConnectorRefresh } = await import("../../../src/main/ipc/connector-ipc");
        const result = await handleConnectorRefresh(deps, "claude");

        expect(result.ok).toBe(true);
        expect(deps.refreshService.refresh).toHaveBeenCalledWith("claude", { force: true });
    });

    it("handleConnectorRefreshAll calls refreshService.refreshAll", async () => {
        const deps = createMockDeps();
        const { handleConnectorRefreshAll } = await import("../../../src/main/ipc/connector-ipc");
        const result = await handleConnectorRefreshAll(deps);

        expect(result.ok).toBe(true);
        expect(deps.refreshService.refreshAll).toHaveBeenCalled();
    });

    it("handleConnectorSnapshot returns all runtime snapshots", async () => {
        const deps = createMockDeps();
        deps.runtimeStore.getAll = vi.fn().mockReturnValue(
            new Map([
                [
                    "claude",
                    {
                        status: "ready",
                        items: [],
                        updatedAt: new Date("2026-05-24T14:00:00.000Z"),
                    },
                ],
            ]),
        );
        const { handleConnectorSnapshot } = await import("../../../src/main/ipc/connector-ipc");
        const result = handleConnectorSnapshot(deps);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data["claude"]?.status).toBe("ready");
    });

    it("handleConnectorList resolves metadata on Windows backslash paths", async () => {
        const { handleConnectorList } = await import("../../../src/main/ipc/connector-ipc");
        const windows_definition: ConnectorDefinition = {
            directory: "connectors\\deepseek",
            executablePath: "connectors\\deepseek",
            manifest: {
                id: "deepseek",
                provider: "deepseek",
                capabilities: ["poll"],
                parameters: [
                    {
                        name: "API_KEY",
                        label: "Api Key",
                        type: "secret",
                        required: true,
                        exposeToScript: false,
                    },
                ],
                poll: {
                    request: { endpoint: "default", path: "/usage", method: "GET" },
                    map: {},
                },
            },
        };
        const configStore = create_config_store([
            {
                instanceId: "deepseek-1",
                stateId: "deepseek-1",
                name: "DeepSeek",
                enabled: true,
                executablePath: "connectors\\deepseek",
                refreshIntervalSeconds: 300,
                parameterValues: {},
                endpointOverrides: {},
            },
        ]);
        const deps = {
            configStore,
            runtimeStore: create_runtime_store("idle"),
            refreshService: createMockDeps().refreshService,
            definitions: [windows_definition],
        };
        const result = await handleConnectorList(deps);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const plugin = result.data[0];
        expect(plugin?.metadata).not.toBeNull();
        expect(plugin?.sourceInstanceId).toBe("deepseek-1");
        expect(plugin?.source).toBe("poll");
        expect(plugin?.supportedProviders).toEqual(["deepseek"]);
        expect(plugin?.activeProviders).toEqual(["deepseek"]);
        expect(plugin?.metadata?.parameters?.[0]?.name).toBe("API_KEY");
    });

    it("handleConnectorList exposes CPA connector provider switches", async () => {
        const { handleConnectorList } = await import("../../../src/main/ipc/connector-ipc");
        const cpa_definition: ConnectorDefinition = {
            directory: "/connectors/cpa",
            executablePath: "/connectors/cpa",
            manifest: {
                id: "cpa",
                provider: "cpa",
                capabilities: ["poll"],
                parameters: [
                    {
                        name: "monitor_claude",
                        label: "Claude",
                        type: "string",
                        required: false,
                        exposeToScript: false,
                        default: "true",
                    },
                ],
                poll: {
                    request: { endpoint: "default", path: "/usage", method: "GET" },
                    map: {},
                },
            },
        };
        const configStore = create_config_store([
            {
                instanceId: "cpa-1",
                stateId: "cpa-1",
                name: "CPA",
                enabled: true,
                executablePath: "/connectors/cpa",
                refreshIntervalSeconds: 300,
                parameterValues: { monitor_claude: "true" },
                endpointOverrides: {},
            },
            {
                instanceId: "cpa-2",
                stateId: "cpa-2",
                name: "CPA",
                enabled: true,
                executablePath: "/connectors/cpa",
                refreshIntervalSeconds: 300,
                parameterValues: {},
                endpointOverrides: {},
            },
        ]);
        const deps = {
            configStore,
            runtimeStore: create_runtime_store("idle"),
            refreshService: createMockDeps().refreshService,
            definitions: [cpa_definition],
        };
        const result = await handleConnectorList(deps);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data).toHaveLength(2);
        const connector = result.data.find((item) => item.instanceId === "cpa-1");
        expect(connector?.source).toBe("gateway");
        expect(connector?.supportedProviders).toEqual(["claude"]);
        expect(connector?.activeProviders).toEqual(["claude"]);
        const defaultConnector = result.data.find((item) => item.instanceId === "cpa-2");
        expect(defaultConnector?.activeProviders).toEqual(["claude"]);
    });
});
