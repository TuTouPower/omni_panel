import { describe, it, expect } from "vitest";
import {
    COMMON_MODELS,
    MODEL_COLORS,
    PALETTES,
    TAIL_MODELS,
    TOP5_COLORS,
    colorForTopModel,
    colorForTopProject,
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

        it("exposes 8 ascending positive heat colors with no adjacent dupes (t205)", () => {
            for (const theme of ["dark", "light"] as const) {
                const heat = PALETTES[theme].heat;
                expect(heat).toHaveLength(8);
                for (let i = 1; i < heat.length; i++) {
                    expect(heat[i]).not.toBe(heat[i - 1]);
                }
            }
        });
    });

    describe("colorForTopModel", () => {
        it("assigns the five high-contrast colors to the top 5 in order", () => {
            expect(colorForTopModel("any-model", 0, "dark")).toBe(TOP5_COLORS[0]);
            expect(colorForTopModel("any-model", 4, "dark")).toBe(TOP5_COLORS[4]);
        });

        it("falls back to static model color or theme gray beyond top 5", () => {
            expect(colorForTopModel("qwen3-coder-plus", 5, "dark")).toBe(
                MODEL_COLORS["qwen3-coder-plus"],
            );
            expect(colorForTopModel("unknown-model", 5, "dark")).toBe(PALETTES.dark.other);
        });
    });

    describe("colorForTopProject", () => {
        it("assigns the five high-contrast colors to the top 5 projects", () => {
            expect(colorForTopProject("/any/path", 0, "dark")).toBe(TOP5_COLORS[0]);
            expect(colorForTopProject("/any/path", 4, "light")).toBe(TOP5_COLORS[4]);
        });

        it("falls back to the theme gray beyond top 5", () => {
            expect(colorForTopProject("/any/path", 5, "dark")).toBe(PALETTES.dark.other);
            expect(colorForTopProject("/any/path", 5, "light")).toBe(PALETTES.light.other);
        });
    });
});
