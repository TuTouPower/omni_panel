import { describe, it, expect } from "vitest";
import { buildHeatmapOption } from "../../../../../src/renderer/components/token-stats/Heatmap";
import { PALETTES } from "../../../../../src/renderer/lib/token-stats/palette";
import type { Metric } from "../../../../../src/renderer/lib/token-stats/types";

const data: [number, number, number][] = [
    [0, 0, 0],
    [9, 0, 50],
];
const quantiles = [20, 30, 40, 50, 60, 70, 80];
const metric: Metric = "tokens";

describe("buildHeatmapOption (t205)", () => {
    it("emits exactly 8 piecewise pieces for both themes", () => {
        for (const theme of ["dark", "light"] as const) {
            const option = buildHeatmapOption(data, quantiles, metric, PALETTES[theme]);
            const pieces = (option.visualMap as { pieces: unknown[] }).pieces;
            expect(pieces).toHaveLength(8);
        }
    });

    it("no piece covers the zero value (zero renders as background)", () => {
        const option = buildHeatmapOption(data, quantiles, metric, PALETTES.dark);
        const pieces = (option.visualMap as { pieces: Record<string, unknown>[] }).pieces;
        for (const p of pieces) {
            // Every piece's lower bound is strictly > 0 (gt: 0 at minimum).
            const lower = (p["gt"] as number | undefined) ?? -Infinity;
            expect(lower).toBeGreaterThanOrEqual(0);
            // No piece uses min:0/max:0 to capture zero.
            expect(p).not.toHaveProperty("min");
        }
    });

    it("pieces use the 8 heat colors in order and span the positive range", () => {
        const option = buildHeatmapOption(data, quantiles, metric, PALETTES.dark);
        const pieces = (option.visualMap as { pieces: Record<string, unknown>[] }).pieces;
        expect(pieces.map((p) => p["color"])).toEqual(PALETTES.dark.heat);
        // First piece opens just above 0; last piece has no upper bound.
        expect(pieces[0]).toMatchObject({ gt: 0, lte: 20 });
        expect(pieces[7]).toMatchObject({ gt: 80 });
        expect(pieces[7]).not.toHaveProperty("lte");
    });
});
