import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BrowserWindow, shell as electronShell } from "electron";

type WindowOpenHandler = (details: { url: string }) => { action: "deny" };

describe("createWindowManager", () => {
    const openExternal = vi.fn<typeof electronShell.openExternal>();
    const setWindowOpenHandler = vi.fn<(handler: WindowOpenHandler) => void>();

    async function load_manager() {
        vi.doMock("electron", () => ({
            BrowserWindow: vi.fn().mockImplementation(
                () =>
                    ({
                        webContents: { setWindowOpenHandler },
                        setAppDetails: vi.fn(),
                        setMenuBarVisibility: vi.fn(),
                        loadURL: vi.fn().mockResolvedValue(undefined),
                        once: vi.fn(),
                        on: vi.fn(),
                        isDestroyed: vi.fn().mockReturnValue(false),
                        show: vi.fn(),
                    }) as never as BrowserWindow,
            ),
            nativeTheme: {
                shouldUseDarkColors: false,
                themeSource: "system",
            },
            shell: { openExternal } as never as typeof electronShell,
        }));
        const { createWindowManager } = await import("../../../src/main/window/window-manager");
        return createWindowManager({
            getPreloadPath: () => "/preload.js",
            getIconPath: () => "/icon.png",
            rendererIndexPath: "/renderer/index.html",
        });
    }

    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
    });

    it("registers a window-open handler that opens http(s) URLs externally (t156)", async () => {
        const manager = await load_manager();
        manager.createWindowFor("setting", { load: false });

        expect(setWindowOpenHandler).toHaveBeenCalledTimes(1);
        const handler = setWindowOpenHandler.mock.calls[0]?.[0];
        if (!handler) throw new Error("handler not registered");

        const result = handler({ url: "https://auth.x.ai/device?user_code=ABC" });
        expect(openExternal).toHaveBeenCalledWith("https://auth.x.ai/device?user_code=ABC");
        expect(result).toEqual({ action: "deny" });
    });

    it("blocks non-http(s) URLs from window-open (t156)", async () => {
        const manager = await load_manager();
        manager.createWindowFor("setting", { load: false });

        const handler = setWindowOpenHandler.mock.calls[0]?.[0];
        if (!handler) throw new Error("handler not registered");

        const result = handler({ url: "file:///etc/passwd" });
        expect(openExternal).not.toHaveBeenCalled();
        expect(result).toEqual({ action: "deny" });
    });
});
