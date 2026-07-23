/**
 * Popup height controller (Phase 20).
 *
 * Pure logic for translating renderer-reported content heights into a
 * locked Electron BrowserWindow size. Kept platform/window-agnostic via
 * injected dependencies so it can be exercised by unit tests without
 * Electron.
 */

export const MAX_HEIGHT_RATIO = 1.0;
const HEIGHT_REPORT_DEBOUNCE_PX = 1;

export interface ContentHeightReport {
    /** Measured visible content height in CSS pixels (may be fractional). */
    readonly content_height: number;
    /** Measured min height when every collapsible card is collapsed. */
    readonly collapsed_min_height: number;
}

export interface WorkAreaLike {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface DisplayLike {
    readonly workArea: WorkAreaLike;
}

export interface BoundsLike {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export type PopupPlatform = "darwin" | "win32" | "linux";

export interface PopupWindowHandle {
    isDestroyed(): boolean;
    getBounds(): BoundsLike;
    setBounds(bounds: BoundsLike): void;
}

export interface PopupAnchorContext {
    /** Tray icon bounds, when known (macOS popover anchor, Win/Linux initial position). */
    readonly tray_bounds?: BoundsLike | null;
    /** Whether the user has moved the window since last open (Win/Linux only). */
    readonly user_moved?: boolean;
}

/**
 * Compute the locked window height from a content report and the target
 * display. Clamped to `[collapsed_min, floor(workArea.height * 0.75)]`.
 *
 * Content height is rounded up so sub-pixel content is never clipped.
 * Max height is rounded down so the popup never exceeds the 75% constraint.
 */
export function compute_target_height(report: ContentHeightReport, display: DisplayLike): number {
    const max_height = Math.floor(display.workArea.height * MAX_HEIGHT_RATIO);
    const min_height = Math.ceil(report.collapsed_min_height);
    const desired = Math.ceil(report.content_height);

    // When clamp bounds invert (min > max because work area is tiny),
    // honour the max — we must not exceed the 75% screen rule.
    if (min_height > max_height) return max_height;

    if (desired < min_height) return min_height;
    if (desired > max_height) return max_height;
    return desired;
}

/**
 * Returns true when the new report should trigger a window resize.
 * Suppresses sub-pixel jitter via `HEIGHT_REPORT_DEBOUNCE_PX`.
 */
export function should_apply_report(
    new_content_height: number,
    last_reported_height: number | null,
): boolean {
    if (last_reported_height === null) return true;
    return Math.abs(new_content_height - last_reported_height) > HEIGHT_REPORT_DEBOUNCE_PX;
}

/**
 * Compute new window bounds when applying a locked size. Width is preserved.
 *
 * macOS: re-anchors x under the tray icon centre and y just under the tray.
 * Windows/Linux: preserves the current (possibly user-moved) top-left.
 * Linux fallback: when tray bounds are unreliable, snaps to the display
 * work area bottom-right.
 */
export function apply_locked_size(
    current: BoundsLike,
    new_height: number,
    display: DisplayLike,
    platform: PopupPlatform,
    anchor: PopupAnchorContext,
): BoundsLike {
    const width = current.width;
    const work = display.workArea;

    if (platform === "darwin") {
        const tray = anchor.tray_bounds;
        if (tray) {
            const x = Math.round(tray.x + tray.width / 2 - width / 2);
            const y = Math.round(tray.y + tray.height + 4);
            return {
                x: clamp(x, work.x, work.x + work.width - width),
                y: clamp(y, work.y, work.y + work.height - new_height),
                width,
                height: new_height,
            };
        }
        // macOS without tray bounds: keep current x/y but clamp.
        return {
            x: clamp(current.x, work.x, work.x + work.width - width),
            y: clamp(current.y, work.y, work.y + work.height - new_height),
            width,
            height: new_height,
        };
    }

    // Windows / Linux: preserve current top-left if user has moved it,
    // or if there is no fresh tray anchor in play. Just clamp to display.
    if (anchor.user_moved) {
        return {
            x: clamp(current.x, work.x, work.x + work.width - width),
            y: clamp(current.y, work.y, work.y + work.height - new_height),
            width,
            height: new_height,
        };
    }

    // Even when user_moved is false on Windows/Linux, we must NOT
    // recompute y from the tray on every resize. The initial position
    // is set by the tray-click handler in index.ts; subsequent height
    // changes should preserve current.y so the window top stays fixed
    // and only the bottom edge moves (see Phase 20 Path B bug).
    const tray = anchor.tray_bounds;
    if (tray && tray.width > 0 && tray.height > 0) {
        const x = Math.round(tray.x + tray.width / 2 - width / 2);
        return {
            x: clamp(x, work.x, work.x + work.width - width),
            y: clamp(current.y, work.y, work.y + work.height - new_height),
            width,
            height: new_height,
        };
    }

    if (platform === "linux") {
        // Linux fallback: bottom-right of the work area.
        return {
            x: work.x + work.width - width,
            y: work.y + work.height - new_height,
            width,
            height: new_height,
        };
    }

    return {
        x: clamp(current.x, work.x, work.x + work.width - width),
        y: clamp(current.y, work.y, work.y + work.height - new_height),
        width,
        height: new_height,
    };
}

function clamp(value: number, lo: number, hi: number): number {
    if (hi < lo) return lo;
    if (value < lo) return lo;
    if (value > hi) return hi;
    return value;
}

export interface PopupHeightControllerOptions {
    readonly platform: PopupPlatform;
    readonly get_window: () => PopupWindowHandle | null;
    readonly get_display_for_window: (win: PopupWindowHandle) => DisplayLike;
    readonly get_anchor: () => PopupAnchorContext;
}

export interface PopupHeightController {
    /**
     * Handle a renderer-side content-height report. Returns the new locked
     * height when a resize was applied, otherwise null.
     */
    report_content_height(report: ContentHeightReport): number | null;
    /** Reset state, e.g. when the popup window is closed. */
    reset(): void;
    /** Test/diagnostic accessor. */
    last_applied_height(): number | null;
}

export function create_popup_height_controller(
    options: PopupHeightControllerOptions,
): PopupHeightController {
    let last_reported_height: number | null = null;
    let last_applied_height: number | null = null;

    return {
        report_content_height(report) {
            if (!should_apply_report(report.content_height, last_reported_height)) {
                return null;
            }
            last_reported_height = report.content_height;

            const win = options.get_window();
            if (!win || win.isDestroyed()) return null;

            const display = options.get_display_for_window(win);
            const target = compute_target_height(report, display);

            if (last_applied_height !== null && target === last_applied_height) {
                return null;
            }

            const current = win.getBounds();
            const next = apply_locked_size(
                current,
                target,
                display,
                options.platform,
                options.get_anchor(),
            );
            win.setBounds(next);
            last_applied_height = target;
            return target;
        },
        reset() {
            last_reported_height = null;
            last_applied_height = null;
        },
        last_applied_height() {
            return last_applied_height;
        },
    };
}
