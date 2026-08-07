import { useEffect, useRef } from "react";
import type { ECharts, EChartsInitOpts, EChartsOption, EChartsType } from "echarts";

interface EChartsModule {
    init: (
        dom?: HTMLElement | null,
        theme?: string | object | null,
        opts?: EChartsInitOpts,
    ) => EChartsType;
}

/** Lazily load echarts core + the chart types/components this app uses, then
 * register them once. Shared across all chart components so the dynamic
 * imports and use() registration run a single time. */
let echartsLoading: Promise<EChartsModule> | null = null;

function loadECharts(): Promise<EChartsModule> {
    let pending = echartsLoading;
    if (!pending) {
        pending = Promise.all([
            import("echarts/core"),
            import("echarts/charts"),
            import("echarts/components"),
            import("echarts/renderers"),
        ])
            .then(([{ init, use }, charts, components, renderers]) => {
                use([
                    charts.BarChart,
                    charts.HeatmapChart,
                    charts.PieChart,
                    components.GridComponent,
                    components.TooltipComponent,
                    components.DataZoomComponent,
                    components.VisualMapComponent,
                    renderers.CanvasRenderer,
                ]);
                return { init };
            })
            .catch((err: unknown) => {
                // 失败后复位缓存，后续挂载可重试；避免永久 rejected 且无未处理 rejection。
                echartsLoading = null;
                window.usageboard.log({
                    level: "error",
                    module: "use-echarts",
                    message: `echarts lazy load failed: ${String(err)}`,
                });
                throw err;
            });
        echartsLoading = pending;
    }
    return pending;
}

/** Initialize an ECharts instance on the given container ref.
 * echarts runtime is loaded lazily on first mount; chart stays null until
 * the dynamic import resolves. */
export function useECharts(
    containerRef: React.RefObject<HTMLElement | null>,
    getOption: () => EChartsOption,
    deps: React.DependencyList,
): React.RefObject<ECharts | null> {
    const chartRef = useRef<ECharts | null>(null);
    const getOptionRef = useRef(getOption);
    getOptionRef.current = getOption;

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return undefined;

        let disposed = false;
        let chart: ECharts | null = null;
        const handleResize = () => {
            chart?.resize();
        };

        void loadECharts()
            .then(({ init }) => {
                if (disposed) return;
                // 先赋局部变量：init 若返回 rejected promise，不得污染 chart 引用。
                const c = init(el, undefined, { renderer: "canvas" });
                chart = c;
                chartRef.current = c;
                window.addEventListener("resize", handleResize);
                c.setOption(getOptionRef.current(), true);
            })
            .catch(() => {
                // loadECharts 已上报日志并复位缓存；此处吞掉避免未处理 rejection。
            });

        return () => {
            disposed = true;
            window.removeEventListener("resize", handleResize);
            chart?.dispose();
            chartRef.current = null;
            return undefined;
        };
    }, [containerRef]);

    useEffect(() => {
        chartRef.current?.setOption(getOptionRef.current(), true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    return chartRef;
}
