import { useMemo, useRef } from "react";
import type { EChartsOption } from "echarts";
import { useECharts } from "../../hooks/use-echarts";
import { fmtInt, fmtTok } from "../../lib/token-stats/format";
import { paletteFor } from "../../lib/token-stats/palette";
import {
    build_resolver,
    prepareBarData,
    prepareBarDataFromBuckets,
    prepareBarDataFromHourBuckets,
    prepareBarDataFromRollup,
    escapeHtml,
} from "../../lib/token-stats/chart-data";
import type { AgentSessionUsage, Granularity, Metric, XAxis } from "../../lib/token-stats/types";
import type {
    TokenStatsBucket,
    TokenStatsHourBucket,
    TokenStatsRollupRow,
    TokenStatsDashboardChart,
} from "../../../shared/types/token-stats";

interface BarChartProps {
    records: AgentSessionUsage[];
    /** Day-aggregated buckets; when provided, the time axis uses these instead
     * of records (>=7d windows where records exceed the fetch LIMIT). */
    buckets?: TokenStatsBucket[];
    /** Hour-aggregated buckets; when provided, the time-axis hour bar uses
     * these instead of records (hour granularity where records would exceed
     * the fetch LIMIT: >=7d from t173, 24h preset from t183). */
    hourBuckets?: TokenStatsHourBucket[];
    /** Bounded (source, model, directory, session_id) rollup rows; when
     * provided, the project/session axes use these instead of records (24h
     * preset, t184 — records would be LIMIT-truncated on high-density
     * windows). */
    rollup?: TokenStatsRollupRow[];
    metric: Metric;
    xaxis: XAxis;
    gran: Granularity;
    start: number;
    end: number;
    theme: "dark" | "light";
    topOffset?: number;
    dirAliases?: { alias: string; dirs: string[] }[];
    modelAliases?: { alias: string; models: string[] }[];
    dashboardChart?: TokenStatsDashboardChart;
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

function apply_dashboard_aliases(
    chart: TokenStatsDashboardChart,
    metric: Metric,
    xaxis: XAxis,
    dir_aliases: readonly { alias: string; dirs: readonly string[] }[],
    model_aliases: readonly { alias: string; models: readonly string[] }[],
): TokenStatsDashboardChart {
    const dir_resolver = build_resolver(dir_aliases.map((a) => ({ alias: a.alias, keys: a.dirs })));
    const model_resolver = build_resolver(
        model_aliases.map((a) => ({ alias: a.alias, keys: a.models })),
    );
    let labels = [...chart.labels];
    let other_details = chart.other_details.map((details) => [...details]);
    let series = chart.series.map((item) => ({ name: item.name, data: [...item.data] }));
    if (xaxis === "project") {
        const label_index = new Map<string, number>();
        const source_to_target: number[] = [];
        for (const label of labels) {
            const resolved = dir_resolver(label);
            let index = label_index.get(resolved);
            if (index === undefined) {
                index = label_index.size;
                label_index.set(resolved, index);
            }
            source_to_target.push(index);
        }
        labels = [...label_index.keys()];
        series = series.map((item) => ({
            name: item.name,
            data: labels.map((_, target) =>
                source_to_target.reduce(
                    (sum, source) =>
                        sum + (source_to_target[source] === target ? (item.data[source] ?? 0) : 0),
                    0,
                ),
            ),
        }));
        const merged_details: [string, number][][] = labels.map(() => []);
        other_details.forEach((details, source) => {
            const target = source_to_target[source];
            if (target === undefined) return;
            const destination = merged_details[target];
            if (!destination) return;
            destination.push(...details);
        });
        other_details = merged_details.map((details) =>
            details.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 20),
        );
    }
    const series_resolver = metric === "sessions" ? dir_resolver : model_resolver;
    const merged_series = new Map<string, number[]>();
    for (const item of series) {
        const name = item.name === "其他" ? item.name : series_resolver(item.name);
        const values = merged_series.get(name) ?? labels.map(() => 0);
        item.data.forEach((value, index) => {
            values[index] = (values[index] ?? 0) + value;
        });
        merged_series.set(name, values);
    }
    return {
        labels,
        bucket_starts: labels.length === chart.bucket_starts.length ? chart.bucket_starts : [],
        series: [...merged_series.entries()].map(([name, data]) => ({ name, data })),
        other_details,
    };
}
export function BarChart({
    records,
    buckets,
    hourBuckets,
    rollup,
    metric,
    xaxis,
    gran,
    start,
    end,
    theme,
    topOffset = 20,
    dirAliases,
    modelAliases,
    dashboardChart,
}: BarChartProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const { labels, bucketStarts, series, otherDetails } = useMemo(() => {
        if (dashboardChart) {
            const aliased = apply_dashboard_aliases(
                dashboardChart,
                metric,
                xaxis,
                dirAliases ?? [],
                modelAliases ?? [],
            );
            return {
                labels: aliased.labels,
                bucketStarts: aliased.bucket_starts,
                series: aliased.series,
                otherDetails: aliased.other_details,
            };
        }
        // Time axis can use pre-aggregated data for wide windows (>=7d) where
        // per-message records exceed the fetch LIMIT: hour buckets at hour
        // granularity (t173), day buckets at day granularity. Hourly records
        // are only used for short windows. The project / session axes on the
        // 24h preset use the bounded rollup rows (t184) so high-density windows
        // keep their complete top groups.
        if (xaxis === "time" && gran === "hour" && hourBuckets && hourBuckets.length > 0) {
            return prepareBarDataFromHourBuckets(hourBuckets, metric, start, end, theme);
        }
        if (xaxis === "time" && gran === "day" && buckets) {
            return prepareBarDataFromBuckets(buckets, metric, start, end, theme);
        }
        if (xaxis !== "time" && rollup && rollup.length > 0) {
            return prepareBarDataFromRollup(rollup, metric, xaxis, theme, dirAliases, modelAliases);
        }
        return prepareBarData(
            records,
            metric,
            xaxis,
            gran,
            start,
            end,
            theme,
            dirAliases,
            modelAliases,
        );
    }, [
        records,
        buckets,
        hourBuckets,
        rollup,
        metric,
        xaxis,
        gran,
        start,
        end,
        theme,
        dirAliases,
        modelAliases,
        dashboardChart,
    ]);
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
                        ? (index: number) => {
                              const bucket_start = bucketStarts[index];
                              return (
                                  bucket_start !== undefined &&
                                  new Date(bucket_start).getHours() % 6 === 0
                              );
                          }
                        : xaxis === "time"
                          ? "auto"
                          : 0,
                    ...(hourMode
                        ? {
                              formatter: (_v: string, index: number) => {
                                  const bucket_start = bucketStarts[index];
                                  if (bucket_start === undefined) return "";

                                  const date = new Date(bucket_start);
                                  const pad = (value: number) => String(value).padStart(2, "0");
                                  const hour = date.getHours();
                                  return hour === 0
                                      ? `{b|${pad(date.getMonth() + 1)}-${pad(date.getDate())}}`
                                      : `${pad(hour)}:00`;
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
                ...("itemStyle" in s ? { itemStyle: s.itemStyle } : {}),
                barMaxWidth: 26,
                emphasis: { focus: "series" },
            })),
        };
    }, [labels, bucketStarts, series, otherDetails, metric, xaxis, gran, pal, fmtV, topOffset]);

    useECharts(containerRef, () => option, [option]);

    return <div ref={containerRef} className="chart-bar" />;
}
