import { useMemo, useRef } from "react";
import type { EChartsOption } from "echarts";
import { useECharts } from "../../hooks/use-echarts";
import { fmtInt, fmtTok } from "../../lib/token-stats/format";
import { paletteFor } from "../../lib/token-stats/palette";
import { prepareBarData, escapeHtml } from "../../lib/token-stats/chart-data";
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
    dirAliases?: { alias: string; dirs: string[] }[];
    modelAliases?: { alias: string; models: string[] }[];
}

const METRIC_LABEL: Record<Metric, string> = {
    tokens: "Token 用量",
    sessions: "会话数",
    calls: "调用次数",
};

interface BarTooltipParam {
    seriesName: string;
    value: number;
    marker: string;
    dataIndex: number;
}

/**
 * 构造 BarChart tooltip HTML。导出以便单测验证 XSS 转义。
 * label（session 标题/目录名）、seriesName（model/项目名）、otherDetails key 经 escapeHtml。
 */
export function build_bar_tooltip_html(
    params: unknown,
    labels: readonly string[],
    metric_label: string,
    fmt_value: (v: number) => string,
    other_details: readonly (readonly [string, number][])[],
): string {
    const ps = params as BarTooltipParam[];
    if (!ps.length) return "";
    const first = ps[0];
    if (!first) return "";
    const ci = first.dataIndex;
    const label = labels[ci] ?? "";
    const total = ps.reduce((sum, p) => sum + p.value, 0);
    let html = `<b>${escapeHtml(label)}</b><br/>${metric_label}: <b>${fmt_value(total)}</b>`;
    ps.slice()
        .sort((a, b) => b.value - a.value)
        .forEach((p) => {
            if (p.value <= 0) return;
            html += `<br/>${p.marker}${escapeHtml(p.seriesName)}: <b>${fmt_value(p.value)}</b>`;
            if (p.seriesName === "其他") {
                other_details[ci]?.slice(0, 10).forEach(([k, v]) => {
                    html += `<br/><span style="opacity:.7">&nbsp;&nbsp;· ${escapeHtml(k)}: ${fmt_value(v)}</span>`;
                });
            }
        });
    return html;
}

export function BarChart({
    records,
    metric,
    xaxis,
    gran,
    start,
    end,
    theme,
    topOffset = 20,
    dirAliases,
    modelAliases,
}: BarChartProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const { labels, series, otherDetails } = useMemo(
        () =>
            prepareBarData(
                records,
                metric,
                xaxis,
                gran,
                start,
                end,
                theme,
                dirAliases,
                modelAliases,
            ),
        [records, metric, xaxis, gran, start, end, theme, dirAliases, modelAliases],
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
                formatter: (params: unknown) =>
                    build_bar_tooltip_html(
                        params,
                        labels,
                        METRIC_LABEL[metric],
                        fmtV,
                        otherDetails,
                    ),
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
