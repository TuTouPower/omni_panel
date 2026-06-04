import { describe, expect, it } from "vitest";
import { USAGE_COLORS, usage_color } from "../../../../src/renderer/lib/usage-colors";

describe("usage_color", () => {
    it("returns colors from the palette by index", () => {
        expect(usage_color(0)).toBe(USAGE_COLORS[0]);
        expect(usage_color(1)).toBe(USAGE_COLORS[1]);
        expect(usage_color(7)).toBe(USAGE_COLORS[7]);
    });

    it("cycles every 8 indices", () => {
        expect(usage_color(8)).toBe(USAGE_COLORS[0]);
        expect(usage_color(9)).toBe(USAGE_COLORS[1]);
        expect(usage_color(16)).toBe(USAGE_COLORS[0]);
    });

    it("handles negative indices", () => {
        expect(usage_color(-1)).toBe(USAGE_COLORS[7]);
        expect(usage_color(-8)).toBe(USAGE_COLORS[0]);
        expect(usage_color(-9)).toBe(USAGE_COLORS[7]);
    });

    it("has exactly 8 colors", () => {
        expect(USAGE_COLORS).toHaveLength(8);
    });

    it("all colors are valid hex", () => {
        for (const color of USAGE_COLORS) {
            expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
        }
    });
});
