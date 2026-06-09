import { describe, expect, it, vi } from "vitest";
import { create_main_panel_controller } from "../../../src/main/core/main-panel/main-panel-controller";
import type { MainPanelControllerDeps } from "../../../src/main/core/main-panel/main-panel-controller";
import type { AppConfiguration } from "../../../src/shared/types/config";

const base_config: AppConfiguration = {
    schemaVersion: 1,
    language: "zh-Hans",
    plugins: [],
    launchAtLogin: false,
};

interface FakeWindow {
    bounds: { x: number; y: number; width: number; height: number };
    destroyed: boolean;
    visible: boolean;
    resizable: boolean;
    listeners: Record<string, (() => void)[]>;
    show: ReturnType<typeof vi.fn>;
    hide: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    focus: ReturnType<typeof vi.fn>;
    setBounds: ReturnType<typeof vi.fn>;
    getBounds: () => { x: number; y: number; width: number; height: number };
    isDestroyed: () => boolean;
    isVisible: () => boolean;
    setResizable: ReturnType<typeof vi.fn>;
    setSkipTaskbar: ReturnType<typeof vi.fn>;
    setMinimumSize: ReturnType<typeof vi.fn>;
    setAlwaysOnTop: ReturnType<typeof vi.fn>;
    loadURL: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
}

function make_window(): FakeWindow {
    const win: FakeWindow = {
        bounds: { x: 0, y: 0, width: 460, height: 480 },
        destroyed: false,
        visible: false,
        resizable: true,
        listeners: {},
        show: vi.fn(() => {
            win.visible = true;
        }),
        hide: vi.fn(() => {
            win.visible = false;
        }),
        close: vi.fn(() => {
            win.destroyed = true;
            win.visible = false;
        }),
        destroy: vi.fn(() => {
            win.destroyed = true;
            win.visible = false;
        }),
        focus: vi.fn(),
        setBounds: vi.fn((next: Partial<FakeWindow["bounds"]>) => {
            win.bounds = { ...win.bounds, ...next };
            for (const handler of win.listeners["resize"] ?? []) {
                handler();
            }
        }),
        getBounds: () => win.bounds,
        isDestroyed: () => win.destroyed,
        isVisible: () => win.visible,
        setResizable: vi.fn((value: boolean) => {
            win.resizable = value;
        }),
        setSkipTaskbar: vi.fn(),
        setMinimumSize: vi.fn(),
        setAlwaysOnTop: vi.fn(),
        loadURL: vi.fn(() => Promise.resolve()),
        on: vi.fn((event: string, handler: () => void) => {
            win.listeners[event] ??= [];
            win.listeners[event].push(handler);
        }),
    };
    return win;
}

function build(config: AppConfiguration, platform: "darwin" | "win32" | "linux" = "win32") {
    const state = { config };
    const windows: FakeWindow[] = [];
    const create_window = vi.fn(() => {
        const win = make_window();
        windows.push(win);
        return win;
    });
    const saved_configs: AppConfiguration[] = [];
    const deps: MainPanelControllerDeps = {
        platform,
        get_config: () => state.config,
        save_config: (next) => {
            saved_configs.push(next);
            state.config = next;
        },
        create_window,
        get_renderer_url: (route) => `app://${route}`,
        get_preload_path: () => "preload.js",
        get_app_icon_path: () => "icon.png",
        get_tray_bounds: () => ({ x: 1000, y: 700, width: 24, height: 24 }),
        get_display_for_bounds: () => ({
            id: 1,
            workArea: { x: 0, y: 0, width: 1280, height: 720 },
        }),
        get_all_displays: () => [{ id: 1, workArea: { x: 0, y: 0, width: 1280, height: 720 } }],
        get_primary_display: () => ({ id: 1, workArea: { x: 0, y: 0, width: 1280, height: 720 } }),
    };
    const controller = create_main_panel_controller(deps);
    return { controller, create_window, windows, saved_configs, state };
}

describe("main panel controller", () => {
    it("creates a popup shell on macOS system mode", () => {
        const { controller, create_window } = build(
            { ...base_config, mainPanelMode: "system" },
            "darwin",
        );
        controller.open_or_focus();
        expect(controller.get_mode()).toBe("popup");
        expect(create_window).toHaveBeenCalledTimes(1);
    });

    it("creates a floating shell on Windows system mode", () => {
        const { controller } = build({ ...base_config, mainPanelMode: "system" }, "win32");
        controller.open_or_focus();
        expect(controller.get_mode()).toBe("floating");
    });

    it("positions popup shell near the tray", () => {
        const { controller, windows } = build({ ...base_config, mainPanelMode: "popup" });
        controller.open_or_focus();
        const win = windows[0];
        expect(win?.setBounds).toHaveBeenCalledWith(
            expect.objectContaining({ x: 782, y: 240, width: 460, height: 480 }),
        );
    });

    it("hides popup shell from the Windows taskbar", () => {
        const { controller, windows } = build({ ...base_config, mainPanelMode: "popup" }, "win32");
        controller.open_or_focus();
        expect(windows[0]?.setSkipTaskbar).toHaveBeenCalledWith(true);
    });

    it("keeps floating shell in the Windows taskbar", () => {
        const { controller, windows } = build(
            { ...base_config, mainPanelMode: "floating" },
            "win32",
        );
        controller.open_or_focus();
        expect(windows[0]?.setSkipTaskbar).toHaveBeenCalledWith(false);
    });

    it("does not change taskbar visibility outside Windows", () => {
        const { controller, windows } = build({ ...base_config, mainPanelMode: "popup" }, "darwin");
        controller.open_or_focus();
        expect(windows[0]?.setSkipTaskbar).not.toHaveBeenCalled();
    });

    it("updates mode on config change even when the panel is closed", () => {
        const { controller, state } = build({ ...base_config, mainPanelMode: "popup" });
        expect(controller.get_mode()).toBe("popup");
        state.config = { ...state.config, mainPanelMode: "floating" };
        controller.apply_config_change();
        expect(controller.get_mode()).toBe("floating");
    });

    it("hides floating shell instead of destroying it", () => {
        const { controller, windows } = build({ ...base_config, mainPanelMode: "floating" });
        controller.open_or_focus();
        const win = windows[0];
        controller.hide();
        expect(win?.hide).toHaveBeenCalledTimes(1);
        expect(win?.destroy).not.toHaveBeenCalled();
        expect(win?.close).not.toHaveBeenCalled();
    });

    it("closes popup shell on hide", () => {
        const { controller, windows } = build({ ...base_config, mainPanelMode: "popup" });
        controller.open_or_focus();
        const win = windows[0];
        controller.hide();
        expect(win?.close).toHaveBeenCalledTimes(1);
    });

    it("ignores content height reports for fixed floating mode", () => {
        const { controller, windows } = build({
            ...base_config,
            mainPanelMode: "floating",
            floatingHeightMode: "fixed",
        });
        controller.open_or_focus();
        const win = windows[0];
        const out = controller.report_content_height({
            content_height: 600,
            collapsed_min_height: 200,
        });
        expect(out).toBeNull();
        expect(win?.setBounds).not.toHaveBeenCalledWith(expect.objectContaining({ height: 600 }));
    });

    it("applies content height reports for followContent floating mode", () => {
        const { controller, windows } = build({
            ...base_config,
            mainPanelMode: "floating",
            floatingHeightMode: "followContent",
        });
        controller.open_or_focus();
        const win = windows[0];
        const out = controller.report_content_height({
            content_height: 500,
            collapsed_min_height: 200,
        });
        expect(out).toBe(500);
        expect(win?.setBounds).toHaveBeenCalledWith(expect.objectContaining({ height: 500 }));
    });

    it("keeps floating followContent position when resizing from content", () => {
        const { controller, windows } = build({
            ...base_config,
            mainPanelMode: "floating",
            floatingHeightMode: "followContent",
            floatingBounds: { x: 200, y: 80, width: 460, height: 480, displayId: "1" },
        });
        controller.open_or_focus();
        const win = windows[0];
        win?.setBounds.mockClear();
        controller.report_content_height({
            content_height: 500,
            collapsed_min_height: 200,
        });
        expect(win?.setBounds).toHaveBeenCalledWith(
            expect.objectContaining({ x: 200, y: 80, height: 500 }),
        );
    });

    it("does not save floating bounds from controller-driven content resize", () => {
        const { controller, saved_configs } = build({
            ...base_config,
            mainPanelMode: "floating",
            floatingHeightMode: "followContent",
        });
        controller.open_or_focus();
        controller.report_content_height({
            content_height: 500,
            collapsed_min_height: 200,
        });
        expect(saved_configs).toEqual([]);
    });

    it("switches shell immediately when config changes", () => {
        const { controller, windows, state } = build({ ...base_config, mainPanelMode: "popup" });
        controller.open_or_focus();
        state.config = { ...state.config, mainPanelMode: "floating" };
        controller.apply_config_change();
        expect(windows[0]?.close).toHaveBeenCalled();
        expect(controller.get_mode()).toBe("floating");
        expect(windows[1]?.show).toHaveBeenCalled();
    });
});
