import { beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "../../../src/shared/types/ipc";

const electron_mock = vi.hoisted(() => ({
    contextBridge: {
        exposeInMainWorld: vi.fn(),
    },
    ipcRenderer: {
        invoke: vi.fn(),
        on: vi.fn(),
        removeListener: vi.fn(),
    },
}));

vi.mock("electron", () => electron_mock);

describe("preload config.export options contract (t490)", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        vi.stubGlobal("window", {
            location: { href: "file:///app/index.html#setting", hash: "#setting" },
        });
        vi.stubGlobal("document", {
            documentElement: { setAttribute: vi.fn(), style: {} },
        });
    });

    // t490 AC-003：桌面端与 Web 端一致地透传 { includeSecrets }，不再 void options。
    it("forwards { includeSecrets } to the CONFIG_EXPORT channel", async () => {
        electron_mock.ipcRenderer.invoke.mockResolvedValue({ ok: true, data: { saved: true } });
        await import("../../../src/preload/index");

        const api = electron_mock.contextBridge.exposeInMainWorld.mock.calls[0]?.[1] as {
            config: { export: (options?: { includeSecrets?: boolean }) => Promise<unknown> };
        };

        await api.config.export({ includeSecrets: true });
        expect(electron_mock.ipcRenderer.invoke).toHaveBeenLastCalledWith(
            IPC_CHANNELS.CONFIG_EXPORT,
            { includeSecrets: true },
        );

        await api.config.export({ includeSecrets: false });
        expect(electron_mock.ipcRenderer.invoke).toHaveBeenLastCalledWith(
            IPC_CHANNELS.CONFIG_EXPORT,
            { includeSecrets: false },
        );
    });

    it("sends null when called without options (default = 不含明文密钥)", async () => {
        electron_mock.ipcRenderer.invoke.mockResolvedValue({ ok: true, data: { saved: false } });
        await import("../../../src/preload/index");

        const api = electron_mock.contextBridge.exposeInMainWorld.mock.calls[0]?.[1] as {
            config: { export: (options?: { includeSecrets?: boolean }) => Promise<unknown> };
        };

        await expect(api.config.export()).resolves.toEqual({ saved: false });
        expect(electron_mock.ipcRenderer.invoke).toHaveBeenLastCalledWith(
            IPC_CHANNELS.CONFIG_EXPORT,
            null,
        );
    });
});
