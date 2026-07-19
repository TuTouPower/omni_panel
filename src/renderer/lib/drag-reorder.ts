export interface DragMidpoint {
    /** Pointer Y in viewport coords (DragEvent.clientY). */
    pointer_y: number;
    /** Top edge of the hovered card in viewport coords. */
    rect_top: number;
    /** Height of the hovered card. */
    rect_height: number;
    /** Pointer X in viewport coords (DragEvent.clientX). Required for `axis="x"`. */
    pointer_x?: number;
    /** Left edge of the hovered card. Required for `axis="x"`. */
    rect_left?: number;
    /** Width of the hovered card. Required for `axis="x"`. */
    rect_width?: number;
}

/**
 * Compute a reordered list when `drag_id` is dragged over `over_id`.
 * Returns the new order, or null when no move should happen.
 *
 * Direction-aware midpoint guard prevents swap-back flicker. `axis` selects
 * which axis the guard applies to: `"y"` (default, single-column vertical
 * list — original behavior) or `"x"` (multi-column same-row horizontal drag,
 * introduced by T004 D2=B). Caller decides axis by comparing drag-card and
 * over-card rects (same row → `"x"`, same column → `"y"`).
 */
export function compute_drag_reorder<T>(
    base: readonly T[],
    drag_id: T,
    over_id: T,
    midpoint: DragMidpoint,
    axis: "x" | "y" = "y",
): T[] | null {
    if (drag_id === over_id) return null;
    const from = base.indexOf(drag_id);
    const to = base.indexOf(over_id);
    if (from < 0 || to < 0) return null;
    if (axis === "x") {
        const left = midpoint.rect_left ?? 0;
        const width = midpoint.rect_width ?? 0;
        const middle_x = left + width / 2;
        const pointer_x = midpoint.pointer_x ?? 0;
        if (from < to && pointer_x < middle_x) return null;
        if (from > to && pointer_x > middle_x) return null;
    } else {
        const middle = midpoint.rect_top + midpoint.rect_height / 2;
        if (from < to && midpoint.pointer_y < middle) return null;
        if (from > to && midpoint.pointer_y > middle) return null;
    }
    const next = [...base];
    next.splice(from, 1);
    next.splice(to, 0, drag_id);
    return next;
}

/**
 * Build the working order for a drag reorder.
 *
 * `persisted` is the saved order (may be incomplete — e.g. a provider added
 * after the order was last saved is absent). `visible` is the full set of
 * currently rendered items in display order. The result keeps the persisted
 * order for known items and appends any visible items missing from it, so
 * every on-screen item is present and reorderable.
 */
export function build_reorder_base<T>(persisted: readonly T[], visible: readonly T[]): T[] {
    const source = persisted.length > 0 ? persisted : visible;
    const visible_set = new Set(visible);
    const ordered = source.filter((item) => visible_set.has(item));
    const ordered_set = new Set(ordered);
    const remaining = visible.filter((item) => !ordered_set.has(item));
    return [...ordered, ...remaining];
}
