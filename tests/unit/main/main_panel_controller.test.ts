import { describe, expect, it, vi } from "vitest";
import { create_main_panel_controller } from "../../../src/main/core/main-panel/main-panel-controller";
import type { MainPanelControllerDeps } from "../../../src/main/core/main-panel/main-panel-controller";
import { WINDOW_CONFIGS } from "../../../src/main/window/window-manager";
import { USAGE_MIN_WIDTH } from "../../../src/main/window/window-bounds";
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
    setVisibleOnAllWorkspaces: ReturnType<typeof vi.fn>;
    showInactive: ReturnType<typeof vi.fn>;
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
        setVisibleOnAllWorkspaces: vi.fn(),
        showInactive: vi.fn(() => {
            win.visible = true;
        }),
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
        // NOTE: Tray.getBounds() returns zero bounds on Windows; production
        // code guards against this.  The test uses non-zero bounds to verify
        // normal popup positioning.
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

    it("creates a floating shell at the default 460 width on first open (t368 AC-001)", () => {
        const { controller, windows } = build(
            { ...base_config, mainPanelMode: "floating" },
            "win32",
        );
        controller.open_or_focus();
        // 首次无 saved floatingBounds——按 DEFAULT_FLOATING_WIDTH=460，不被抬升到 472。
        expect(windows[0]?.setBounds).toHaveBeenCalledWith(expect.objectContaining({ width: 460 }));
    });

    it("updates mode on config change even when the panel is closed", () => {
        const { controller, state } = build({ ...base_config, mainPanelMode: "popup" });
        expect(controller.get_mode()).toBe("popup");
        state.config = { ...state.config, mainPanelMode: "floating" };
        controller.apply_config_change();
        expect(controller.get_mode()).toBe("floating");
    });

    it("persists floating width above 780px within the display work area", () => {
        const { controller, saved_configs, windows } = build({
            ...base_config,
            mainPanelMode: "floating",
        });
        controller.open_or_focus();

        windows[0]?.setBounds({ width: 1200 });

        expect(saved_configs.at(-1)?.floatingBounds?.width).toBe(1200);
    });

    it("persists floating width in 320-472 range without clamping up (t368 AC-001)", () => {
        const { controller, saved_configs, windows } = build({
            ...base_config,
            mainPanelMode: "floating",
        });
        controller.open_or_focus();

        // saved 宽度 400（浮窗 320-472 区间）——按 MIN_FLOATING_WIDTH=320 clamp，不抬升。
        windows[0]?.setBounds({ width: 400 });

        expect(saved_configs.at(-1)?.floatingBounds?.width).toBe(400);
    });

    it("restores floating width above 780px after restart", () => {
        const { controller, windows } = build({
            ...base_config,
            mainPanelMode: "floating",
            floatingBounds: { x: 100, y: 80, width: 1200, height: 480, displayId: "1" },
        });
        controller.open_or_focus();

        expect(windows[0]?.setBounds).toHaveBeenCalledWith(
            expect.objectContaining({ width: 1200 }),
        );
    });

    it("does not configure a popup width cap", () => {
        expect(WINDOW_CONFIGS["usage"]?.maxWidth).toBeUndefined();
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

    // t194: popup 关闭改隐藏不销毁窗口（AC1）。旧行为「popup hide 走 close()」被
    // spec 变更取代，原「closes popup shell on hide」测试整体删除。
    it("hides popup shell instead of destroying it (AC1)", () => {
        const { controller, windows } = build({ ...base_config, mainPanelMode: "popup" });
        controller.open_or_focus();
        const win = windows[0];
        controller.hide();
        expect(win?.hide).toHaveBeenCalledTimes(1);
        expect(win?.close).not.toHaveBeenCalled();
        expect(win?.destroy).not.toHaveBeenCalled();
        expect(win?.isDestroyed()).toBe(false);
    });

    it("hides a visible popup on toggle instead of closing it (AC1)", () => {
        const { controller, windows } = build({ ...base_config, mainPanelMode: "popup" });
        controller.open_or_focus();
        const win = windows[0];
        controller.open_or_toggle();
        expect(win?.hide).toHaveBeenCalled();
        expect(win?.close).not.toHaveBeenCalled();
        expect(win?.isDestroyed()).toBe(false);
    });

    it("reopens a hidden popup by showing the same window without recreating it (AC1/AC2)", () => {
        const { controller, create_window, windows } = build({
            ...base_config,
            mainPanelMode: "popup",
        });
        controller.open_or_focus();
        const win = windows[0];
        controller.hide();
        expect(win?.isVisible()).toBe(false);

        controller.open_or_focus();
        expect(create_window).toHaveBeenCalledTimes(1);
        expect(windows[0]?.show).toHaveBeenCalledTimes(2);
        expect(windows[0]?.close).not.toHaveBeenCalled();
    });

    it("re-anchors a reopened popup to the tray (t194 code f001)", () => {
        const { controller, windows } = build({ ...base_config, mainPanelMode: "popup" });
        controller.open_or_focus();
        const win = windows[0];
        win?.setBounds.mockClear();
        controller.hide();

        controller.open_or_focus();
        // popup 重开重新定位到托盘下方，而非沿用隐藏时的旧 bounds。
        expect(win?.setBounds).toHaveBeenCalledWith(expect.objectContaining({ x: 782, y: 240 }));
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

    it("does not re-call setAlwaysOnTop when pinToTop is unchanged across config changes (t153)", () => {
        const { controller, windows } = build({ ...base_config, pinToTop: false });
        controller.open_or_focus();
        const win = windows[0];
        expect(win?.setAlwaysOnTop).toHaveBeenCalledTimes(1);

        controller.apply_config_change();
        controller.apply_config_change();

        expect(win?.setAlwaysOnTop).toHaveBeenCalledTimes(1);
    });

    it("re-applies setAlwaysOnTop when pinToTop actually changes", () => {
        const { controller, windows, state } = build({ ...base_config, pinToTop: false });
        controller.open_or_focus();
        const win = windows[0];

        state.config = { ...state.config, pinToTop: true };
        controller.apply_config_change();

        expect(win?.setAlwaysOnTop).toHaveBeenCalledTimes(2);
        expect(win?.setAlwaysOnTop).toHaveBeenLastCalledWith(true);
    });

    describe("usage popup width persistence (t495)", () => {
        it("saves width when user resizes popup and restores it on next show (AC-001)", () => {
            const { controller, windows, state } = build({
                ...base_config,
                mainPanelMode: "popup",
            });
            controller.open_or_focus();
            const win = windows[0];
            expect(win).toBeDefined();
            if (!win) return;

            // Simulate user resize to 600
            win.bounds = { ...win.bounds, width: 600 };
            for (const h of win.listeners["resize"] ?? []) h();
            expect(state.config.usagePopupWidth).toBe(600);

            // Hide and reopen
            controller.open_or_toggle(); // hide
            expect(win.hide).toHaveBeenCalled();
            controller.open_or_toggle(); // show
            expect(win.setBounds).toHaveBeenLastCalledWith(expect.objectContaining({ width: 600 }));
        });

        it("uses saved usagePopupWidth on initial open after restart (AC-002)", () => {
            const { controller, windows } = build({
                ...base_config,
                mainPanelMode: "popup",
                usagePopupWidth: 650,
            });
            controller.open_or_focus();
            expect(windows[0]?.setBounds).toHaveBeenCalledWith(
                expect.objectContaining({ width: 650 }),
            );
        });

        it("clamps saved and restored width to [USAGE_MIN_WIDTH, workArea.width] (AC-003)", () => {
            const { controller, windows, state } = build({
                ...base_config,
                mainPanelMode: "popup",
            });
            controller.open_or_focus();
            const win = windows[0];
            expect(win).toBeDefined();
            if (!win) return;

            // Resize smaller than USAGE_MIN_WIDTH (472)
            win.bounds = { ...win.bounds, width: 300 };
            for (const h of win.listeners["resize"] ?? []) h();
            expect(state.config.usagePopupWidth).toBe(USAGE_MIN_WIDTH);

            // Restore with width smaller than USAGE_MIN_WIDTH
            const { controller: c2, windows: w2 } = build({
                ...base_config,
                mainPanelMode: "popup",
                usagePopupWidth: 300,
            });
            c2.open_or_focus();
            expect(w2[0]?.setBounds).toHaveBeenCalledWith(
                expect.objectContaining({ width: USAGE_MIN_WIDTH }),
            );
        });

        it("clamps restored width to display workArea.width when exceeding screen (AC-004)", () => {
            const { controller, windows } = build({
                ...base_config,
                mainPanelMode: "popup",
                usagePopupWidth: 2000,
            });
            controller.open_or_focus();
            // display workArea.width is 1280 in mock
            expect(windows[0]?.setBounds).toHaveBeenCalledWith(
                expect.objectContaining({ width: 1280, x: 0 }),
            );
        });

        it("falls back to default width when usagePopupWidth is not set (AC-005)", () => {
            const { controller, windows } = build({
                ...base_config,
                mainPanelMode: "popup",
            });
            controller.open_or_focus();
            expect(windows[0]?.setBounds).toHaveBeenCalledWith(
                expect.objectContaining({ width: 460 }), // default in mock
            );
        });
    });

    describe("macOS popup above fullscreen apps (t497/t503/p253)", () => {
        it("AC-001~AC-003: calls setVisibleOnAllWorkspaces with visibleOnFullScreen and skipTransformProcessType on macOS", () => {
            const { controller, windows } = build(
                { ...base_config, mainPanelMode: "system" },
                "darwin",
            );
            controller.open_or_focus();
            const win = windows[0];
            // t503/p253: 创建期声明一次，展示期重申一次（跟到当前 Space）。
            expect(win?.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, {
                visibleOnFullScreen: true,
                skipTransformProcessType: true,
            });
            expect(win?.setVisibleOnAllWorkspaces.mock.calls.length).toBeGreaterThanOrEqual(2);
        });

        it("AC-002: shows window via showInactive on macOS without calling focus", () => {
            const { controller, windows } = build(
                { ...base_config, mainPanelMode: "system" },
                "darwin",
            );
            controller.open_or_focus();
            const win = windows[0];
            expect(win?.showInactive).toHaveBeenCalledTimes(1);
            expect(win?.show).not.toHaveBeenCalled();
            expect(win?.focus).not.toHaveBeenCalled();
        });

        it("AC-005: elevates to floating while shown and restores pinToTop on hide (t503)", () => {
            const { controller, windows } = build(
                { ...base_config, mainPanelMode: "system", pinToTop: false },
                "darwin",
            );
            controller.open_or_focus();
            const win = windows[0];
            // 展示期提权盖全屏（与 pinToTop 解耦）。
            expect(win?.setAlwaysOnTop).toHaveBeenLastCalledWith(true, "floating");

            controller.open_or_toggle(); // hide
            expect(win?.isVisible()).toBe(false);
            // 隐藏后按 pinToTop 恢复，不残留置顶。
            expect(win?.setAlwaysOnTop).toHaveBeenLastCalledWith(false, "floating");
        });

        it("t503: re-elevates on every show and restores latest pinToTop after mid-show config change", () => {
            const { controller, windows, state } = build(
                { ...base_config, mainPanelMode: "system", pinToTop: false },
                "darwin",
            );
            controller.open_or_focus();
            const win = windows[0];
            controller.open_or_toggle(); // hide → restore false
            expect(win?.setAlwaysOnTop).toHaveBeenLastCalledWith(false, "floating");

            controller.open_or_toggle(); // show → re-elevate (p253: 跟到当前 Space)
            expect(win?.setAlwaysOnTop).toHaveBeenLastCalledWith(true, "floating");
            expect(win?.setVisibleOnAllWorkspaces.mock.calls.length).toBeGreaterThanOrEqual(3);

            // 展示中途改 pinToTop：展示期保持提权，只更新基线。
            state.config = { ...state.config, pinToTop: true };
            controller.apply_config_change();
            expect(win?.setAlwaysOnTop).toHaveBeenLastCalledWith(true, "floating");

            // 隐藏后按最新 pinToTop 恢复。
            controller.hide();
            expect(win?.setAlwaysOnTop).toHaveBeenLastCalledWith(true, "floating");
        });

        it("AC-006: Windows does not call setVisibleOnAllWorkspaces, and uses show() + focus() with boolean setAlwaysOnTop", () => {
            const { controller, windows, state } = build(
                { ...base_config, mainPanelMode: "system", pinToTop: false },
                "win32",
            );
            controller.open_or_focus();
            const win = windows[0];
            expect(win?.setVisibleOnAllWorkspaces).not.toHaveBeenCalled();
            expect(win?.show).toHaveBeenCalledTimes(1);
            expect(win?.focus).toHaveBeenCalledTimes(1);
            expect(win?.showInactive).not.toHaveBeenCalled();
            expect(win?.setAlwaysOnTop).toHaveBeenLastCalledWith(false);

            state.config = { ...state.config, pinToTop: true };
            controller.apply_config_change();
            expect(win?.setAlwaysOnTop).toHaveBeenLastCalledWith(true);
        });
    });

    describe("popup bounds persistence and content height behavior (p247)", () => {
        it("persists popup width and height on resize in popup mode without persisting position", () => {
            const { controller, windows, saved_configs } = build(
                { ...base_config, mainPanelMode: "popup" },
                "darwin",
            );
            controller.open_or_focus();
            const win = windows[0];
            if (!win) throw new Error("window missing");

            // 模拟 resize 到 600x650（mock workArea 高度为 720）
            win.bounds = { ...win.bounds, width: 600, height: 650 };
            for (const fn of win.listeners["resize"] ?? []) fn();

            const last_config = saved_configs[saved_configs.length - 1];
            expect(last_config?.usagePopupWidth).toBe(600);
            expect(last_config?.usagePopupHeight).toBe(650);
        });

        it("restores popup width and height from config on open while anchoring to tray", () => {
            const { controller, windows } = build(
                {
                    ...base_config,
                    mainPanelMode: "popup",
                    usagePopupWidth: 550,
                    usagePopupHeight: 500,
                },
                "darwin",
            );
            controller.open_or_focus();
            const win = windows[0];
            if (!win) throw new Error("window missing");
            expect(win.setBounds).toHaveBeenCalledWith(
                expect.objectContaining({
                    width: 550,
                    height: 500,
                }),
            );
        });

        it("keeps user resized height when content reports smaller height (e.g. switching tabs)", () => {
            const { controller, windows } = build(
                {
                    ...base_config,
                    mainPanelMode: "popup",
                    usagePopupWidth: 500,
                    usagePopupHeight: 650,
                },
                "darwin",
            );
            controller.open_or_focus();
            const win = windows[0];
            if (!win) throw new Error("window missing");

            // 模拟 DeepSeek 页签上报较矮的内容高度 280
            const applied = controller.report_content_height({
                content_height: 280,
                collapsed_min_height: 150,
            });

            // 窗口高度应维持用户设定的 650，而不是被压扁成 280
            expect(applied).toBe(650);
            expect(win.setBounds).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    height: 650,
                }),
            );
        });
    });
});
