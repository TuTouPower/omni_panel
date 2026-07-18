import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { ECharts, EChartsOption } from "echarts";

/** Initialize an ECharts instance on the given container ref. */
export function useECharts(
    containerRef: React.RefObject<HTMLElement | null>,
    getOption: () => EChartsOption,
    deps: React.DependencyList,
): React.RefObject<ECharts | null> {
    const chartRef = useRef<ECharts | null>(null);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return undefined;

        const chart = echarts.init(el, undefined, { renderer: "canvas" });
        chartRef.current = chart;
        chart.setOption(getOption(), true);

        const handleResize = () => {
            chart.resize();
        };
        window.addEventListener("resize", handleResize);

        return () => {
            window.removeEventListener("resize", handleResize);
            chart.dispose();
            chartRef.current = null;
            return undefined;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [containerRef]);

    useEffect(() => {
        chartRef.current?.setOption(getOption(), true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    return chartRef;
}
