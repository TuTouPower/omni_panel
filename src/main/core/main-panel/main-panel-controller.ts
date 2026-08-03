import type { Rectangle } from "electron";
import { createLogger } from "../../../shared/lib/logger";
import type { AppConfiguration } from "../../../shared/types/config";
import type { PopupContentHeightReport } from "../../../shared/types/ipc";
import {
    create_popup_height_controller,
    type BoundsLike,
    type PopupHeightController,
} from "../popup/popup-height-controller";
import { resolve_floating_height_mode, resolve_main_panel_mode } from "./main-panel-config";
import { restore_floating_bounds } from "./floating-bounds";
import type {
    MainPanelController,
    MainPanelPlatform,
    MainPanelShellMode,
    WindowLike,
} from "./main-panel-types";

const log = createLogger("main-panel");
const MIN_PANEL_WIDTH = 472;

function clamp(value: number, lo: number, hi: number): number {
    if (hi < lo) return lo;
    if (value < lo) return lo;
    if (value > hi) return hi;
    return value;
}

interface DisplayLike {
    readonly id?: string | number;
    readonly workArea: Rectangle;
}

export interface MainPanelControllerDeps {
    readonly platform: MainPanelPlatform;
    readonly get_config: () => AppConfiguration;
    readonly save_config: (config: AppConfiguration) => void;
    readonly create_window: (mode: MainPanelShellMode) => WindowLike;
    readonly get_renderer_url: (route: string) => string;
    readonly get_preload_path: () => string;
    readonly get_app_icon_path: () => string;
    readonly get_tray_bounds: () => BoundsLike | null;
    readonly get_display_for_bounds: (bounds: BoundsLike) => DisplayLike;
    readonly get_all_displays: () => readonly DisplayLike[];
    readonly get_primary_display: () => DisplayLike;
}

export function create_main_panel_controller(deps: MainPanelControllerDeps): MainPanelController {
    let win: WindowLike | null = null;
    let mode: MainPanelShellMode = resolve_main_panel_mode(deps.get_config(), deps.platform);
    let height_controller: PopupHeightController | null = null;
    let suppress_bounds_save = 0;
    // t153: last pinToTop value applied to the window; apply_config_change
    // runs on every config save, so re-applying an unchanged value (a visible
    // flicker on Windows) must be skipped.
    let last_pin_to_top: boolean | null = null;

    const current_mode = () => resolve_main_panel_mode(deps.get_config(), deps.platform);

    function build_height_controller(target: WindowLike): PopupHeightController {
        return create_popup_height_controller({
            platform: deps.platform,
            get_window: () => {
                if (target.isDestroyed()) return null;
                return {
                    isDestroyed: () => target.isDestroyed(),
                    getBounds: () => target.getBounds(),
                    setBounds: (bounds) => {
                        suppress_bounds_save++;
                        target.setBounds(bounds);
                        setImmediate(() => {
                            suppress_bounds_save--;
                        });
                    },
                };
            },
            get_display_for_window: () => deps.get_display_for_bounds(target.getBounds()),
            get_anchor: () => ({
                tray_bounds: deps.get_tray_bounds(),
                user_moved: mode === "floating",
            }),
        });
    }

    function save_floating_bounds(target: WindowLike): void {
        if (mode !== "floating" || suppress_bounds_save > 0 || target.isDestroyed()) return;
        const bounds = target.getBounds();
        const display = deps.get_display_for_bounds(bounds);
        const display_id = display.id === undefined ? undefined : String(display.id);
        const floatingBounds = {
            x: bounds.x,
            y: bounds.y,
            width: clamp(bounds.width, MIN_PANEL_WIDTH, display.workArea.width),
            height: bounds.height,
        };
        deps.save_config({
            ...deps.get_config(),
            floatingBounds:
                display_id === undefined
                    ? floatingBounds
                    : { ...floatingBounds, displayId: display_id },
        });
    }

    function position_popup(target: WindowLike): void {
        const tray_bounds = deps.get_tray_bounds();
        if (!tray_bounds || tray_bounds.width <= 0 || tray_bounds.height <= 0) return;
        const current = target.getBounds();
        const display = deps.get_display_for_bounds(tray_bounds);
        const work = display.workArea;
        const x = Math.round(tray_bounds.x + tray_bounds.width / 2 - current.width / 2);
        const y = Math.round(tray_bounds.y + tray_bounds.height + 4);
        target.setBounds({
            x: clamp(x, work.x, work.x + work.width - current.width),
            y: clamp(y, work.y, work.y + work.height - current.height),
            width: current.width,
            height: current.height,
        });
    }

    function create_panel_window(next_mode: MainPanelShellMode): WindowLike {
        mode = next_mode;
        const target = deps.create_window(next_mode);
        void target.loadURL(deps.get_renderer_url("usage")).catch((error: unknown) => {
            log.error("Failed to load main panel", error);
        });
        last_pin_to_top = deps.get_config().pinToTop ?? false;
        target.setAlwaysOnTop(last_pin_to_top);
        if (deps.platform === "win32") {
            target.setSkipTaskbar(next_mode === "popup");
        }

        if (next_mode === "floating") {
            const tray_bounds = deps.get_tray_bounds();
            const display = tray_bounds
                ? deps.get_display_for_bounds(tray_bounds)
                : deps.get_primary_display();
            const bounds = restore_floating_bounds(
                deps.get_config().floatingBounds,
                deps.get_all_displays(),
                display,
            );
            const restored_display = deps.get_display_for_bounds(bounds);
            target.setBounds({
                ...bounds,
                width: clamp(bounds.width, MIN_PANEL_WIDTH, restored_display.workArea.width),
            });
            target.setMinimumSize(MIN_PANEL_WIDTH, 240);
            target.setResizable(true);
            target.on("resize", () => {
                save_floating_bounds(target);
            });
            target.on("move", () => {
                save_floating_bounds(target);
            });
        } else {
            position_popup(target);
            target.setMinimumSize(MIN_PANEL_WIDTH, 160);
            target.setResizable(true);
        }

        height_controller = build_height_controller(target);
        target.on("closed", () => {
            if (win === target) {
                win = null;
                height_controller = null;
            }
        });
        win = target;
        return target;
    }

    function ensure_window(): WindowLike {
        if (win && !win.isDestroyed() && mode === current_mode()) return win;
        if (win && !win.isDestroyed()) win.close();
        return create_panel_window(current_mode());
    }

    function show_panel(target: WindowLike): void {
        // t194 f001: popup 隐藏后重开要重新锚定到托盘（与 t194 前 close→重建每次
        // 重锚一致），否则托盘移动/显示器拓扑变化后旧 bounds 会偏。floating 保持
        // 用户拖放位置。create_panel_window 已定位，重复调用幂等。
        if (mode === "popup") {
            position_popup(target);
        }
        target.show();
        target.focus();
    }

    return {
        open_or_toggle() {
            const target = ensure_window();
            // t194: popup 与 floating 关闭/切换都改为隐藏——保留渲染进程与已加载
            // 数据，下次打开直接 show，消除冷启动重建。模式切换/退出仍走 close（AC4）。
            if (target.isVisible()) {
                target.hide();
                return;
            }
            show_panel(target);
        },
        open_or_focus() {
            show_panel(ensure_window());
        },
        hide() {
            if (!win || win.isDestroyed()) return;
            win.hide();
        },
        close_for_mode_switch() {
            if (win && !win.isDestroyed()) win.close();
            win = null;
            height_controller = null;
        },
        apply_config_change() {
            const next_mode = current_mode();
            if (!win || win.isDestroyed()) {
                mode = next_mode;
                return;
            }
            if (next_mode !== mode) {
                this.close_for_mode_switch();
                const target = create_panel_window(next_mode);
                target.show();
                target.focus();
                return;
            }
            const pin_to_top = deps.get_config().pinToTop ?? false;
            if (pin_to_top !== last_pin_to_top) {
                last_pin_to_top = pin_to_top;
                win.setAlwaysOnTop(pin_to_top);
            }
        },
        report_content_height(report: PopupContentHeightReport) {
            if (!win || win.isDestroyed() || !height_controller) return null;
            if (
                mode === "floating" &&
                resolve_floating_height_mode(deps.get_config()) === "fixed"
            ) {
                return null;
            }
            return height_controller.report_content_height(report);
        },
        get_window() {
            return win;
        },
        get_mode() {
            return mode;
        },
    };
}
