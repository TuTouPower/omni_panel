import { useMemo, useRef } from "react";
import type { EChartsOption } from "echarts";
import { useECharts } from "../../hooks/use-echarts";
import { fmtInt, fmtTok } from "../../lib/token-stats/format";
import { paletteFor } from "../../lib/token-stats/palette";
import { prepareHeatmapFromCells } from "../../lib/token-stats/chart-data";
import type { Metric } from "../../lib/token-stats/types";
import type { ChartPalette } from "../../lib/token-stats/palette";
import type { TokenStatsHeatmapCell } from "../../../shared/types/token-stats";

interface HeatmapProps {
    cells: TokenStatsHeatmapCell[];
    metric: Metric;
    theme: "dark" | "light";
}

const METRIC_LABEL: Record<Metric, string> = {
    tokens: "Token 用量",
    sessions: "会话数",
    calls: "调用次数",
};

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

const HEAT_BANDS = 8;

/** Build the piecewise visualMap option for 8 positive octile bands.
 * Zero is intentionally uncovered: ECharts renders it transparent, showing
 * the grid background (s014). */
export function buildHeatmapOption(
    data: [number, number, number][],
    quantiles: number[],
    metric: Metric,
    pal: ChartPalette,
): EChartsOption {
    const fmtV = metric === "tokens" ? fmtTok : fmtInt;
    // Band 0: (0, q0]; middle band i: (q[i-1], q[i]]; last band: (q[6], +inf).
    // quantiles holds 7 boundaries → 8 bands.
    const pieces = Array.from({ length: HEAT_BANDS }, (_, i) => {
        const color = pal.heat[i] ?? "#7c6cf6";
        if (i === 0) return { gt: 0, lte: quantiles[0] ?? 0, color };
        if (i === HEAT_BANDS - 1) return { gt: quantiles[i - 1] ?? 0, color };
        return { gt: quantiles[i - 1] ?? 0, lte: quantiles[i] ?? 0, color };
    });
    return {
        grid: { left: 8, right: 8, top: 10, bottom: 24, containLabel: true },
        tooltip: {
            backgroundColor: pal.tipBg,
            borderColor: pal.tipBorder,
            textStyle: { color: pal.tipText, fontSize: 12, fontFamily: "Inter" },
            extraCssText: pal.tipShadow,
            formatter: (params: unknown) => {
                const p = params as { value: [number, number, number] };
                const day = WEEKDAYS[p.value[1]] ?? "";
                const hour = String(p.value[0]).padStart(2, "0");
                return `${day} ${hour}:00 — <b>${fmtV(p.value[2])}</b> ${METRIC_LABEL[metric]}`;
            },
        },
        xAxis: {
            type: "category",
            data: Array.from({ length: 24 }, (_, i) => i),
            axisLine: { lineStyle: { color: pal.axisLine } },
            axisTick: { show: false },
            axisLabel: {
                color: pal.axis,
                fontFamily: "JetBrains Mono",
                fontSize: 10.5,
                interval: 3,
                formatter: (v: string | number) => `${String(v).padStart(2, "0")}:00`,
            },
            splitLine: { show: false },
        },
        yAxis: {
            type: "category",
            data: WEEKDAYS,
            inverse: true,
            axisLine: { lineStyle: { color: pal.axisLine } },
            axisTick: { show: false },
            axisLabel: { color: pal.axis, fontFamily: "Inter", fontSize: 11 },
            splitLine: { show: false },
        },
        visualMap: {
            show: false,
            type: "piecewise",
            pieces,
        },
        series: [
            {
                type: "heatmap",
                data,
                itemStyle: { borderColor: pal.sliceBorder, borderWidth: 2, borderRadius: 3 },
            },
        ],
    };
}

export function Heatmap({ cells, metric, theme }: HeatmapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const { data, quantiles } = useMemo(
        () => prepareHeatmapFromCells(cells, metric),
        [cells, metric],
    );
    const pal = paletteFor(theme);

    const option = useMemo(
        () => buildHeatmapOption(data, quantiles, metric, pal),
        [data, quantiles, metric, pal],
    );

    useECharts(containerRef, () => option, [option]);

    return <div ref={containerRef} className="chart-heat" />;
}
