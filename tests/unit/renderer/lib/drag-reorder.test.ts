import { describe, it, expect } from "vitest";
import { compute_drag_reorder } from "../../../../src/renderer/lib/drag-reorder";

const base = ["a", "b", "c", "d"] as const;

/** Rect helper: a card spanning [top, top+height] in viewport coords. */
function rect(top: number, height: number) {
    return { rect_top: top, rect_height: height };
}

describe("compute_drag_reorder", () => {
    it("returns null when dragging onto itself", () => {
        expect(compute_drag_reorder(base, "b", "b", { pointer_y: 0, ...rect(0, 100) })).toBeNull();
    });

    it("returns null when ids are not in the list", () => {
        expect(compute_drag_reorder(base, "x", "b", { pointer_y: 50, ...rect(0, 100) })).toBeNull();
    });

    it("moves down once pointer passes the target midpoint", () => {
        // drag "a" (index 0) over "c" (index 2), pointer below midpoint → commit
        expect(compute_drag_reorder(base, "a", "c", { pointer_y: 160, ...rect(100, 100) })).toEqual(
            ["b", "c", "a", "d"],
        );
    });

    it("does NOT move down while pointer is above the target midpoint (anti-flicker)", () => {
        // drag "a" over "c", pointer above midpoint → no move yet
        expect(
            compute_drag_reorder(base, "a", "c", { pointer_y: 120, ...rect(100, 100) }),
        ).toBeNull();
    });

    it("moves up once pointer passes the target midpoint", () => {
        // drag "d" (index 3) over "b" (index 1), pointer above midpoint → commit
        expect(compute_drag_reorder(base, "d", "b", { pointer_y: 120, ...rect(100, 100) })).toEqual(
            ["a", "d", "b", "c"],
        );
    });

    it("does NOT move up while pointer is below the target midpoint (anti-flicker)", () => {
        // drag "d" over "b", pointer below midpoint → no move yet
        expect(
            compute_drag_reorder(base, "d", "b", { pointer_y: 180, ...rect(100, 100) }),
        ).toBeNull();
    });

    it("prevents swap-back oscillation across a tall expanded card", () => {
        // Short card "a" dragged down across a tall card "b" (height 300).
        // After committing the move past midpoint, re-evaluating the new order
        // with the pointer still in the upper half must NOT swap back.
        const tall = rect(0, 300); // midpoint = 150
        const moved = compute_drag_reorder(base, "a", "b", { pointer_y: 200, ...tall });
        expect(moved).toEqual(["b", "a", "c", "d"]);
        if (!moved) throw new Error("expected a reordered result");
        // Now "a" is index 1, "b" is index 0; pointer drifts to upper half.
        // Dragging "a" over "b" again (now from > to) requires pointer above
        // midpoint; at y=200 (below midpoint) it stays put.
        expect(compute_drag_reorder(moved, "a", "b", { pointer_y: 200, ...tall })).toBeNull();
    });
});
