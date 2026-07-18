import { describe, it, expect } from "vitest";
import {
    COMMON_MODELS,
    MODEL_COLORS,
    PALETTES,
    TAIL_MODELS,
    modelColor,
    paletteFor,
    projectColor,
} from "../../../../../src/renderer/lib/token-stats/palette";

describe("palette", () => {
    it("exposes exactly 5 common models", () => {
        expect(COMMON_MODELS).toHaveLength(5);
        expect(COMMON_MODELS.every((m) => MODEL_COLORS[m])).toBe(true);
    });

    it("keeps tail models separate from common models", () => {
        expect(TAIL_MODELS.length).toBeGreaterThan(0);
        expect(TAIL_MODELS.some((m) => COMMON_MODELS.includes(m))).toBe(false);
    });

    describe("modelColor", () => {
        it("returns the mapped color for common models", () => {
            expect(modelColor("claude-opus-4.5", "dark")).toBe("#7c6cf6");
            expect(modelColor("kimi-k3", "light")).toBe("#ffb454");
        });

        it("falls back to the theme 'other' color for unknown models", () => {
            expect(modelColor("unknown-model", "dark")).toBe(PALETTES.dark.other);
            expect(modelColor("unknown-model", "light")).toBe(PALETTES.light.other);
        });
    });

    describe("projectColor", () => {
        it("returns the mapped color for known directories", () => {
            expect(projectColor("/home/testuser/omni_eval")).toBe("#7c6cf6");
        });

        it("returns the fallback gray for null or unknown directories", () => {
            expect(projectColor(null)).toBe("#6b7890");
            expect(projectColor("/unknown/path")).toBe("#6b7890");
        });
    });

    describe("paletteFor", () => {
        it("returns dark or light chart palette", () => {
            expect(paletteFor("dark")).toBe(PALETTES.dark);
            expect(paletteFor("light")).toBe(PALETTES.light);
            expect(paletteFor("dark").other).not.toBe(paletteFor("light").other);
        });
    });
});
