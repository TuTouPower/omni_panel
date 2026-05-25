import { describe, it, expect, vi } from "vitest";
import type { AppConfiguration } from "../../../src/shared/types/config";

function createMockDeps() {
    const config: AppConfiguration = {
        schemaVersion: 1,
        language: "zh-Hans",
        overviewDisplayMode: "tabs",
        plugins: [
            {
                instanceId: "claude",
                stateId: "claude",
                name: "Claude",
                enabled: true,
                executablePath: "/plugins/claude.py",
                refreshIntervalSeconds: 300,
                parameterValues: { API_KEY: "sk-real", MODEL: "gpt-4" },
            },
        ],
        launchAtLogin: false,
    };

    const configStore = {
        load: vi.fn().mockResolvedValue(structuredClone(config)),
        save: vi.fn().mockResolvedValue(undefined),
        scheduleSave: vi.fn(),
    };

    const secretsStore = {
        get: vi.fn().mockResolvedValue("sk-real"),
        set: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
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
        const plugin = result.data.plugins[0];
        expect(plugin?.parameterValues["API_KEY"]).toBe("***");
        expect(plugin?.parameterValues["MODEL"]).toBe("gpt-4");
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

        const result = handleConfigSave(deps, modified);
        expect(result.ok).toBe(true);
        const savedArgs = deps.configStore.scheduleSave.mock.calls as [AppConfiguration][];
        expect(savedArgs.length).toBeGreaterThan(0);
        const savedPlugin = savedArgs[0]?.[0]?.plugins.find((p) => p.stateId === "claude");
        expect(savedPlugin?.parameterValues["API_KEY"]).toBeUndefined();
        expect(savedPlugin?.parameterValues["MODEL"]).toBe("gpt-4o");
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
});
