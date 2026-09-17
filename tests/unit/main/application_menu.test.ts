const setApplicationMenuMock = vi.fn();
const buildFromTemplateMock = vi.fn((template: unknown) => ({ template }));

vi.mock("electron", () => ({
    app: { name: "OmniPanel" },
    Menu: {
        buildFromTemplate: (tpl: unknown) => buildFromTemplateMock(tpl),
        setApplicationMenu: (menu: unknown) => {
            setApplicationMenuMock(menu);
        },
    },
    BrowserWindow: {
        getFocusedWindow: vi.fn(),
    },
}));

import type { MenuItemConstructorOptions, BrowserWindow } from "electron";
import {
    build_application_menu_template,
    setup_application_menu,
} from "../../../src/main/menu/application-menu";

describe("application-menu (t493 AC-004)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("macOS 菜单模板包含必要的快捷键与动作 (AC-004)", () => {
        const template = build_application_menu_template({
            platform: "darwin",
            app_name: "OmniPanel",
        });

        // 包含 App、Edit、View、Window
        const labels = template.map((item) => item.label ?? (item.role ? `role:${item.role}` : ""));
        expect(labels).toContain("OmniPanel");
        expect(labels).toContain("View");
        expect(labels).toContain("Window");

        // 检查 App 菜单中的 Hide (Cmd+H) 和 Quit (Cmd+Q)
        const app_menu = template.find((item) => item.label === "OmniPanel");
        const app_submenu = app_menu?.submenu as MenuItemConstructorOptions[];
        expect(app_submenu).toBeDefined();

        const hide_item = app_submenu.find(
            (item) => item.role === "hide" || item.label?.includes("Hide"),
        );
        expect(hide_item).toBeDefined();
        expect(hide_item?.accelerator).toBe("Cmd+H");

        const quit_item = app_submenu.find((item) => item.label?.includes("Quit"));
        expect(quit_item).toBeDefined();
        expect(quit_item?.accelerator).toBe("Cmd+Q");

        // 检查 View 菜单中的全屏 (Ctrl+Cmd+F)
        const view_menu = template.find((item) => item.label === "View");
        const view_submenu = view_menu?.submenu as MenuItemConstructorOptions[];
        expect(view_submenu).toBeDefined();
        const fullscreen_item = view_submenu.find((item) => item.accelerator === "Ctrl+Cmd+F");
        expect(fullscreen_item).toBeDefined();

        // 检查 Window 菜单中的最小化 (Cmd+M) 与关闭 (Cmd+W)
        const window_menu = template.find((item) => item.label === "Window");
        const window_submenu = window_menu?.submenu as MenuItemConstructorOptions[];
        expect(window_submenu).toBeDefined();

        const min_item = window_submenu.find((item) => item.accelerator === "Cmd+M");
        expect(min_item).toBeDefined();

        const close_item = window_submenu.find((item) => item.accelerator === "Cmd+W");
        expect(close_item).toBeDefined();
    });

    it("⌘W 点击分流：usage 面板触发隐藏到托盘，其它窗口触发关闭 (AC-004)", () => {
        const hide_usage = vi.fn();
        const close_win = vi.fn();
        const hide_win = vi.fn();

        const template = build_application_menu_template({
            platform: "darwin",
            app_name: "OmniPanel",
            hide_usage_panel: hide_usage,
            is_usage_window: (win) => win.getTitle() === "Omni Panel - Usage",
        });

        const window_menu = template.find((item) => item.label === "Window");
        const window_submenu = window_menu?.submenu as MenuItemConstructorOptions[];
        const close_item = window_submenu.find((item) => item.accelerator === "Cmd+W");
        expect(close_item?.click).toBeDefined();

        // 1. 当聚焦窗口为 Usage 窗口时：隐藏到托盘
        const usage_mock = {
            getTitle: () => "Omni Panel - Usage",
            isDestroyed: () => false,
            hide: hide_win,
            close: close_win,
        } as unknown as BrowserWindow;

        close_item?.click?.(undefined as never, usage_mock, undefined as never);
        expect(hide_usage).toHaveBeenCalledTimes(1);
        expect(close_win).not.toHaveBeenCalled();

        // 2. 当聚焦窗口为其它窗口（如 Settings）时：调用 close()
        const settings_mock = {
            getTitle: () => "Omni Panel - Settings",
            isDestroyed: () => false,
            hide: hide_win,
            close: close_win,
        } as unknown as BrowserWindow;

        close_item?.click?.(undefined as never, settings_mock, undefined as never);
        expect(close_win).toHaveBeenCalledTimes(1);
    });

    it("非 macOS 平台不强制设置应用菜单", () => {
        const template = build_application_menu_template({
            platform: "win32",
        });
        expect(template).toEqual([]);
    });

    it("setup_application_menu 在 win32 下直接返回不设置", () => {
        expect(() => {
            setup_application_menu({ platform: "win32" });
        }).not.toThrow();
    });

    it("setup_application_menu 在 macOS 下组装并设置应用菜单", () => {
        setup_application_menu({ platform: "darwin" });
        expect(buildFromTemplateMock).toHaveBeenCalled();
        expect(setApplicationMenuMock).toHaveBeenCalled();
    });
});
