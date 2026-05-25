import { describe, it, expect, vi } from "vitest";
import type { PluginSnapshotDTO } from "../../../src/shared/types/ipc";
import type { AppConfiguration } from "../../../src/shared/types/config";
import type { RuntimeStore } from "../../../src/main/core/scheduler/runtime-store";

function createMockDeps() {
    const configStore = {
        load: vi.fn<() => Promise<AppConfiguration>>().mockResolvedValue({
            schemaVersion: 1,
            language: "zh-Hans" as const,
            overviewDisplayMode: "tabs" as const,
            plugins: [
                {
                    instanceId: "claude",
                    stateId: "claude",
                    name: "Claude",
                    enabled: true,
                    executablePath: "/plugins/claude.py",
                    refreshIntervalSeconds: 300,
                    parameterValues: { API_KEY: "sk-real-key", MODEL: "gpt-4" },
                },
            ],
            launchAtLogin: false,
        }),
        save: vi.fn(),
        scheduleSave: vi.fn(),
    };

    const readyState: PluginSnapshotDTO = {
        status: "ready",
        items: [
            {
                id: "tokens",
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
});
