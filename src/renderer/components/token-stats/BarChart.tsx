import { useMemo, useRef } from "react";
import type { EChartsOption } from "echarts";
import { useECharts } from "../../hooks/use-echarts";
import { fmtInt, fmtTok } from "../../lib/token-stats/format";
import { paletteFor } from "../../lib/token-stats/palette";
import { prepareBarData } from "../../lib/token-stats/chart-data";
import type { AgentSessionUsage, Granularity, Metric, XAxis } from "../../lib/token-stats/types";

interface BarChartProps {
    records: AgentSessionUsage[];
    metric: Metric;
    xaxis: XAxis;
    gran: Granularity;
    start: number;
    end: number;
    theme: "dark" | "light";
    topOffset?: number;
}

const METRIC_LABEL: Record<Metric, string> = {
    tokens: "Token 用量",
    sessions: "会话数",
    calls: "调用次数",
};

export function BarChart({
    records,
    metric,
    xaxis,
    gran,
    start,
    end,
    theme,
    topOffset = 20,
}: BarChartProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const { labels, series, otherDetails } = useMemo(
        () => prepareBarData(records, metric, xaxis, gran, start, end, theme),
        [records, metric, xaxis, gran, start, end, theme],
    );
    const fmtV = metric === "tokens" ? fmtTok : fmtInt;
    const pal = paletteFor(theme);

    const option = useMemo<EChartsOption>(() => {
        const nCat = labels.length;
        const rotate = xaxis === "time" ? (gran === "hour" ? 0 : nCat > 14 ? 38 : 0) : 38;
        const hourMode = xaxis === "time" && gran === "hour";
        return {
            grid: {
                left: 8,
                right: 8,
                top: topOffset,
                bottom: nCat > 14 ? 62 : 20,
                containLabel: true,
            },
            tooltip: {
                backgroundColor: pal.tipBg,
                borderColor: pal.tipBorder,
                textStyle: { color: pal.tipText, fontSize: 12, fontFamily: "Inter" },
                extraCssText: pal.tipShadow,
                trigger: "axis",
                axisPointer: { type: "shadow" },
                formatter: (params: unknown) => {
                    const ps = params as {
                        seriesName: string;
                        value: number;
                        marker: string;
                        dataIndex: number;
                    }[];
                    if (!ps.length) return "";
                    const first = ps[0];
                    if (!first) return "";
                    const ci = first.dataIndex;
                    const label = labels[ci] ?? "";
                    const total = ps.reduce((sum, p) => sum + p.value, 0);
                    let html = `<b>${label}</b><br/>${METRIC_LABEL[metric]}: <b>${fmtV(total)}</b>`;
                    ps.slice()
                        .sort((a, b) => b.value - a.value)
                        .forEach((p) => {
                            if (p.value <= 0) return;
                            html += `<br/>${p.marker}${p.seriesName}: <b>${fmtV(p.value)}</b>`;
                            if (p.seriesName === "其他") {
                                otherDetails[ci]?.slice(0, 10).forEach(([k, v]) => {
                                    html += `<br/><span style="opacity:.7">&nbsp;&nbsp;· ${k}: ${fmtV(v)}</span>`;
                                });
                            }
                        });
                    return html;
                },
            },
            xAxis: {
                type: "category",
                data: labels,
                axisLine: { lineStyle: { color: pal.axisLine } },
                axisTick: { show: false },
                axisLabel: {
                    color: pal.axis,
                    fontFamily: "JetBrains Mono",
                    fontSize: 10.5,
                    rotate,
                    interval: hourMode
                        ? (index: number) => new Date(start + index * 3600000).getHours() % 6 === 0
                        : xaxis === "time"
                          ? "auto"
                          : 0,
                    ...(hourMode
                        ? {
                              formatter: (_v: string, index: number) => {
                                  const d = new Date(start + index * 3600000);
                                  const pad = (x: number) => String(x).padStart(2, "0");
                                  const h = d.getHours();
                                  return h === 0
                                      ? `{b|${pad(d.getMonth() + 1)}-${pad(d.getDate())}}`
                                      : `${pad(h)}:00`;
                              },
                              rich: { b: { fontWeight: 700, color: pal.centerV } },
                          }
                        : {}),
                },
                splitLine: { lineStyle: { color: pal.split } },
            },
            yAxis: {
                type: "value",
                axisLine: { lineStyle: { color: pal.axisLine } },
                axisTick: { show: false },
                axisLabel: {
                    color: pal.axis,
                    fontFamily: "JetBrains Mono",
                    fontSize: 10.5,
                    formatter: (v: number) => (metric === "tokens" ? fmtTok(v) : String(v)),
                },
                splitLine: { lineStyle: { color: pal.split } },
            },
            dataZoom:
                nCat <= 14
                    ? [{ type: "inside" }]
                    : [
                          { type: "inside" },
                          {
                              type: "slider",
                              height: 22,
                              bottom: 8,
                              borderColor: "transparent",
                              backgroundColor: pal.dzBg,
                              fillerColor: "rgba(124,108,246,.18)",
                              handleStyle: { color: "#7c6cf6", borderColor: "#7c6cf6" },
                              moveHandleStyle: { color: "#7c6cf6" },
                              textStyle: {
                                  color: pal.dzText,
                                  fontSize: 10,
                                  fontFamily: "JetBrains Mono",
                              },
                              dataBackground: {
                                  lineStyle: { color: pal.dzDataLine },
                                  areaStyle: { color: pal.dzDataArea },
                              },
                              selectedDataBackground: {
                                  lineStyle: { color: pal.dzSelLine },
                                  areaStyle: { color: pal.dzSelArea },
                              },
                          },
                      ],
            series: series.map((s) => ({
                name: s.name,
                type: "bar",
                stack: "t",
                data: s.data,
                itemStyle: s.itemStyle,
                barMaxWidth: 26,
                emphasis: { focus: "series" },
            })),
        };
    }, [labels, series, otherDetails, metric, xaxis, gran, start, pal, fmtV, topOffset]);

    useECharts(containerRef, () => option, [option]);

    return <div ref={containerRef} className="chart-bar" />;
}
