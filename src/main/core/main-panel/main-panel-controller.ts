import type { BrowserWindow, Rectangle } from "electron";
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
} from "./main-panel-types";

const log = createLogger("main-panel");

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

type WindowLike = Pick<
    BrowserWindow,
    | "close"
    | "destroy"
    | "focus"
    | "getBounds"
    | "hide"
    | "isDestroyed"
    | "isVisible"
    | "loadURL"
    | "on"
    | "setAlwaysOnTop"
    | "setBounds"
    | "setMinimumSize"
    | "setResizable"
    | "show"
>;

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
    let suppress_bounds_save = false;

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
                        suppress_bounds_save = true;
                        target.setBounds(bounds);
                        setImmediate(() => {
                            suppress_bounds_save = false;
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
        if (mode !== "floating" || suppress_bounds_save || target.isDestroyed()) return;
        const bounds = target.getBounds();
        const display = deps.get_display_for_bounds(bounds);
        const display_id = display.id === undefined ? undefined : String(display.id);
        const floatingBounds = {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
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
        void target.loadURL(deps.get_renderer_url("popup")).catch((error: unknown) => {
            log.error("Failed to load main panel", error);
        });
        target.setAlwaysOnTop(deps.get_config().pinToTop ?? false);

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
            target.setBounds(bounds);
            target.setMinimumSize(320, 240);
            target.setResizable(true);
            target.on("resize", () => {
                save_floating_bounds(target);
            });
            target.on("move", () => {
                save_floating_bounds(target);
            });
        } else {
            position_popup(target);
            target.setResizable(false);
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

    return {
        open_or_toggle() {
            const target = ensure_window();
            if (mode === "floating" && target.isVisible()) {
                target.hide();
                return;
            }
            if (mode === "popup" && target.isVisible()) {
                target.close();
                return;
            }
            target.show();
            target.focus();
        },
        open_or_focus() {
            const target = ensure_window();
            target.show();
            target.focus();
        },
        hide() {
            if (!win || win.isDestroyed()) return;
            if (mode === "floating") {
                win.hide();
            } else {
                win.close();
            }
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
            win.setAlwaysOnTop(deps.get_config().pinToTop ?? false);
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
            return (win as unknown as BrowserWindow | null) ?? null;
        },
        get_mode() {
            return mode;
        },
    };
}
