import { describe, expect, it } from "vitest";
import { build_commit_heatmap_option } from "../../../../../src/renderer/components/dev-panel/CommitHeatmap";
import type { ChartPalette } from "../../../../../src/renderer/lib/echarts_token_resolver";

const palette = {
    axis: "axis",
    axisLine: "axis-line",
    heatCellBorder: "heat-border",
    heat: ["heat-1", "heat-2"],
    tipBg: "tip-bg",
    tipBorder: "tip-border",
    tipText: "tip-text",
    font_body: "body",
} as ChartPalette;

describe("CommitHeatmap option builder", () => {
    it("maps daily counts and repository detail into a calendar heatmap", () => {
        const option = build_commit_heatmap_option(
            [
                {
                    date: "2026-03-20",
                    count: 3,
                    repositories: [{ repository: "omni_panel", count: 3 }],
                },
                { date: "2026-03-21", count: 1, repositories: [] },
            ],
            palette,
        );

        expect(option.series).toEqual([
            {
                type: "heatmap",
                coordinateSystem: "calendar",
                data: [
                    ["2026-03-20", 3],
                    ["2026-03-21", 1],
                ],
            },
        ]);
        expect(option.visualMap).toMatchObject({ min: 0, max: 3, show: false });
        const formatter = (option.tooltip as { formatter?: (params: unknown) => unknown })
            .formatter;
        expect(formatter?.({ value: ["2026-03-20", 3] })).toContain("omni_panel: 3");
    });
});
