import { describe, expect, it } from "vitest";
import { usage_color } from "../../../../src/renderer/lib/usage-colors";

describe("usage_color", () => {
    it("returns distinct colors for indices 0-7", () => {
        const seen = new Set<string>();
        for (let i = 0; i < 8; i++) {
            seen.add(usage_color(i));
        }
        expect(seen.size).toBe(8);
    });

    it("cycles every 8 indices", () => {
        for (let i = 0; i < 8; i++) {
            expect(usage_color(i + 8)).toBe(usage_color(i));
            expect(usage_color(i + 16)).toBe(usage_color(i));
        }
    });

    it("handles negative indices", () => {
        expect(usage_color(-1)).toBe(usage_color(7));
        expect(usage_color(-8)).toBe(usage_color(0));
        expect(usage_color(-9)).toBe(usage_color(7));
    });

    it("all colors are valid hex", () => {
        for (let i = 0; i < 8; i++) {
            expect(usage_color(i)).toMatch(/^#[0-9a-fA-F]{6}$/);
        }
    });
});
