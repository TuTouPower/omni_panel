import { describe, it, expect, vi, beforeEach } from "vitest";
import { set_renderer_index_path } from "../../../src/main/ipc/helpers";

const ipc_main_mock = vi.hoisted(() => ({
    handle: vi.fn(),
    removeHandler: vi.fn(),
}));

vi.mock("electron", () => ({
    ipcMain: ipc_main_mock,
}));

// t178: 移除未初始化 fallback 后，测试须显式初始化 renderer index path（模拟生产接线）。
set_renderer_index_path("D:/app/out/renderer/index.html");

// A valid sender frame (packaged app file:// origin) so assert_valid_sender passes.
const valid_sender = { senderFrame: { url: "file:///D:/app/out/renderer/index.html" } };

describe("popup-ipc", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        // resetModules 清空模块缓存后，重新初始化 renderer index path（模拟生产接线）。
        const { set_renderer_index_path } = await import("../../../src/main/ipc/helpers");
        set_renderer_index_path("D:/app/out/renderer/index.html");
    });

    it("registerPopupIpc registers handler for POPUP_REPORT_CONTENT_HEIGHT", async () => {
        const { registerPopupIpc } = await import("../../../src/main/ipc/popup-ipc");
        const cleanup = registerPopupIpc({
            report_content_height: () => null,
        });
        expect(ipc_main_mock.handle).toHaveBeenCalledWith(
            "popup:reportContentHeight",
            expect.any(Function),
        );
        cleanup();
    });

    it("handler calls report_content_height with valid payload", async () => {
        const report_fn = vi.fn().mockReturnValue(500);
        const { registerPopupIpc } = await import("../../../src/main/ipc/popup-ipc");
        registerPopupIpc({ report_content_height: report_fn });

        const handler = ipc_main_mock.handle.mock.calls.find(
            (call: unknown[]) => call[0] === "popup:reportContentHeight",
        )?.[1] as (event: unknown, payload: unknown) => unknown;

        const result = handler(valid_sender, { content_height: 400, collapsed_min_height: 100 });
        expect(result).toEqual({ ok: true, data: null });
        expect(report_fn).toHaveBeenCalledWith({
            content_height: 400,
            collapsed_min_height: 100,
        });
    });

    it("handler rejects invalid payload", async () => {
        const report_fn = vi.fn();
        const { registerPopupIpc } = await import("../../../src/main/ipc/popup-ipc");
        registerPopupIpc({ report_content_height: report_fn });

        const handler = ipc_main_mock.handle.mock.calls.find(
            (call: unknown[]) => call[0] === "popup:reportContentHeight",
        )?.[1] as (event: unknown, payload: unknown) => unknown;

        // Missing required field
        const result = handler(valid_sender, { content_height: 400 });
        expect(result).toMatchObject({ ok: false });
        expect(report_fn).not.toHaveBeenCalled();
    });

    it("handler rejects non-object payload", async () => {
        const report_fn = vi.fn();
        const { registerPopupIpc } = await import("../../../src/main/ipc/popup-ipc");
        registerPopupIpc({ report_content_height: report_fn });

        const handler = ipc_main_mock.handle.mock.calls.find(
            (call: unknown[]) => call[0] === "popup:reportContentHeight",
        )?.[1] as (event: unknown, payload: unknown) => unknown;

        expect(handler(valid_sender, null)).toMatchObject({ ok: false });
        expect(handler(valid_sender, "string")).toMatchObject({ ok: false });
        expect(report_fn).not.toHaveBeenCalled();
    });

    it("handler rejects values exceeding max (4096)", async () => {
        const report_fn = vi.fn();
        const { registerPopupIpc } = await import("../../../src/main/ipc/popup-ipc");
        registerPopupIpc({ report_content_height: report_fn });

        const handler = ipc_main_mock.handle.mock.calls.find(
            (call: unknown[]) => call[0] === "popup:reportContentHeight",
        )?.[1] as (event: unknown, payload: unknown) => unknown;

        const result = handler(valid_sender, { content_height: 4097, collapsed_min_height: 100 });
        expect(result).toMatchObject({ ok: false });
        expect(report_fn).not.toHaveBeenCalled();
    });

    it("handler rejects invalid sender origin", async () => {
        const report_fn = vi.fn();
        const { registerPopupIpc } = await import("../../../src/main/ipc/popup-ipc");
        registerPopupIpc({ report_content_height: report_fn });

        const handler = ipc_main_mock.handle.mock.calls.find(
            (call: unknown[]) => call[0] === "popup:reportContentHeight",
        )?.[1] as (event: unknown, payload: unknown) => unknown;

        expect(() => handler({}, { content_height: 400, collapsed_min_height: 100 })).toThrow(
            "IPC not allowed from unknown origin",
        );
        expect(report_fn).not.toHaveBeenCalled();
    });

    it("cleanup function removes handler", async () => {
        const { registerPopupIpc } = await import("../../../src/main/ipc/popup-ipc");
        const cleanup = registerPopupIpc({
            report_content_height: () => null,
        });
        cleanup();
        expect(ipc_main_mock.removeHandler).toHaveBeenCalledWith("popup:reportContentHeight");
    });
});
