/**
 * 会话/代理面板窗口 bounds 保存与恢复（t251）。
 *
 * 复用设置窗口先例（index.ts save_settings_bounds / apply_settings_bounds）：
 * - 保存：move/resize 时记录 bounds + displayId + 最小尺寸钳制，经 configStore.scheduleSave 落盘。
 * - 恢复：displayId 失效回退主屏；目标尺寸钳制到 workArea；负坐标/超界钳制回可见区域。
 */
import type { BrowserWindow } from "electron";
import { screen } from "electron";
import type { AppConfiguration } from "../../shared/types/config";
import { createLogger } from "../../shared/lib/logger";

const log = createLogger("window-bounds");

/** 各面板窗口的最小尺寸（与设置窗口 480x360 对齐语义，按窗口各自配置取）。 */
export const PANEL_MIN_WIDTH = 480;
export const PANEL_MIN_HEIGHT = 360;

export type BoundsSaver = (key: keyof AppConfiguration, value: unknown) => void;

export interface PanelBounds {
    x: number;
    y: number;
    width: number;
    height: number;
    displayId?: string;
}

/** 从配置取保存的 bounds；无则返回 null。 */
export function get_saved_bounds(
    config: AppConfiguration | null | undefined,
    key: keyof AppConfiguration,
): PanelBounds | null {
    const saved = config?.[key];
    if (
        !saved ||
        typeof saved !== "object" ||
        !("x" in saved) ||
        !("y" in saved) ||
        !("width" in saved) ||
        !("height" in saved)
    ) {
        return null;
    }
    const s = saved as { x: number; y: number; width: number; height: number; displayId?: string };
    return s.displayId !== undefined
        ? { x: s.x, y: s.y, width: s.width, height: s.height, displayId: s.displayId }
        : { x: s.x, y: s.y, width: s.width, height: s.height };
}

interface DisplayLike {
    readonly id: number;
    readonly workArea: { x: number; y: number; width: number; height: number };
}

/**
 * 钳制保存的 bounds 到目标显示器 workArea 内（纯函数，t251 可单测）。
 * displayId 失效回退主屏；尺寸钳制到 workArea；负坐标/超界钳制回可见区域。
 */
export function compute_clamped_bounds(
    saved: PanelBounds,
    displays: readonly DisplayLike[],
    preferred: DisplayLike,
): { x: number; y: number; width: number; height: number } {
    const target_display = saved.displayId
        ? (displays.find((d) => String(d.id) === saved.displayId) ?? preferred)
        : preferred;
    const work = target_display.workArea;
    const width = Math.min(Math.max(PANEL_MIN_WIDTH, saved.width), work.width);
    const height = Math.min(Math.max(PANEL_MIN_HEIGHT, saved.height), work.height);
    const x = Math.max(work.x, Math.min(saved.x, work.x + work.width - width));
    const y = Math.max(work.y, Math.min(saved.y, work.y + work.height - height));
    return { x, y, width, height };
}

/** 恢复 bounds 到窗口；无保存值时返回 false（调用方按默认居中）。 */
export function apply_window_bounds(win: BrowserWindow, saved: PanelBounds | null): boolean {
    if (!saved) return false;
    const displays = screen.getAllDisplays();
    const preferred = screen.getPrimaryDisplay();
    const clamped = compute_clamped_bounds(saved, displays, preferred);
    win.setBounds(clamped);
    return true;
}

/** 注册窗口 move/resize 保存 bounds 到 config（经 saver 写回 + scheduleSave）。 */
export function watch_window_bounds(
    win: BrowserWindow,
    key: keyof AppConfiguration,
    saver: BoundsSaver,
): void {
    let last_saved = "";

    const save = (): void => {
        if (win.isDestroyed()) return;
        if (win.isMinimized() || win.isMaximized()) return;
        const bounds = win.getBounds();
        const display = screen.getDisplayMatching(bounds);
        const payload = {
            x: bounds.x,
            y: bounds.y,
            width: Math.max(PANEL_MIN_WIDTH, bounds.width),
            height: Math.max(PANEL_MIN_HEIGHT, bounds.height),
            displayId: String(display.id),
        };
        // 值未变（同一 bounds 重复 move 事件）跳过，防 config 写放大。
        const sig = JSON.stringify(payload);
        if (sig === last_saved) return;
        last_saved = sig;
        saver(key, payload);
    };

    win.on("resize", save);
    win.on("move", save);
    log.debug(`window ${key} bounds watch registered`);
}
