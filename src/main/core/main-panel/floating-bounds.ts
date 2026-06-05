import type { FloatingBoundsConfiguration } from "../../../shared/types/config";

export const DEFAULT_FLOATING_WIDTH = 460;
export const DEFAULT_FLOATING_HEIGHT = 720;
export const MIN_FLOATING_WIDTH = 320;
export const MIN_FLOATING_HEIGHT = 240;

interface DisplayLike {
    readonly id?: string | number;
    readonly workArea: { x: number; y: number; width: number; height: number };
}

function clamp(value: number, lo: number, hi: number): number {
    if (hi < lo) return lo;
    if (value < lo) return lo;
    if (value > hi) return hi;
    return value;
}

function display_id(display: DisplayLike): string | undefined {
    return display.id === undefined ? undefined : String(display.id);
}

export function default_floating_bounds(display: DisplayLike): FloatingBoundsConfiguration {
    const work = display.workArea;
    const width = Math.min(DEFAULT_FLOATING_WIDTH, work.width);
    const height = Math.min(DEFAULT_FLOATING_HEIGHT, work.height);
    const bounds = {
        x: work.x + work.width - width,
        y: work.y + work.height - height,
        width,
        height,
    };
    const id = display_id(display);
    return id === undefined ? bounds : { ...bounds, displayId: id };
}

export function clamp_floating_bounds_to_display(
    bounds: FloatingBoundsConfiguration,
    display: DisplayLike,
): FloatingBoundsConfiguration {
    const work = display.workArea;
    const width = clamp(Math.round(bounds.width), MIN_FLOATING_WIDTH, work.width);
    const height = clamp(Math.round(bounds.height), MIN_FLOATING_HEIGHT, work.height);
    const x = clamp(Math.round(bounds.x), work.x, work.x + work.width - width);
    const y = clamp(Math.round(bounds.y), work.y, work.y + work.height - height);
    const bounds_out = {
        x,
        y,
        width,
        height,
    };
    const id = display_id(display);
    return id === undefined ? bounds_out : { ...bounds_out, displayId: id };
}

export function restore_floating_bounds(
    saved: FloatingBoundsConfiguration | undefined,
    displays: readonly DisplayLike[],
    preferred: DisplayLike,
): FloatingBoundsConfiguration {
    if (!saved) return default_floating_bounds(preferred);
    const saved_display = saved.displayId
        ? displays.find((display) => display_id(display) === saved.displayId)
        : undefined;
    return clamp_floating_bounds_to_display(saved, saved_display ?? preferred);
}
