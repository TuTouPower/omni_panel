import { describe, it, expect, vi } from "vitest";
import type { AppConfiguration } from "../../../src/shared/types/config";
import type { RuntimeStore } from "../../../src/main/core/scheduler/runtime-store";

type Ipc_handler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown;
type Ipc_handle = (channel: string, listener: Ipc_handler) => void;

const ipc_main_mock = vi.hoisted(() => ({
    handle: vi.fn<Ipc_handle>(),
}));

vi.mock("electron", () => ({
    ipcMain: ipc_main_mock,
}));

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
                parameterValues: {},
                endpointOverrides: {},
            },
        ],
        launchAtLogin: false,
    };

    const configStore = {
        load: vi.fn<() => Promise<AppConfiguration>>().mockResolvedValue(config),
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

    return { configStore, runtimeStore, refreshService, definitions: [] };
}

function bad_event(): Electron.IpcMainInvokeEvent {
    return { senderFrame: { url: "about:blank" } } as unknown as Electron.IpcMainInvokeEvent;
}

function good_event(): Electron.IpcMainInvokeEvent {
    return { senderFrame: { url: "file:///index.html" } } as unknown as Electron.IpcMainInvokeEvent;
}

describe("connector-ipc sender validation", () => {
    it("CONNECTOR_LIST rejects unknown sender", async () => {
        const { registerConnectorIpc } = await import("../../../src/main/ipc/connector-ipc");
        await registerConnectorIpc(createMockDeps());

        const handler = ipc_main_mock.handle.mock.calls.find(
            ([ch]) => ch === "connector:list",
        )?.[1];
        if (!handler) throw new Error("missing connector:list handler");

        await expect(handler(bad_event())).rejects.toThrow("IPC not allowed from unknown origin");
    });

    it("CONNECTOR_GET_STATE rejects unknown sender", async () => {
        const { registerConnectorIpc } = await import("../../../src/main/ipc/connector-ipc");
        await registerConnectorIpc(createMockDeps());

        const handler = ipc_main_mock.handle.mock.calls.find(
            ([ch]) => ch === "connector:getState",
        )?.[1];
        if (!handler) throw new Error("missing connector:getState handler");

        await expect(handler(bad_event(), "claude")).rejects.toThrow(
            "IPC not allowed from unknown origin",
        );
    });

    it("CONNECTOR_REFRESH rejects unknown sender", async () => {
        const { registerConnectorIpc } = await import("../../../src/main/ipc/connector-ipc");
        await registerConnectorIpc(createMockDeps());

        const handler = ipc_main_mock.handle.mock.calls.find(
            ([ch]) => ch === "connector:refresh",
        )?.[1];
        if (!handler) throw new Error("missing connector:refresh handler");

        await expect(handler(bad_event(), "claude")).rejects.toThrow(
            "IPC not allowed from unknown origin",
        );
    });

    it("CONNECTOR_REFRESH_ALL rejects unknown sender", async () => {
        const { registerConnectorIpc } = await import("../../../src/main/ipc/connector-ipc");
        await registerConnectorIpc(createMockDeps());

        const handler = ipc_main_mock.handle.mock.calls.find(
            ([ch]) => ch === "connector:refreshAll",
        )?.[1];
        if (!handler) throw new Error("missing connector:refreshAll handler");

        await expect(handler(bad_event())).rejects.toThrow("IPC not allowed from unknown origin");
    });

    it("CONNECTOR_SNAPSHOT rejects unknown sender", async () => {
        const { registerConnectorIpc } = await import("../../../src/main/ipc/connector-ipc");
        await registerConnectorIpc(createMockDeps());

        const handler = ipc_main_mock.handle.mock.calls.find(
            ([ch]) => ch === "connector:snapshot",
        )?.[1];
        if (!handler) throw new Error("missing connector:snapshot handler");

        await expect(handler(bad_event())).rejects.toThrow("IPC not allowed from unknown origin");
    });

    it("CONNECTOR_LIST allows valid sender", async () => {
        const { registerConnectorIpc } = await import("../../../src/main/ipc/connector-ipc");
        await registerConnectorIpc(createMockDeps());

        const handler = ipc_main_mock.handle.mock.calls.find(
            ([ch]) => ch === "connector:list",
        )?.[1];
        if (!handler) throw new Error("missing connector:list handler");

        const result = await handler(good_event());
        expect(result).toBeDefined();
    });
});
