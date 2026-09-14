import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { set_renderer_index_path } from "../../../src/main/ipc/helpers";

const ipc_main_mock = vi.hoisted(() => ({ handle: vi.fn() }));

vi.mock("electron", () => ({ ipcMain: ipc_main_mock }));

const valid_sender = { senderFrame: { url: "file:///D:/app/out/renderer/index.html" } };

describe("dev-panel model routing IPC", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        set_renderer_index_path(fileURLToPath("file:///D:/app/out/renderer/index.html"));
    });

    it("registers the shared desktop model-routing channels", async () => {
        const { registerDevPanelIpc } = await import("../../../src/main/ipc/dev-panel-ipc");
        registerDevPanelIpc(ipc_main_mock as never, {
            manager: { start: vi.fn(), get_status: vi.fn(), cancel: vi.fn() },
            model_routing: {
                get_config: vi.fn(),
                get_channels: vi.fn(),
                save: vi.fn(),
                test: vi.fn(),
                get_snapshot_info: vi.fn(),
            },
            open: vi.fn(),
        });
        const channels = ipc_main_mock.handle.mock.calls.map((call: unknown[]) => call[0]);
        expect(channels).toEqual(
            expect.arrayContaining([
                "devPanel:modelRoutingConfig",
                "devPanel:modelRoutingChannels",
                "devPanel:modelRoutingSave",
                "devPanel:modelRoutingTest",
                "devPanel:modelRoutingSnapshot",
            ]),
        );
    });

    it("requires explicit confirmation before desktop save", async () => {
        const { registerDevPanelIpc } = await import("../../../src/main/ipc/dev-panel-ipc");
        const save = vi.fn().mockResolvedValue({ success: true });
        registerDevPanelIpc(ipc_main_mock as never, {
            manager: { start: vi.fn(), get_status: vi.fn(), cancel: vi.fn() },
            model_routing: {
                get_config: vi.fn(),
                get_channels: vi.fn(),
                save,
                test: vi.fn(),
                get_snapshot_info: vi.fn(),
            },
            open: vi.fn(),
        });
        const handler = ipc_main_mock.handle.mock.calls.find(
            (call: unknown[]) => call[0] === "devPanel:modelRoutingSave",
        )?.[1] as (event: unknown, request: unknown) => Promise<unknown>;
        await expect(
            handler(valid_sender, {
                selections: { default_model: "claude-sonnet" },
                confirmed: false,
            }),
        ).resolves.toMatchObject({ ok: false, error: { code: "INVALID_ARGUMENT" } });
        expect(save).not.toHaveBeenCalled();
        await expect(
            handler(valid_sender, {
                selections: { default_model: "claude-sonnet" },
                confirmed: true,
            }),
        ).resolves.toMatchObject({ ok: true });
        expect(save).toHaveBeenCalledWith({
            selections: { default_model: "claude-sonnet" },
            confirmed: true,
        });
    });
});
