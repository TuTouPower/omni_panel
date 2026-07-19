import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TokenStatsStore } from "../../../src/main/core/token-stats/token-stats-store";
import type { TokenStatsManager } from "../../../src/main/core/token-stats/manager";

type Ipc_handler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown;
type Ipc_handle = (channel: string, listener: Ipc_handler) => void;

const ipc_main_mock = vi.hoisted(() => ({
    handle: vi.fn<Ipc_handle>(),
}));

vi.mock("electron", () => ({
    ipcMain: ipc_main_mock,
}));

function createMockDeps() {
    const store = {
        query_buckets: vi.fn().mockReturnValue([]),
        query_sessions: vi.fn().mockReturnValue([]),
        query_records: vi.fn().mockReturnValue([]),
        last_updated: vi.fn().mockReturnValue(null),
    } as unknown as TokenStatsStore;
    const manager = {
        is_running: vi.fn().mockReturnValue(false),
    } as unknown as TokenStatsManager;
    return { store, manager };
}

function bad_event(): Electron.IpcMainInvokeEvent {
    return { senderFrame: { url: "about:blank" } } as unknown as Electron.IpcMainInvokeEvent;
}

function good_event(): Electron.IpcMainInvokeEvent {
    return { senderFrame: { url: "file:///index.html" } } as unknown as Electron.IpcMainInvokeEvent;
}

function pick_handler(channel: string): Ipc_handler {
    const entry = ipc_main_mock.handle.mock.calls.find(([ch]) => ch === channel);
    if (!entry) throw new Error(`missing ${channel} handler`);
    return entry[1];
}

describe("token-stats-ipc sender validation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
    });

    it("TOKEN_STATS_BUCKETS rejects unknown sender", async () => {
        const { registerTokenStatsIpc } = await import("../../../src/main/ipc/token-stats-ipc");
        registerTokenStatsIpc((await import("electron")).ipcMain, createMockDeps());
        expect(() => pick_handler("tokenStats:buckets")(bad_event())).toThrow(
            "IPC not allowed from unknown origin",
        );
    });

    it("TOKEN_STATS_SESSIONS rejects unknown sender", async () => {
        const { registerTokenStatsIpc } = await import("../../../src/main/ipc/token-stats-ipc");
        registerTokenStatsIpc((await import("electron")).ipcMain, createMockDeps());
        expect(() => pick_handler("tokenStats:sessions")(bad_event())).toThrow(
            "IPC not allowed from unknown origin",
        );
    });

    it("TOKEN_STATS_RECORDS rejects unknown sender", async () => {
        const { registerTokenStatsIpc } = await import("../../../src/main/ipc/token-stats-ipc");
        registerTokenStatsIpc((await import("electron")).ipcMain, createMockDeps());
        expect(() => pick_handler("tokenStats:records")(bad_event())).toThrow(
            "IPC not allowed from unknown origin",
        );
    });

    it("TOKEN_STATS_STATUS rejects unknown sender", async () => {
        const { registerTokenStatsIpc } = await import("../../../src/main/ipc/token-stats-ipc");
        registerTokenStatsIpc((await import("electron")).ipcMain, createMockDeps());
        expect(() => pick_handler("tokenStats:status")(bad_event())).toThrow(
            "IPC not allowed from unknown origin",
        );
    });

    it("TOKEN_STATS_BUCKETS allows valid sender", async () => {
        const { registerTokenStatsIpc } = await import("../../../src/main/ipc/token-stats-ipc");
        registerTokenStatsIpc((await import("electron")).ipcMain, createMockDeps());
        const result = pick_handler("tokenStats:buckets")(good_event());
        expect(result).toEqual({ ok: true, data: [] });
    });
});
