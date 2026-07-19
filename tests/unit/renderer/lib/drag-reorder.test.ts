import { describe, it, expect } from "vitest";
import {
    compute_drag_reorder,
    build_reorder_base,
} from "../../../../src/renderer/lib/drag-reorder";

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

    it("moves right once pointer passes the target horizontal midpoint (multicolumn x-axis)", () => {
        // 2-column grid, "a"(0) and "b"(1) share a row. Drag "a" right onto "b";
        // commit only once pointer crosses "b"'s horizontal midpoint.
        expect(
            compute_drag_reorder(
                base,
                "a",
                "b",
                {
                    pointer_y: 50,
                    rect_top: 0,
                    rect_height: 100,
                    pointer_x: 160,
                    rect_left: 100,
                    rect_width: 100,
                },
                "x",
            ),
        ).toEqual(["b", "a", "c", "d"]);
    });

    it("does NOT move right while pointer is left of the target horizontal midpoint", () => {
        expect(
            compute_drag_reorder(
                base,
                "a",
                "b",
                {
                    pointer_y: 50,
                    rect_top: 0,
                    rect_height: 100,
                    pointer_x: 120,
                    rect_left: 100,
                    rect_width: 100,
                },
                "x",
            ),
        ).toBeNull();
    });

    it("moves left once pointer passes the target horizontal midpoint (multicolumn x-axis)", () => {
        // Drag "d"(3) left onto "c"(2); commit once pointer crosses "c"'s horizontal midpoint leftward.
        expect(
            compute_drag_reorder(
                base,
                "d",
                "c",
                {
                    pointer_y: 50,
                    rect_top: 0,
                    rect_height: 100,
                    pointer_x: 40,
                    rect_left: 100,
                    rect_width: 100,
                },
                "x",
            ),
        ).toEqual(["a", "b", "d", "c"]);
    });

    it("defaults to y-axis guard when axis omitted (backward compatible)", () => {
        // Same call as the vertical move-down case but without passing axis.
        expect(
            compute_drag_reorder(base, "a", "c", {
                pointer_y: 160,
                rect_top: 100,
                rect_height: 100,
            }),
        ).toEqual(["b", "c", "a", "d"]);
    });
});

describe("build_reorder_base", () => {
    it("appends visible items missing from the persisted order", () => {
        // Regression: a provider added after the order was saved (e.g. mimo)
        // is absent from persisted order and must still be reorderable.
        const persisted = ["claude", "tavily"];
        const visible = ["claude", "tavily", "mimo"];
        const base = build_reorder_base(persisted, visible);
        expect(base).toEqual(["claude", "tavily", "mimo"]);
        // the appended item is now findable, so a reorder can commit
        expect(base.indexOf("mimo")).toBeGreaterThanOrEqual(0);
    });

    it("drops persisted items that are no longer visible", () => {
        expect(build_reorder_base(["a", "gone", "b"], ["a", "b"])).toEqual(["a", "b"]);
    });

    it("falls back to visible order when nothing is persisted", () => {
        expect(build_reorder_base([], ["a", "b", "c"])).toEqual(["a", "b", "c"]);
    });

    it("preserves the persisted order for known items", () => {
        expect(build_reorder_base(["c", "a"], ["a", "b", "c"])).toEqual(["c", "a", "b"]);
    });
});
