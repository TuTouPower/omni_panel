import { describe, it, expect, vi } from "vitest";
import type { RuntimeStore } from "../../../src/main/core/scheduler/runtime-store";

type Ipc_handler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown;
type Ipc_handle = (channel: string, listener: Ipc_handler) => void;

const ipc_main_mock = vi.hoisted(() => ({
    handle: vi.fn<Ipc_handle>(),
    removeHandler: vi.fn(),
}));

const native_theme_mock = vi.hoisted(() => ({
    on: vi.fn(),
    off: vi.fn(),
    shouldUseDarkColors: false,
    themeSource: "system",
}));

vi.mock("electron", () => ({
    ipcMain: ipc_main_mock,
    nativeTheme: native_theme_mock,
    BrowserWindow: { getAllWindows: () => [] },
}));

function createMockDeps() {
    const runtimeStore: RuntimeStore = {
        getSnapshot: vi.fn().mockReturnValue({ status: "idle" }),
        updateState: vi.fn(),
        getAll: vi.fn().mockReturnValue(new Map()),
        subscribe: vi.fn().mockReturnValue(() => undefined),
        removeInstance: vi.fn(),
        hydrateFromCache: vi.fn().mockResolvedValue(undefined),
        flushPendingCache: vi.fn().mockResolvedValue(undefined),
    };
    return { runtimeStore };
}

function bad_event(): Electron.IpcMainInvokeEvent {
    return { senderFrame: { url: "about:blank" } } as unknown as Electron.IpcMainInvokeEvent;
}

function good_event(): Electron.IpcMainInvokeEvent {
    return { senderFrame: { url: "file:///index.html" } } as unknown as Electron.IpcMainInvokeEvent;
}

describe("event-ipc THEME_SET sender validation", () => {
    it("THEME_SET rejects unknown sender", async () => {
        const { registerEventIpc } = await import("../../../src/main/ipc/event-ipc");
        registerEventIpc(createMockDeps());

        const handler = ipc_main_mock.handle.mock.calls.find(([ch]) => ch === "theme:set")?.[1];
        if (!handler) throw new Error("missing theme:set handler");

        expect(() => handler(bad_event(), "dark")).toThrow("IPC not allowed from unknown origin");
    });

    it("THEME_SET allows valid sender", async () => {
        const { registerEventIpc } = await import("../../../src/main/ipc/event-ipc");
        ipc_main_mock.handle.mockClear();
        registerEventIpc(createMockDeps());

        const handler = ipc_main_mock.handle.mock.calls.find(([ch]) => ch === "theme:set")?.[1];
        if (!handler) throw new Error("missing theme:set handler");

        expect(() => handler(good_event(), "dark")).not.toThrow();
    });
});
