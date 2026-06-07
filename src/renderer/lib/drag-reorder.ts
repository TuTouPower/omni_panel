export interface DragMidpoint {
    /** Pointer Y in viewport coords (DragEvent.clientY). */
    pointer_y: number;
    /** Top edge of the hovered card in viewport coords. */
    rect_top: number;
    /** Height of the hovered card. */
    rect_height: number;
}

/**
 * Compute a reordered list when `drag_id` is dragged over `over_id`.
 * Returns the new order, or null when no move should happen.
 *
 * Direction-aware midpoint guard: dragging downward only commits the move
 * once the pointer passes the target's vertical midpoint, and vice versa.
 * Without this guard, dragging a short card across a tall (expanded) card
 * swaps on entry, the layout shift re-enters the target, and it swaps back —
 * an oscillation that shows as flicker.
 */
export function compute_drag_reorder<T>(
    base: readonly T[],
    drag_id: T,
    over_id: T,
    midpoint: DragMidpoint,
): T[] | null {
    if (drag_id === over_id) return null;
    const from = base.indexOf(drag_id);
    const to = base.indexOf(over_id);
    if (from < 0 || to < 0) return null;
    const middle = midpoint.rect_top + midpoint.rect_height / 2;
    if (from < to && midpoint.pointer_y < middle) return null;
    if (from > to && midpoint.pointer_y > middle) return null;
    const next = [...base];
    next.splice(from, 1);
    next.splice(to, 0, drag_id);
    return next;
}
