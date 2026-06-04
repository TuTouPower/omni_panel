import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AppConfiguration } from "../../../src/shared/types/config";

vi.mock("electron", () => ({
    app: { getVersion: () => "1.0.0-test" },
    dialog: {
        showSaveDialog: vi.fn(),
        showOpenDialog: vi.fn(),
    },
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

    it("handleConfigSaveSecrets rejects disabled plugin", async () => {
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

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("VALIDATION_ERROR");
        }
        expect(deps.secretsStore.set).not.toHaveBeenCalled();
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
});
