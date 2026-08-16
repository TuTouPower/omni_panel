import { useMemo, useRef } from "react";
import type { EChartsOption } from "echarts";
import { useECharts } from "../../hooks/use-echarts";
import { TEXT_SCALE_PX, use_chart_palette } from "../../lib/echarts_token_resolver";
import { escapeHtml } from "../../lib/token-stats/chart-data";
import type { DonutSegment } from "../../lib/token-stats/chart-data";

interface MetricDonutProps {
    centerValue: string;
    segments: DonutSegment[];
    format: (n: number) => string;
    theme: "dark" | "light";
}

interface DonutTooltipParam {
    name: string;
    value: number;
    percent: number;
    data?: DonutSegment;
}

/** 构造 MetricDonut tooltip HTML。导出以便单测验证 XSS 转义（name 经 escapeHtml）。 */
export function build_donut_tooltip_html(params: unknown, format: (n: number) => string): string {
    const p = params as DonutTooltipParam | null;
    if (!p) return "";
    let html = `${escapeHtml(p.name)}<br/><b>${format(p.value)}</b> · ${String(p.percent)}%`;
    if (p.data?.extra) html += p.data.extra;
    return html;
}

export function MetricDonut({ centerValue, segments, format, theme }: MetricDonutProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const { palette: pal } = use_chart_palette(theme);

    const option = useMemo<EChartsOption>(() => {
        return {
            tooltip: {
                backgroundColor: pal.tipBg,
                borderColor: pal.tipBorder,
                textStyle: {
                    color: pal.tipText,
                    fontSize: TEXT_SCALE_PX["body-sm"],
                    fontFamily: pal.font_body,
                },
                extraCssText: pal.tipShadow,
                formatter: (params: unknown) => build_donut_tooltip_html(params, format),
            },
            series: [
                {
                    type: "pie",
                    radius: ["58%", "78%"],
                    center: ["50%", "50%"],
                    label: {
                        show: true,
                        position: "center",
                        formatter: `{v|${centerValue}}`,
                        rich: {
                            v: {
                                color: pal.centerV,
                                fontSize: TEXT_SCALE_PX["title-lg"],
                                fontWeight: 700,
                                fontFamily: pal.font_code,
                                lineHeight: 27,
                            },
                            l: {
                                color: pal.centerL,
                                fontSize: TEXT_SCALE_PX["label-md"],
                                fontFamily: pal.font_body,
                            },
                        },
                    },
                    emphasis: { scaleSize: 4 },
                    itemStyle: { borderColor: pal.sliceBorder, borderWidth: 2 },
                    data: segments,
                },
            ],
        };
    }, [centerValue, segments, format, pal]);

    useECharts(containerRef, () => option, [option]);

    return <div ref={containerRef} className="h-[210px] min-h-0 w-full" />;
}
