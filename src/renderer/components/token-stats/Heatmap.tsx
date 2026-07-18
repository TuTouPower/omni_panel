import { useMemo, useRef } from "react";
import type { EChartsOption } from "echarts";
import { useECharts } from "../../hooks/use-echarts";
import { fmtInt, fmtTok } from "../../lib/token-stats/format";
import { paletteFor } from "../../lib/token-stats/palette";
import { prepareHeatmapData } from "../../lib/token-stats/chart-data";
import type { AgentSessionUsage, Metric } from "../../lib/token-stats/types";

interface HeatmapProps {
    records: AgentSessionUsage[];
    metric: Metric;
    theme: "dark" | "light";
}

const METRIC_LABEL: Record<Metric, string> = {
    tokens: "Token 用量",
    sessions: "会话数",
    calls: "调用次数",
};

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export function Heatmap({ records, metric, theme }: HeatmapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const { data, max } = useMemo(() => prepareHeatmapData(records, metric), [records, metric]);
    const fmtV = metric === "tokens" ? fmtTok : fmtInt;
    const pal = paletteFor(theme);

    const option = useMemo<EChartsOption>(() => {
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
                    formatter: (v: string | number) => `${String(v)}h`,
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
                min: 0,
                max: Math.max(max, 1),
                inRange: { color: pal.heat },
            },
            series: [
                {
                    type: "heatmap",
                    data,
                    itemStyle: { borderColor: pal.sliceBorder, borderWidth: 2, borderRadius: 3 },
                },
            ],
        };
    }, [data, max, metric, pal, fmtV]);

    useECharts(containerRef, () => option, [option]);

    return <div ref={containerRef} className="chart-heat" />;
}
