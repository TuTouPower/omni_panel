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
        prune_unhealthy_plugins: vi.fn().mockResolvedValue({}),
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

    describe("auth descriptor from manifest (t107)", () => {
        function build_definition(manifest: ConnectorDefinition["manifest"]): ConnectorDefinition {
            return {
                directory: `/connectors/${manifest.id}`,
                executablePath: `/connectors/${manifest.id}`,
                manifest,
            };
        }

        it("exposes grok oauth_device auth descriptor", async () => {
            const { handleConnectorList } = await import("../../../src/main/ipc/connector-ipc");
            const manifest: ConnectorDefinition["manifest"] = {
                id: "grok",
                provider: "grok",
                capabilities: ["poll"],
                parameters: [],
                auth: { method: "oauth_device", secret_name: "OAUTH_TOKEN" },
                poll: { request: { endpoint: "default", path: "/usage", method: "GET" }, map: {} },
            };
            const configStore = create_config_store([
                {
                    instanceId: "grok-1",
                    stateId: "grok-1",
                    name: "Grok",
                    enabled: true,
                    executablePath: "/connectors/grok",
                    refreshIntervalSeconds: 300,
                    parameterValues: {},
                    endpointOverrides: {},
                },
            ]);
            const deps = {
                configStore,
                runtimeStore: create_runtime_store("idle"),
                refreshService: createMockDeps().refreshService,
                definitions: [build_definition(manifest)],
            };
            const result = await handleConnectorList(deps);
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.data[0]?.metadata?.auth).toEqual({
                method: "oauth_device",
                secret_name: "OAUTH_TOKEN",
            });
        });

        it("exposes exa apikey auth descriptor with extra_fields", async () => {
            const { handleConnectorList } = await import("../../../src/main/ipc/connector-ipc");
            const manifest: ConnectorDefinition["manifest"] = {
                id: "exa",
                provider: "exa",
                capabilities: ["poll"],
                parameters: [],
                auth: {
                    method: "apikey",
                    secret_name: "SERVICE_KEY",
                    extra_fields: ["API_KEY_ID"],
                },
                poll: { request: { endpoint: "default", path: "/usage", method: "GET" }, map: {} },
            };
            const configStore = create_config_store([
                {
                    instanceId: "exa-1",
                    stateId: "exa-1",
                    name: "Exa",
                    enabled: true,
                    executablePath: "/connectors/exa",
                    refreshIntervalSeconds: 300,
                    parameterValues: {},
                    endpointOverrides: {},
                },
            ]);
            const deps = {
                configStore,
                runtimeStore: create_runtime_store("idle"),
                refreshService: createMockDeps().refreshService,
                definitions: [build_definition(manifest)],
            };
            const result = await handleConnectorList(deps);
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.data[0]?.metadata?.auth).toEqual({
                method: "apikey",
                secret_name: "SERVICE_KEY",
                extra_fields: ["API_KEY_ID"],
            });
        });

        it("exposes cpa cpa_mgmt auth descriptor with require_endpoint", async () => {
            const { handleConnectorList } = await import("../../../src/main/ipc/connector-ipc");
            const manifest: ConnectorDefinition["manifest"] = {
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
                auth: { method: "cpa_mgmt", secret_name: "cpa_mgmt_key", require_endpoint: true },
                poll: { request: { endpoint: "default", path: "/usage", method: "GET" }, map: {} },
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
            ]);
            const deps = {
                configStore,
                runtimeStore: create_runtime_store("idle"),
                refreshService: createMockDeps().refreshService,
                definitions: [build_definition(manifest)],
            };
            const result = await handleConnectorList(deps);
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.data[0]?.metadata?.auth).toEqual({
                method: "cpa_mgmt",
                secret_name: "cpa_mgmt_key",
                require_endpoint: true,
            });
        });

        it("exposes opencode_go web_login auth descriptor with login_url", async () => {
            const { handleConnectorList } = await import("../../../src/main/ipc/connector-ipc");
            const manifest: ConnectorDefinition["manifest"] = {
                id: "opencode_go",
                provider: "opencode_go",
                capabilities: ["session"],
                parameters: [],
                auth: {
                    method: "web_login",
                    secret_name: "SESSION_COOKIE",
                    login_url: "https://opencode.ai/auth",
                },
                poll: { request: { endpoint: "default", path: "/usage", method: "GET" }, map: {} },
            };
            const configStore = create_config_store([
                {
                    instanceId: "opencode-go-1",
                    stateId: "opencode-go-1",
                    name: "OpenCode Go",
                    enabled: true,
                    executablePath: "/connectors/opencode_go",
                    refreshIntervalSeconds: 300,
                    parameterValues: {},
                    endpointOverrides: {},
                },
            ]);
            const deps = {
                configStore,
                runtimeStore: create_runtime_store("idle"),
                refreshService: createMockDeps().refreshService,
                definitions: [build_definition(manifest)],
            };
            const result = await handleConnectorList(deps);
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.data[0]?.metadata?.auth).toEqual({
                method: "web_login",
                secret_name: "SESSION_COOKIE",
                login_url: "https://opencode.ai/auth",
            });
        });
    });

    describe("is_cpa_connector", () => {
        it("exists and returns true for a cpa connector definition", async () => {
            const { is_cpa_connector } = await import("../../../src/main/ipc/connector-ipc");
            expect(typeof is_cpa_connector).toBe("function");

            const cpa_def: ConnectorDefinition = {
                directory: "/connectors/cpa",
                executablePath: "/connectors/cpa",
                manifest: {
                    id: "cpa",
                    provider: "cpa",
                    capabilities: ["poll"],
                    parameters: [],
                    poll: {
                        request: { endpoint: "default", path: "/usage", method: "GET" },
                        map: {},
                    },
                },
            };
            expect(is_cpa_connector(cpa_def)).toBe(true);
        });

        it("returns false for a non-cpa connector definition", async () => {
            const { is_cpa_connector } = await import("../../../src/main/ipc/connector-ipc");
            expect(is_cpa_connector(claude_definition)).toBe(false);
        });

        it("returns false for undefined definition", async () => {
            const { is_cpa_connector } = await import("../../../src/main/ipc/connector-ipc");
            expect(is_cpa_connector(undefined)).toBe(false);
        });
    });

    describe("handleConnectorCatalog (t121)", () => {
        it("lists definitions independent of config.plugins and tombstone, without reading configStore", async () => {
            const { handleConnectorCatalog } = await import("../../../src/main/ipc/connector-ipc");
            const grok_def: ConnectorDefinition = {
                directory: "/connectors/grok",
                executablePath: "/connectors/grok",
                manifest: {
                    id: "grok",
                    provider: "grok",
                    capabilities: ["poll"],
                    parameters: [],
                    auth: { method: "oauth_device", secret_name: "OAUTH_TOKEN" },
                    poll: { request: { endpoint: "default", path: "/u", method: "GET" }, map: {} },
                },
            };
            const cpa_def: ConnectorDefinition = {
                directory: "/connectors/cpa",
                executablePath: "/connectors/cpa",
                manifest: {
                    id: "cpa",
                    provider: "cpa",
                    capabilities: ["poll"],
                    parameters: [
                        {
                            name: "monitor_claude",
                            type: "string",
                            required: false,
                            default: "true",
                            exposeToScript: true,
                        },
                    ],
                    auth: {
                        method: "cpa_mgmt",
                        secret_name: "cpa_mgmt_key",
                        require_endpoint: true,
                    },
                    poll: { request: { endpoint: "default", path: "/u", method: "GET" }, map: {} },
                },
            };
            // f002: 显式构造墓碑 + 空 plugins，证明 catalog 与 config.plugins/墓碑解耦
            const configStore = {
                load: vi.fn<() => Promise<AppConfiguration>>().mockResolvedValue({
                    schemaVersion: 1,
                    language: "zh-Hans" as const,
                    plugins: [],
                    launchAtLogin: false,
                    removedConnectorIds: ["grok", "cpa"],
                }),
                save: vi.fn(),
                scheduleSave: vi.fn(),
                flushPendingSave: vi.fn().mockResolvedValue(undefined),
                hasPendingSave: vi.fn().mockReturnValue(false),
                prune_unhealthy_plugins: vi.fn().mockResolvedValue({}),
            };
            const deps = {
                configStore,
                runtimeStore: create_runtime_store("idle"),
                refreshService: createMockDeps().refreshService,
                definitions: [grok_def, cpa_def],
            };
            const result = handleConnectorCatalog(deps);
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.data).toHaveLength(2);
            // f002: 墓碑内的 manifest id 仍出现在 catalog
            const grok = result.data.find((c) => c.manifest_id === "grok");
            expect(grok?.metadata.auth).toEqual({
                method: "oauth_device",
                secret_name: "OAUTH_TOKEN",
            });
            expect(grok?.supported_providers).toEqual(["grok"]);
            expect(grok?.source).toBe("poll");
            const cpa = result.data.find((c) => c.manifest_id === "cpa");
            expect(cpa?.metadata.auth).toEqual({
                method: "cpa_mgmt",
                secret_name: "cpa_mgmt_key",
                require_endpoint: true,
            });
            expect(cpa?.supported_providers).toEqual(["claude"]);
            expect(cpa?.source).toBe("gateway");
            // catalog 不读 configStore（独立于 config 状态）
            expect(configStore.load).not.toHaveBeenCalled();
        });

        it("does not leak secret values from config.plugins or secret param defaults", async () => {
            const { handleConnectorCatalog } = await import("../../../src/main/ipc/connector-ipc");
            const def: ConnectorDefinition = {
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
                            // secret 参数不该有 default；若误设，catalog 也不应泄漏
                            default: "should-not-leak-default",
                        },
                    ],
                    poll: { request: { endpoint: "default", path: "/u", method: "GET" }, map: {} },
                },
            };
            // f001: config.plugins 放真实 secret 值，证明 catalog 不读 configStore.parameterValues
            const configStore = {
                load: vi.fn<() => Promise<AppConfiguration>>().mockResolvedValue({
                    schemaVersion: 1,
                    language: "zh-Hans" as const,
                    plugins: [
                        {
                            instanceId: "claude-1",
                            stateId: "claude-1",
                            name: "Claude",
                            enabled: true,
                            executablePath: "/connectors/claude",
                            refreshIntervalSeconds: 300,
                            parameterValues: { API_KEY: "sk-real-key-xyz" },
                            endpointOverrides: {},
                        },
                    ],
                    launchAtLogin: false,
                }),
                save: vi.fn(),
                scheduleSave: vi.fn(),
                flushPendingSave: vi.fn().mockResolvedValue(undefined),
                hasPendingSave: vi.fn().mockReturnValue(false),
                prune_unhealthy_plugins: vi.fn().mockResolvedValue({}),
            };
            const deps = {
                configStore,
                runtimeStore: create_runtime_store("idle"),
                refreshService: createMockDeps().refreshService,
                definitions: [def],
            };
            const result = handleConnectorCatalog(deps);
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            const serialized = JSON.stringify(result.data);
            // configStore 里的 secret 值不得进入 catalog
            expect(serialized).not.toContain("sk-real-key-xyz");
            // manifest 里 secret 参数的 default 也不得泄漏
            expect(serialized).not.toContain("should-not-leak-default");
        });
    });
});
