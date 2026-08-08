import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BrowserWindow, shell as electronShell } from "electron";

type WindowOpenHandler = (details: { url: string }) => { action: "deny" };

describe("createWindowManager", () => {
    const openExternal = vi.fn<typeof electronShell.openExternal>();
    const setWindowOpenHandler = vi.fn<(handler: WindowOpenHandler) => void>();
    const setTitle = vi.fn();

    async function load_manager() {
        vi.doMock("electron", () => ({
            BrowserWindow: vi.fn().mockImplementation(
                () =>
                    ({
                        webContents: { setWindowOpenHandler },
                        setAppDetails: vi.fn(),
                        setTitle,
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

    it("getRendererUrl 附带 route_query 参数并 URL 编码（t210 OPEN 初始定位）", async () => {
        const manager = await load_manager();
        const loc = JSON.stringify({
            source: "claude_code",
            env: "win",
            session_id: "s1 x&y",
        });

        const url = manager.getRendererUrl("history", { loc });

        // 主题参数 + 路由 hash + 编码后的 loc query 一并出现。
        expect(url).toContain("ou_theme=light");
        expect(url).toContain("#history");
        expect(url).toContain(`loc=${encodeURIComponent(loc)}`);
        // 原样 JSON 不得直接泄漏进 URL（含空格/& 等需编码）。
        expect(url).not.toContain(`loc=${loc}`);
    });

    it("按面板设置系统标题（AC9）", async () => {
        const manager = await load_manager();
        manager.createWindowFor("agent", { load: false });

        expect(setTitle).toHaveBeenCalledWith("Omni Panel - Agent");
    });

    it("无面板标题的窗口不设置系统标题", async () => {
        const manager = await load_manager();
        manager.createWindowFor("tray_menu", { load: false });
        expect(setTitle).not.toHaveBeenCalled();
    });
});
