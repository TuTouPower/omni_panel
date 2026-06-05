import { describe, expect, it } from "vitest";
import {
    DEFAULT_FLOATING_HEIGHT,
    DEFAULT_FLOATING_WIDTH,
    MIN_FLOATING_HEIGHT,
    MIN_FLOATING_WIDTH,
    clamp_floating_bounds_to_display,
    default_floating_bounds,
    restore_floating_bounds,
} from "../../../src/main/core/main-panel/floating-bounds";
import type { FloatingBoundsConfiguration } from "../../../src/shared/types/config";

const work_area = { x: 0, y: 0, width: 1280, height: 720 };
const display = { id: 1, workArea: work_area };
const second_display = { id: 2, workArea: { x: 1280, y: 0, width: 1920, height: 1080 } };

describe("floating bounds constants", () => {
    it("matches the configured floating window sizes", () => {
        expect(DEFAULT_FLOATING_WIDTH).toBe(460);
        expect(DEFAULT_FLOATING_HEIGHT).toBe(720);
        expect(MIN_FLOATING_WIDTH).toBe(320);
        expect(MIN_FLOATING_HEIGHT).toBe(240);
    });
});

describe("default_floating_bounds", () => {
    it("places the default window inside the work area", () => {
        const out = default_floating_bounds(display);
        expect(out.width).toBe(DEFAULT_FLOATING_WIDTH);
        expect(out.height).toBe(DEFAULT_FLOATING_HEIGHT);
        expect(out.displayId).toBe("1");
        expect(out.x).toBeGreaterThanOrEqual(work_area.x);
        expect(out.y).toBeGreaterThanOrEqual(work_area.y);
        expect(out.x + out.width).toBeLessThanOrEqual(work_area.x + work_area.width);
        expect(out.y + out.height).toBeLessThanOrEqual(work_area.y + work_area.height);
    });
});

describe("clamp_floating_bounds_to_display", () => {
    it("keeps visible bounds unchanged", () => {
        const saved = { x: 100, y: 80, width: 460, height: 500 };
        expect(clamp_floating_bounds_to_display(saved, display)).toEqual({
            ...saved,
            displayId: "1",
        });
    });

    it("clamps a window that is too large for the current work area", () => {
        const saved = { x: -200, y: -100, width: 1600, height: 900 };
        const out = clamp_floating_bounds_to_display(saved, display);
        expect(out.x).toBe(0);
        expect(out.y).toBe(0);
        expect(out.width).toBe(1280);
        expect(out.height).toBe(720);
    });

    it("clamps a window that overflows the bottom-right edge", () => {
        const saved = { x: 1100, y: 650, width: 460, height: 500 };
        const out = clamp_floating_bounds_to_display(saved, display);
        expect(out.x).toBe(1280 - 460);
        expect(out.y).toBe(720 - 500);
    });
});

describe("restore_floating_bounds", () => {
    it("uses the saved display when it still exists", () => {
        const saved: FloatingBoundsConfiguration = {
            x: 1400,
            y: 40,
            width: 460,
            height: 500,
            displayId: "2",
        };
        const out = restore_floating_bounds(saved, [display, second_display], display);
        expect(out.x).toBe(1400);
        expect(out.y).toBe(40);
        expect(out.displayId).toBe("2");
    });

    it("falls back to the preferred display when saved display is gone", () => {
        const saved: FloatingBoundsConfiguration = {
            x: 1400,
            y: 40,
            width: 460,
            height: 500,
            displayId: "99",
        };
        const out = restore_floating_bounds(saved, [display], display);
        expect(out.x).toBe(1280 - 460);
        expect(out.y).toBe(40);
        expect(out.displayId).toBe("1");
    });

    it("uses the preferred display when saved bounds have no display id", () => {
        const saved: FloatingBoundsConfiguration = {
            x: 1400,
            y: 40,
            width: 460,
            height: 500,
        };
        const out = restore_floating_bounds(saved, [display, second_display], display);
        expect(out.x).toBe(1280 - 460);
        expect(out.y).toBe(40);
        expect(out.displayId).toBe("1");
    });

    it("returns a default when no saved bounds exist", () => {
        const out = restore_floating_bounds(undefined, [display], display);
        expect(out.width).toBe(DEFAULT_FLOATING_WIDTH);
        expect(out.height).toBe(DEFAULT_FLOATING_HEIGHT);
    });
});
