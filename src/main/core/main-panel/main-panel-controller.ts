import type { Rectangle } from "electron";
import { createLogger } from "../../../shared/lib/logger";
import { is_e2e_headless } from "../../e2e-headless";
import type { AppConfiguration } from "../../../shared/types/config";
import type { PopupContentHeightReport } from "../../../shared/types/ipc";
import {
    create_popup_height_controller,
    type BoundsLike,
    type PopupHeightController,
} from "../popup/popup-height-controller";
import { resolve_floating_height_mode, resolve_main_panel_mode } from "./main-panel-config";
import { restore_floating_bounds, MIN_FLOATING_WIDTH } from "./floating-bounds";
import { USAGE_MIN_WIDTH } from "../../window/window-bounds";
import type {
    MainPanelController,
    MainPanelPlatform,
    MainPanelShellMode,
    WindowLike,
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
    readonly on_show?: () => void;
}

export function create_main_panel_controller(deps: MainPanelControllerDeps): MainPanelController {
    let win: WindowLike | null = null;
    let mode: MainPanelShellMode = resolve_main_panel_mode(deps.get_config(), deps.platform);
    let height_controller: PopupHeightController | null = null;
    // t368 范围项 4: 每次 setBounds 用唯一 token 只清自己抑制位（原共享计数器 + setImmediate
    // 递减，多 setBounds 并发时可能过早归零、吞掉真实位置保存）。
    const suppress_tokens = new Set<number>();
    let suppress_bounds_token = 0;
    // t153: last pinToTop value applied to the window; apply_config_change
    // runs on every config save, so re-applying an unchanged value (a visible
    // flicker on Windows) must be skipped.
    let last_pin_to_top: boolean | null = null;
    // t503/p253: darwin 展示期提权状态。创建/隐藏时窗口回到用户 pinToTop 基线
    // （默认 false = normal，盖不住全屏）；展示时临时提权到 floating 盖全屏，
    // 并重申 setVisibleOnAllWorkspaces 使窗口跟到当前 Space（p253：A 全屏切 B
    // 再点仍粘 A）。非 darwin 恒 false。
    let elevated = false;

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
                        const token = ++suppress_bounds_token;
                        suppress_tokens.add(token);
                        target.setBounds(bounds);
                        setImmediate(() => {
                            // 只删自己 token——期间更晚的 setBounds 仍在抑制，不误归零。
                            suppress_tokens.delete(token);
                        });
                    },
                };
            },
            get_display_for_window: () => deps.get_display_for_bounds(target.getBounds()),
            get_anchor: () => ({
                tray_bounds: deps.get_tray_bounds(),
                user_moved: mode === "floating",
            }),
            get_min_preferred_height: () => {
                if (mode === "floating") return undefined;
                return deps.get_config().usagePopupHeight;
            },
        });
    }

    function save_floating_bounds(target: WindowLike): void {
        if (mode !== "floating" || suppress_tokens.size > 0 || target.isDestroyed()) return;
        const bounds = target.getBounds();
        const display = deps.get_display_for_bounds(bounds);
        const display_id = display.id === undefined ? undefined : String(display.id);
        const floatingBounds = {
            x: bounds.x,
            y: bounds.y,
            // t368 AC-001: 浮窗宽度按浮窗语义 clamp（MIN_FLOATING_WIDTH=320），
            // 不用主面板 USAGE_MIN_WIDTH=472（否则首次默认 460 被静默抬升）。
            width: clamp(bounds.width, MIN_FLOATING_WIDTH, display.workArea.width),
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

    function save_popup_bounds(target: WindowLike): void {
        if (mode !== "popup" || suppress_tokens.size > 0 || target.isDestroyed()) return;
        const bounds = target.getBounds();
        const display = deps.get_display_for_bounds(bounds);
        const width = clamp(bounds.width, USAGE_MIN_WIDTH, display.workArea.width);
        const height = clamp(bounds.height, 160, display.workArea.height);
        const config = deps.get_config();
        if (config.usagePopupWidth === width && config.usagePopupHeight === height) {
            return;
        }
        deps.save_config({
            ...config,
            usagePopupWidth: width,
            usagePopupHeight: height,
        });
    }

    function position_popup(target: WindowLike): void {
        const tray_bounds = deps.get_tray_bounds();
        if (!tray_bounds || tray_bounds.width <= 0 || tray_bounds.height <= 0) return;
        const config = deps.get_config();
        const current = target.getBounds();
        const display = deps.get_display_for_bounds(tray_bounds);
        const work = display.workArea;

        const saved_width = config.usagePopupWidth;
        const saved_height = config.usagePopupHeight;
        const width =
            saved_width !== undefined
                ? clamp(saved_width, USAGE_MIN_WIDTH, work.width)
                : current.width;
        const height =
            saved_height !== undefined ? clamp(saved_height, 160, work.height) : current.height;

        const x = Math.round(tray_bounds.x + tray_bounds.width / 2 - width / 2);
        const y = Math.round(tray_bounds.y + tray_bounds.height + 4);
        const token = ++suppress_bounds_token;
        suppress_tokens.add(token);
        try {
            target.setBounds({
                x: clamp(x, work.x, work.x + work.width - width),
                y: clamp(y, work.y, work.y + work.height - height),
                width,
                height,
            });
        } finally {
            suppress_tokens.delete(token);
        }
    }

    function create_panel_window(next_mode: MainPanelShellMode): WindowLike {
        mode = next_mode;
        elevated = false;
        const target = deps.create_window(next_mode);
        void target.loadURL(deps.get_renderer_url("usage")).catch((error: unknown) => {
            log.error("Failed to load main panel", error);
        });
        last_pin_to_top = deps.get_config().pinToTop ?? false;
        // t497: macOS 下使用量弹窗在所有空间及全屏应用之上可见（创建期声明）。
        // t503: 创建期只落用户 pinToTop 基线；展示期由 elevate_for_show 提权到
        // floating 盖全屏，隐藏由 restore_after_hide 恢复。Windows/Linux 不变。
        if (deps.platform === "darwin") {
            target.setVisibleOnAllWorkspaces(true, {
                visibleOnFullScreen: true,
                skipTransformProcessType: true,
            });
            target.setAlwaysOnTop(last_pin_to_top, "floating");
        } else {
            target.setAlwaysOnTop(last_pin_to_top);
        }
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
            // t368 AC-001: 先 setMinimumSize 再 setBounds——否则创建瞬间 BrowserWindow
            // minWidth（window-manager usage=472）会把首次 460 抬升。
            target.setMinimumSize(MIN_FLOATING_WIDTH, 240);
            target.setBounds({
                ...bounds,
                // 浮窗恢复宽度按浮窗语义 clamp（MIN_FLOATING_WIDTH=320），首次默认
                // 460 不被抬升到主面板 USAGE_MIN_WIDTH=472。
                width: clamp(bounds.width, MIN_FLOATING_WIDTH, restored_display.workArea.width),
            });
            target.setResizable(true);
            target.on("resize", () => {
                save_floating_bounds(target);
            });
            target.on("move", () => {
                save_floating_bounds(target);
            });
        } else {
            // t495 & p247: 先设最小宽高，若有保存的 usagePopupWidth/usagePopupHeight 则预设 target bounds，
            // 确保无 tray_bounds 场景下也能恢复尺寸；position_popup 时再按工作区 clamp 定位。
            target.setMinimumSize(USAGE_MIN_WIDTH, 160);
            const saved_width = deps.get_config().usagePopupWidth;
            const saved_height = deps.get_config().usagePopupHeight;
            if (saved_width !== undefined || saved_height !== undefined) {
                const current = target.getBounds();
                const display = deps.get_display_for_bounds(current);
                const width =
                    saved_width !== undefined
                        ? clamp(saved_width, USAGE_MIN_WIDTH, display.workArea.width)
                        : current.width;
                const height =
                    saved_height !== undefined
                        ? clamp(saved_height, 160, display.workArea.height)
                        : current.height;
                target.setBounds({ ...current, width, height });
            }
            position_popup(target);
            target.setResizable(true);
            target.on("resize", () => {
                save_popup_bounds(target);
            });
        }

        height_controller = build_height_controller(target);
        target.on("closed", () => {
            if (win === target) {
                win = null;
                elevated = false;
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

    // t503 AC-001: darwin 展示期提权——floating 盖全屏 Space；重申
    // setVisibleOnAllWorkspaces 使窗口跟到当前 Space（p253 跨 Space 粘滞）。
    function elevate_for_show(target: WindowLike): void {
        if (deps.platform !== "darwin" || target.isDestroyed()) return;
        target.setVisibleOnAllWorkspaces(true, {
            visibleOnFullScreen: true,
            skipTransformProcessType: true,
        });
        target.setAlwaysOnTop(true, "floating");
        if (target === win) elevated = true;
    }

    // t503 AC-001: 隐藏后按用户 pinToTop 恢复，不残留置顶。
    function restore_after_hide(target: WindowLike): void {
        if (deps.platform !== "darwin" || target.isDestroyed()) return;
        if (target !== win) return;
        elevated = false;
        const pin_to_top = deps.get_config().pinToTop ?? false;
        last_pin_to_top = pin_to_top;
        target.setAlwaysOnTop(pin_to_top, "floating");
    }

    function show_panel(target: WindowLike): void {
        // t194 f001: popup 隐藏后重开要重新锚定到托盘（与 t194 前 close→重建每次
        // 重锚一致），否则托盘移动/显示器拓扑变化后旧 bounds 会偏。floating 保持
        // 用户拖放位置。create_panel_window 已定位，重复调用幂等。
        if (mode === "popup") {
            position_popup(target);
        }
        // t503/p253: 先提权再显示，保证盖住当前全屏 Space 且跟到当前 Space。
        elevate_for_show(target);
        // t280: headless 下不弹屏。
        // t497 AC-002: macOS 下用量弹窗使用 showInactive 显示且不抢焦点，
        // 避免把全屏应用切出或打断用户操作；Windows/Linux 保持既有 show() + focus()。
        if (!is_e2e_headless()) {
            if (deps.platform === "darwin") {
                target.showInactive();
            } else {
                target.show();
            }
        }
        if (deps.platform !== "darwin") {
            target.focus();
        }
        deps.on_show?.();
    }

    return {
        open_or_toggle() {
            const target = ensure_window();
            // t194: popup 与 floating 关闭/切换都改为隐藏——保留渲染进程与已加载
            // 数据，下次打开直接 show，消除冷启动重建。模式切换/退出仍走 close（AC4）。
            if (target.isVisible()) {
                target.hide();
                // t503 AC-001: 隐藏后按 pinToTop 恢复，不残留置顶。
                restore_after_hide(target);
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
            // t503 AC-001: 隐藏后按 pinToTop 恢复，不残留置顶。
            restore_after_hide(win);
        },
        close_for_mode_switch() {
            if (win && !win.isDestroyed()) win.close();
            win = null;
            elevated = false;
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
                if (!is_e2e_headless()) {
                    // t503: 重建后展示同样提权（show_panel 外的展示路径）。
                    elevate_for_show(target);
                    if (deps.platform === "darwin") {
                        target.showInactive();
                    } else {
                        target.show();
                    }
                }
                if (deps.platform !== "darwin") {
                    target.focus();
                }
                return;
            }
            // t503: darwin 展示期保持提权，只更新基线供隐藏时恢复；隐藏时按
            // 最新 pinToTop 落实。非 darwin 保持 t153 原语义（变才重调）。
            const pin_to_top = deps.get_config().pinToTop ?? false;
            const was_pin = last_pin_to_top;
            last_pin_to_top = pin_to_top;
            if (deps.platform === "darwin") {
                if (win.isVisible()) {
                    if (!elevated) elevate_for_show(win);
                    return;
                }
                if (elevated) {
                    restore_after_hide(win);
                    return;
                }
                if (pin_to_top !== was_pin) {
                    win.setAlwaysOnTop(pin_to_top, "floating");
                }
                return;
            }
            if (pin_to_top !== was_pin) {
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
