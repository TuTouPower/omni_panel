import { useMemo, useRef } from "react";
import type { EChartsOption } from "echarts";
import type { DevPanelDailySummary } from "../../../shared/types/dev-panel";
import { useECharts } from "../../hooks/use-echarts";
import {
    RADIUS_SCALE_PX,
    TEXT_SCALE_PX,
    use_chart_palette,
    type ChartPalette,
} from "../../lib/echarts_token_resolver";

interface CommitHeatmapProps {
    daily: readonly DevPanelDailySummary[];
    theme: "dark" | "light";
}

export function build_commit_heatmap_option(
    daily: readonly DevPanelDailySummary[],
    palette: ChartPalette,
): EChartsOption {
    const values = daily.map((item) => item.count);
    const max = Math.max(1, ...values);
    const first = daily[0]?.date ?? new Date().toISOString().slice(0, 10);
    const last = daily[daily.length - 1]?.date ?? first;
    const start_year = first.slice(0, 4);
    const end_year = last.slice(0, 4);
    const data = daily.map((item) => [item.date, item.count]);
    return {
        tooltip: {
            backgroundColor: palette.tipBg,
            borderColor: palette.tipBorder,
            textStyle: {
                color: palette.tipText,
                fontFamily: palette.font_body,
                fontSize: TEXT_SCALE_PX["body-sm"],
            },
            formatter: (params: unknown) => {
                const value = params as { value?: [string, number] };
                const date = value.value?.[0] ?? "";
                const count = value.value?.[1] ?? 0;
                const repositories = daily.find((item) => item.date === date)?.repositories ?? [];
                const detail = repositories
                    .map((item) => `${item.repository}: ${String(item.count)}`)
                    .join("、");
                return `${date} · ${String(count)} commits${detail ? `<br/>${detail}` : ""}`;
            },
        },
        visualMap: {
            min: 0,
            max,
            show: false,
            inRange: { color: ["transparent", ...palette.heat] },
        },
        calendar: {
            range: start_year === end_year ? start_year : [start_year, end_year],
            cellSize: [14, 14],
            top: 32,
            left: 42,
            right: 18,
            bottom: 12,
            splitLine: { lineStyle: { color: palette.axisLine } },
            itemStyle: {
                borderWidth: 2,
                borderColor: palette.heatCellBorder,
                borderRadius: RADIUS_SCALE_PX.xs,
            },
            yearLabel: { color: palette.axis, fontFamily: palette.font_body },
            monthLabel: {
                color: palette.axis,
                fontFamily: palette.font_body,
                fontSize: TEXT_SCALE_PX["label-md"],
            },
            dayLabel: {
                color: palette.axis,
                fontFamily: palette.font_body,
                fontSize: TEXT_SCALE_PX["label-caps"],
            },
        },
        series: [{ type: "heatmap", coordinateSystem: "calendar", data }],
    };
}

export function CommitHeatmap({ daily, theme }: CommitHeatmapProps) {
    const container_ref = useRef<HTMLDivElement>(null);
    const { palette } = use_chart_palette(theme);
    const option = useMemo(() => build_commit_heatmap_option(daily, palette), [daily, palette]);
    useECharts(container_ref, () => option, [option]);
    return (
        <div ref={container_ref} className="h-[250px] min-h-0 w-full" data-testid="dev-heatmap" />
    );
}
