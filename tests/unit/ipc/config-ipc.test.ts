import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AppConfiguration } from "../../../src/shared/types/config";

type Ipc_handler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown;
type Ipc_handle = (channel: string, listener: Ipc_handler) => void;

const ipc_main_mock = vi.hoisted(() => ({
    handle: vi.fn<Ipc_handle>(),
}));

vi.mock("electron", () => ({
    app: { getVersion: () => "1.0.0-test" },
    dialog: {
        showSaveDialog: vi.fn(),
        showOpenDialog: vi.fn(),
    },
    ipcMain: ipc_main_mock,
}));

let temp_dir: string | undefined;

beforeEach(() => {
    vi.clearAllMocks();
    temp_dir = undefined;
});

afterEach(async () => {
    if (temp_dir) {
        await rm(temp_dir, { recursive: true, force: true });
    }
});

async function tempFile(name: string): Promise<string> {
    temp_dir ??= await mkdtemp(join(tmpdir(), "omni-usage-config-ipc-"));
    return join(temp_dir, name);
}

function createMockDeps() {
    const config: AppConfiguration = {
        schemaVersion: 1,
        language: "zh-Hans",
        plugins: [
            {
                instanceId: "claude",
                stateId: "claude",
                name: "Claude",
                enabled: true,
                executablePath: "/plugins/claude.py",
                refreshIntervalSeconds: 300,
                parameterValues: { API_KEY: "sk-real", MODEL: "gpt-4" },
                endpointOverrides: {},
            },
        ],
        launchAtLogin: false,
        providerLabelMaps: { gemini: { "internal-model": "Private Label" } },
    };

    const configStore = {
        load: vi.fn().mockResolvedValue(structuredClone(config)),
        save: vi.fn().mockResolvedValue(undefined),
        scheduleSave: vi.fn(),
        flushPendingSave: vi.fn().mockResolvedValue(undefined),
        hasPendingSave: vi.fn().mockReturnValue(false),
    };

    const secretsStore = {
        get: vi.fn().mockResolvedValue("sk-real"),
        set: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        exportAll: vi.fn().mockResolvedValue({ "claude:API_KEY": "sk-real" }),
        importAll: vi.fn().mockResolvedValue(undefined),
    };

    const secretParamKeys = new Map<string, ReadonlySet<string>>([
        ["claude", new Set(["API_KEY"])],
    ]);

    return { configStore, secretsStore, secretParamKeys };
}

describe("config-ipc", () => {
    it("handleConfigGet masks secret parameters", async () => {
        const deps = createMockDeps();
        const { handleConfigGet } = await import("../../../src/main/ipc/config-ipc");
        const result = await handleConfigGet(deps);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const plugin = result.data.config.plugins[0];
        expect(plugin?.parameterValues["API_KEY"]).toBe("***");
        expect(plugin?.parameterValues["MODEL"]).toBe("gpt-4");
    });

    it("handleConfigGet returns hasSecrets map", async () => {
        const deps = createMockDeps();
        const { handleConfigGet } = await import("../../../src/main/ipc/config-ipc");
        const result = await handleConfigGet(deps);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.hasSecrets["claude"]).toEqual({ API_KEY: true });
    });

    it("logs raw config IPC request and response payloads", async () => {
        const { addTransport, setLogLevel } = await import("../../../src/shared/lib/logger");
        const lines: string[] = [];
        const metas: unknown[] = [];
        const remove_transport = addTransport({
            write(level, module, message, meta) {
                lines.push(`${level}:${module}:${message}:${JSON.stringify(meta)}`);
                metas.push(meta);
            },
        });
        setLogLevel("debug");
        const previous_node_env = process.env["NODE_ENV"];

        try {
            process.env["NODE_ENV"] = "development";
            const deps = createMockDeps();
            const { registerConfigIpc } = await import("../../../src/main/ipc/config-ipc");
            await registerConfigIpc(deps);

            const handler = ipc_main_mock.handle.mock.calls.find(
                ([channel]) => channel === "config:get",
            )?.[1];
            if (!handler) throw new Error("missing config:get handler");

            await handler({} as Electron.IpcMainInvokeEvent);

            const joined = lines.join("\n");
            expect(joined).toContain("ipc request raw");
            expect(joined).toContain("ipc response raw");
            expect(joined).toContain("config:get");
            expect(joined).toContain("[redacted]");
            expect(joined).not.toContain("Private Label");
            expect(
                metas.some(
                    (meta) =>
                        (meta as Record<string, unknown> | undefined)?.["channel"] === "config:get",
                ),
            ).toBe(true);
            const trace_ids = metas
                .map((meta) => (meta as Record<string, unknown> | undefined)?.["trace_id"])
                .filter(Boolean);
            expect(trace_ids.length).toBeGreaterThan(1);
            expect(new Set(trace_ids).size).toBe(1);
        } finally {
            remove_transport();
            setLogLevel("debug");
            if (previous_node_env === undefined) {
                delete process.env["NODE_ENV"];
            } else {
                process.env["NODE_ENV"] = previous_node_env;
            }
        }
    });

    it("does not log protected config IPC payloads before sender validation", async () => {
        const { addTransport, setLogLevel } = await import("../../../src/shared/lib/logger");
        const lines: string[] = [];
        const remove_transport = addTransport({
            write(level, module, message, meta) {
                lines.push(`${level}:${module}:${message}:${JSON.stringify(meta)}`);
            },
        });
        const previous_node_env = process.env["NODE_ENV"];

        try {
            setLogLevel("debug");
            process.env["NODE_ENV"] = "development";
            const deps = createMockDeps();
            const { registerConfigIpc } = await import("../../../src/main/ipc/config-ipc");
            await registerConfigIpc(deps);

            const handler = ipc_main_mock.handle.mock.calls.find(
                ([channel]) => channel === "config:save",
            )?.[1];
            if (!handler) throw new Error("missing config:save handler");

            expect(() =>
                handler({ senderFrame: { url: "about:blank" } } as Electron.IpcMainInvokeEvent, {
                    secret: "raw-secret",
                }),
            ).toThrow("IPC not allowed from unknown origin");

            expect(lines.join("\n")).not.toContain("ipc request raw");
            expect(lines.join("\n")).not.toContain("raw-secret");
        } finally {
            remove_transport();
            setLogLevel("debug");
            if (previous_node_env === undefined) {
                delete process.env["NODE_ENV"];
            } else {
                process.env["NODE_ENV"] = previous_node_env;
            }
        }
    });

    it("handleConfigSave strips secret fields from parameterValues", async () => {
        const deps = createMockDeps();
        const { handleConfigSave } = await import("../../../src/main/ipc/config-ipc");

        const loaded = structuredClone(await deps.configStore.load()) as AppConfiguration;
        // Simulate renderer sending back "***" for secret
        const originalPlugin = loaded.plugins.find((p) => p.stateId === "claude");
        expect(originalPlugin).toBeDefined();
        if (!originalPlugin) return;
        const mutablePlugin: AppConfiguration["plugins"][number] = {
            ...originalPlugin,
            parameterValues: {
                ...originalPlugin.parameterValues,
                API_KEY: "***",
                MODEL: "gpt-4o",
            },
        };
        const modified: AppConfiguration = { ...loaded, plugins: [mutablePlugin] };

        const result = await handleConfigSave(deps, modified);
        expect(result.ok).toBe(true);
        const savedArgs = deps.configStore.save.mock.calls as [AppConfiguration][];
        expect(savedArgs.length).toBeGreaterThan(0);
        const savedPlugin = savedArgs[0]?.[0]?.plugins.find((p) => p.stateId === "claude");
        expect(savedPlugin?.parameterValues["API_KEY"]).toBeUndefined();
        expect(savedPlugin?.parameterValues["MODEL"]).toBe("gpt-4o");
    });

    it("handleConfigSave accepts accountOrders", async () => {
        const deps = createMockDeps();
        const { handleConfigSave } = await import("../../../src/main/ipc/config-ipc");

        const loaded = structuredClone(await deps.configStore.load()) as AppConfiguration;
        const modified = {
            ...loaded,
            accountOrders: {
                claude: ["cpa-main|label|Account B", "cpa-main|label|Account A"],
            },
        } as unknown as AppConfiguration;

        const result = await handleConfigSave(deps, modified);

        expect(result.ok).toBe(true);
        const savedArgs = deps.configStore.save.mock.calls as [Record<string, unknown>][];
        expect(savedArgs[0]?.[0]["accountOrders"]).toEqual({
            claude: ["cpa-main|label|Account B", "cpa-main|label|Account A"],
        });
    });

    it("handleConfigSave rejects unknown instanceId", async () => {
        const deps = createMockDeps();
        const { handleConfigSave } = await import("../../../src/main/ipc/config-ipc");

        const loaded = structuredClone(await deps.configStore.load()) as AppConfiguration;
        const fakePlugin: AppConfiguration["plugins"][number] = {
            instanceId: "unknown-id",
            stateId: "unknown-id",
            name: "Fake",
            enabled: true,
            executablePath: "/plugins/fake.py",
            refreshIntervalSeconds: 300,
            parameterValues: {},
            endpointOverrides: {},
        };
        const modified: AppConfiguration = { ...loaded, plugins: [...loaded.plugins, fakePlugin] };

        const result = await handleConfigSave(deps, modified);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("VALIDATION_ERROR");
        }
        expect(deps.configStore.scheduleSave).not.toHaveBeenCalled();
    });

    it("handleConfigSave rejects executablePath modification", async () => {
        const deps = createMockDeps();
        const { handleConfigSave } = await import("../../../src/main/ipc/config-ipc");

        const loaded = structuredClone(await deps.configStore.load()) as AppConfiguration;
        const modified: AppConfiguration = {
            ...loaded,
            plugins: loaded.plugins.map((p) => ({
                ...p,
                executablePath: "/plugins/different.py",
            })),
        };

        const result = await handleConfigSave(deps, modified);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("VALIDATION_ERROR");
        }
        expect(deps.configStore.scheduleSave).not.toHaveBeenCalled();
    });

    it("handleConfigSaveSecrets validates paramName against metadata", async () => {
        const deps = createMockDeps();
        const { handleConfigSaveSecrets } = await import("../../../src/main/ipc/config-ipc");

        const result = await handleConfigSaveSecrets(deps, {
            instanceId: "claude",
            secrets: { API_KEY: "new-key", INVALID_PARAM: "value" },
        });

        expect(result.ok).toBe(true);
        expect(deps.secretsStore.set).toHaveBeenCalledTimes(1);
        expect(deps.secretsStore.set).toHaveBeenCalledWith("claude:API_KEY", "new-key");
    });

    it("handleConfigSaveSecrets rejects unknown stateId", async () => {
        const deps = createMockDeps();
        const { handleConfigSaveSecrets } = await import("../../../src/main/ipc/config-ipc");

        const result = await handleConfigSaveSecrets(deps, {
            instanceId: "nonexistent",
            secrets: { API_KEY: "new-key" },
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("VALIDATION_ERROR");
        }
        expect(deps.secretsStore.set).not.toHaveBeenCalled();
    });

    it("handleConfigSaveSecrets allows saving secrets for disabled plugin", async () => {
        const deps = createMockDeps();
        const loaded = structuredClone(await deps.configStore.load()) as AppConfiguration;
        const claudePlugin = loaded.plugins.find((p) => p.stateId === "claude");
        if (!claudePlugin) return;
        const disabledConfig: AppConfiguration = {
            ...loaded,
            plugins: [{ ...claudePlugin, enabled: false }],
        };
        deps.configStore.load = vi.fn().mockResolvedValue(disabledConfig);
        const { handleConfigSaveSecrets } = await import("../../../src/main/ipc/config-ipc");

        const result = await handleConfigSaveSecrets(deps, {
            instanceId: "claude",
            secrets: { API_KEY: "new-key" },
        });

        expect(result.ok).toBe(true);
        expect(deps.secretsStore.set).toHaveBeenCalledWith("claude:API_KEY", "new-key");
    });

    it("handleConfigSaveSecrets fails when instanceId missing from secretParamKeys", async () => {
        const deps = createMockDeps();
        const loaded = structuredClone(await deps.configStore.load()) as AppConfiguration;
        // Plugin exists in config, but secretParamKeys map lacks this instance
        const configWithExtra: AppConfiguration = {
            ...loaded,
            plugins: [
                ...loaded.plugins,
                {
                    instanceId: "new-instance",
                    stateId: "new-instance",
                    name: "New",
                    enabled: true,
                    executablePath: "/plugins/new.py",
                    refreshIntervalSeconds: 300,
                    parameterValues: {},
                    endpointOverrides: {},
                },
            ],
        };
        deps.configStore.load = vi.fn().mockResolvedValue(configWithExtra);
        // secretParamKeys only has "claude", not "new-instance"
        const { handleConfigSaveSecrets } = await import("../../../src/main/ipc/config-ipc");

        const result = await handleConfigSaveSecrets(deps, {
            instanceId: "new-instance",
            secrets: { API_KEY: "new-key" },
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("INTERNAL_ERROR");
            expect(result.error.message).toContain("new-instance");
            expect(result.error.message).toContain("secret param keys");
        }
        expect(deps.secretsStore.set).not.toHaveBeenCalled();
    });

    it("handleConfigSaveSecrets writes secrets when allowedKeys registered", async () => {
        const deps = createMockDeps();
        const { handleConfigSaveSecrets } = await import("../../../src/main/ipc/config-ipc");

        const result = await handleConfigSaveSecrets(deps, {
            instanceId: "claude",
            secrets: { API_KEY: "new-key", NON_SECRET: "ignored" },
        });

        expect(result.ok).toBe(true);
        expect(deps.secretsStore.set).toHaveBeenCalledTimes(1);
        expect(deps.secretsStore.set).toHaveBeenCalledWith("claude:API_KEY", "new-key");
        expect(deps.secretsStore.set).not.toHaveBeenCalledWith(
            "claude:NON_SECRET",
            expect.anything(),
        );
    });

    it("config:duplicate creates an enabled blank account and returns its instanceId", async () => {
        const deps = createMockDeps();
        deps.configStore.load.mockResolvedValueOnce({
            ...(await deps.configStore.load()),
            plugins: [
                {
                    instanceId: "claude",
                    stateId: "claude",
                    name: "Claude",
                    enabled: true,
                    executablePath: "/plugins/claude.py",
                    refreshIntervalSeconds: 300,
                    manualRefreshOnly: true,
                    parameterValues: { API_KEY: "sk-real", MODEL: "gpt-4" },
                    endpointOverrides: {},
                },
            ],
        });
        const { registerConfigIpc } = await import("../../../src/main/ipc/config-ipc");
        await registerConfigIpc(deps);

        const handler = ipc_main_mock.handle.mock.calls.find(
            ([channel]) => channel === "config:duplicate",
        )?.[1];
        if (!handler) throw new Error("missing config:duplicate handler");

        const result = await handler(
            { senderFrame: { url: "file://settings" } } as Electron.IpcMainInvokeEvent,
            "claude",
        );

        expect(result).toMatchObject({ ok: true });
        const new_instance_id = (result as { data: { instanceId: string } }).data.instanceId;
        expect(typeof new_instance_id).toBe("string");
        expect(new_instance_id).not.toBe("");
        const savedArgs = deps.configStore.save.mock.calls as [AppConfiguration][];
        const saved = savedArgs[0]?.[0];
        const added = saved?.plugins.find((plugin) => plugin.instanceId === new_instance_id);
        expect(added).toMatchObject({
            enabled: true,
            executablePath: "/plugins/claude.py",
            parameterValues: {},
            endpointOverrides: {},
            manualRefreshOnly: true,
        });
        expect(added?.instanceId).not.toBe("claude");
        expect(added?.stateId).not.toBe("claude");
    });

    it("handleConfigExport writes JSON file via dialog", async () => {
        const { dialog } = await import("electron");
        const exportPath = await tempFile("export.json");
        vi.mocked(dialog).showSaveDialog.mockResolvedValue({
            canceled: false,
            filePath: exportPath,
        });

        const deps = createMockDeps();
        const { handleConfigExport } = await import("../../../src/main/ipc/config-ipc");
        const result = await handleConfigExport(deps);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.saved).toBe(true);
        expect(deps.secretsStore.exportAll).toHaveBeenCalled();
        const parsed = JSON.parse(await readFile(exportPath, "utf8")) as Record<string, unknown>;
        expect(parsed["formatVersion"]).toBe(1);
        expect(parsed["config"]).toBeDefined();
        expect(parsed["secrets"]).toEqual({ "claude:API_KEY": "***REDACTED***" });
    });

    it("handleConfigExport returns saved=false when dialog canceled", async () => {
        const { dialog } = await import("electron");
        vi.mocked(dialog).showSaveDialog.mockResolvedValue({
            canceled: true,
            filePath: "",
        });

        const deps = createMockDeps();
        const { handleConfigExport } = await import("../../../src/main/ipc/config-ipc");
        const result = await handleConfigExport(deps);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.saved).toBe(false);
    });

    it("handleConfigImport reads and applies config + secrets", async () => {
        const { dialog } = await import("electron");
        const importPath = await tempFile("import.json");
        vi.mocked(dialog).showOpenDialog.mockResolvedValue({
            canceled: false,
            filePaths: [importPath],
        });

        const importData = {
            formatVersion: 1,
            exportedAt: "2026-05-31T00:00:00Z",
            appVersion: "1.0.0",
            config: {
                schemaVersion: 1,
                language: "zh-Hans",
                plugins: [],
                launchAtLogin: false,
            },
            secrets: { "new:key": "new-val" },
        };
        await writeFile(importPath, JSON.stringify(importData), "utf8");

        const deps = createMockDeps();
        const { handleConfigImport } = await import("../../../src/main/ipc/config-ipc");
        const result = await handleConfigImport(deps);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.imported).toBe(true);
        expect(deps.configStore.save).toHaveBeenCalled();
        expect(deps.secretsStore.importAll).toHaveBeenCalledWith({ "new:key": "new-val" });
    });

    it("handleConfigImport rejects invalid formatVersion", async () => {
        const { dialog } = await import("electron");
        const importPath = await tempFile("bad.json");
        vi.mocked(dialog).showOpenDialog.mockResolvedValue({
            canceled: false,
            filePaths: [importPath],
        });
        await writeFile(importPath, JSON.stringify({ formatVersion: 99 }), "utf8");

        const deps = createMockDeps();
        const { handleConfigImport } = await import("../../../src/main/ipc/config-ipc");
        const result = await handleConfigImport(deps);

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
    });

    it("handleConfigImport returns imported=false when dialog canceled", async () => {
        const { dialog } = await import("electron");
        vi.mocked(dialog).showOpenDialog.mockResolvedValue({
            canceled: true,
            filePaths: [],
        });

        const deps = createMockDeps();
        const { handleConfigImport } = await import("../../../src/main/ipc/config-ipc");
        const result = await handleConfigImport(deps);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.imported).toBe(false);
    });

    it("handleConfigSave merges incoming with current on disk", async () => {
        // Regression: settings window may save a config that lacks
        // collapsedAccounts (because it loaded before the popup saved them).
        // The merged result must retain the on-disk collapsedAccounts.
        const deps = createMockDeps();
        // Pretend disk already has collapsedAccounts from a popup save
        const currentOnDisk = structuredClone(await deps.configStore.load()) as AppConfiguration;
        (currentOnDisk as unknown as Record<string, unknown>)["collapsedAccounts"] = {
            "cpa-main:label:Claude Account": true,
        };
        deps.configStore.load = vi.fn().mockResolvedValue(currentOnDisk);

        const { handleConfigSave } = await import("../../../src/main/ipc/config-ipc");

        // Settings sends config WITHOUT collapsedAccounts
        const incoming: AppConfiguration = {
            schemaVersion: 1,
            language: "zh-Hans",
            plugins: currentOnDisk.plugins,
            launchAtLogin: true,
        };

        const result = await handleConfigSave(deps, incoming);
        expect(result.ok).toBe(true);

        const saved = deps.configStore.save.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(saved).toBeDefined();
        // collapsedAccounts must be preserved from disk, not wiped
        expect(saved["collapsedAccounts"]).toEqual({
            "cpa-main:label:Claude Account": true,
        });
        // incoming field override works
        expect(saved["launchAtLogin"]).toBe(true);
    });

    it("handleConfigSave detects concurrent modification and returns CONFLICT", async () => {
        const deps = createMockDeps();
        const originalConfig = structuredClone(await deps.configStore.load()) as AppConfiguration;

        let loadCount = 0;
        deps.configStore.load = vi.fn().mockImplementation(() => {
            loadCount++;
            if (loadCount === 1) return Promise.resolve(originalConfig);
            // Second load returns a modified config (simulating another window's save)
            const modified = structuredClone(originalConfig) as unknown as Record<string, unknown>;
            modified["launchAtLogin"] = true;
            return Promise.resolve(modified as unknown as AppConfiguration);
        });

        const { handleConfigSave } = await import("../../../src/main/ipc/config-ipc");

        const result = await handleConfigSave(deps, originalConfig);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("CONFLICT");
        }
        expect(deps.configStore.save).not.toHaveBeenCalled();
    });
});
