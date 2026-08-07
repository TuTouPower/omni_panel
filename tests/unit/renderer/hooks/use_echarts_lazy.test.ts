import { renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useECharts } from "../../../../src/renderer/hooks/use-echarts";

/** t249 AC4：echarts 动态加载的卸载竞态。动态 import resolve 前组件已卸载时，
 * 不得对已卸载容器调用 init/setOption。 */

const mocks = vi.hoisted(() => ({
    init: vi.fn(() => ({ setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() })),
    use: vi.fn(),
}));

vi.mock("echarts/core", () => ({ init: mocks.init, use: mocks.use }));
vi.mock("echarts/charts", () => ({ BarChart: {}, HeatmapChart: {}, PieChart: {} }));
vi.mock("echarts/components", () => ({
    GridComponent: {},
    TooltipComponent: {},
    DataZoomComponent: {},
    VisualMapComponent: {},
}));
vi.mock("echarts/renderers", () => ({ CanvasRenderer: {} }));

// 模块级 echartsLoading 缓存跨测试复用同一 mock：mocks.init 每次调用返回新对象，
// 故无需 vi.resetModules 重载 hook 模块。
beforeEach(() => {
    mocks.init.mockClear();
    mocks.use.mockClear();
});

function make_container(): RefObject<HTMLDivElement | null> {
    return { current: document.createElement("div") };
}

function flush_promises(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("useECharts 动态加载", () => {
    it("组件挂载后 echarts 初始化并注册按需图表", async () => {
        const containerRef = make_container();
        const { unmount } = renderHook(() =>
            useECharts(containerRef, () => ({ type: "pie", series: [] }), []),
        );

        await flush_promises();

        expect(mocks.use).toHaveBeenCalled();
        expect(mocks.init).toHaveBeenCalledTimes(1);
        expect(mocks.init).toHaveBeenCalledWith(containerRef.current, undefined, {
            renderer: "canvas",
        });
        unmount();
    });

    it("动态 import resolve 前组件已卸载则不调用 init", async () => {
        const containerRef = make_container();
        const { unmount } = renderHook(() =>
            useECharts(containerRef, () => ({ type: "pie", series: [] }), []),
        );

        // 同步卸载，echarts 动态 import 尚未 resolve
        unmount();
        await flush_promises();

        expect(mocks.init).not.toHaveBeenCalled();
    });

    it("卸载后不再响应 resize", async () => {
        const containerRef = make_container();
        const chart = { setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() };
        mocks.init.mockReturnValueOnce(chart);
        const { unmount } = renderHook(() =>
            useECharts(containerRef, () => ({ type: "pie", series: [] }), []),
        );

        await flush_promises();
        expect(mocks.init).toHaveBeenCalledTimes(1);

        unmount();
        window.dispatchEvent(new Event("resize"));
        expect(chart.resize).not.toHaveBeenCalled();
    });
});
