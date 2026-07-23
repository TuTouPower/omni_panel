import { useMemo, useRef } from "react";
import type { EChartsOption } from "echarts";
import { useECharts } from "../../hooks/use-echarts";
import { paletteFor } from "../../lib/token-stats/palette";
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

    const option = useMemo<EChartsOption>(() => {
        const pal = paletteFor(theme);
        return {
            tooltip: {
                backgroundColor: pal.tipBg,
                borderColor: pal.tipBorder,
                textStyle: { color: pal.tipText, fontSize: 12, fontFamily: "Inter" },
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
                                fontSize: 21,
                                fontWeight: 700,
                                fontFamily: "JetBrains Mono",
                                lineHeight: 27,
                            },
                            l: {
                                color: pal.centerL,
                                fontSize: 11,
                                fontFamily: "Inter",
                            },
                        },
                    },
                    emphasis: { scaleSize: 4 },
                    itemStyle: { borderColor: pal.sliceBorder, borderWidth: 2 },
                    data: segments,
                },
            ],
        };
    }, [centerValue, segments, format, theme]);

    useECharts(containerRef, () => option, [option]);

    return <div ref={containerRef} className="donut" />;
}
