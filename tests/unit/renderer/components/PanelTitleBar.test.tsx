import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PanelTitleBar } from "../../../../src/renderer/components/ui/PanelTitleBar";

describe("PanelTitleBar (t252)", () => {
    beforeEach(() => {
        document.documentElement.removeAttribute("data-web");
        (window as unknown as { usageboard: unknown }).usageboard = {
            window: { minimize: vi.fn(), maximize: vi.fn(), close: vi.fn() },
        };
    });

    it("渲染品牌标题：软件 icon + `Omni Panel - <面板名>`", () => {
        render(<PanelTitleBar panel="Settings" />);
        expect(screen.getByText("Omni Panel - Settings")).toBeInTheDocument();
        expect(screen.getByAltText("OmniPanel")).toBeInTheDocument();
    });

    it("隐藏当前面板切换图标，显示其余三个（AC1）", () => {
        render(<PanelTitleBar panel="Session" />);
        expect(screen.queryByRole("button", { name: "Session面板" })).toBeNull();
        expect(screen.getByRole("button", { name: "Usage面板" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Agent面板" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Settings面板" })).toBeInTheDocument();
    });

    it("点击切换图标调用 onNavigate 并携带目标面板名", () => {
        const onNavigate = vi.fn();
        render(<PanelTitleBar panel="Settings" onNavigate={onNavigate} />);
        fireEvent.click(screen.getByRole("button", { name: "Agent面板" }));
        expect(onNavigate).toHaveBeenCalledWith("Agent");
    });

    it("点击刷新调用 onRefresh；refreshing 时图标旋转", () => {
        const onRefresh = vi.fn();
        render(<PanelTitleBar panel="Session" onRefresh={onRefresh} refreshing />);
        const btn = screen.getByTitle("刷新当前面板");
        expect(btn.querySelector("svg")).toHaveClass("animate-spin");
        fireEvent.click(btn);
        expect(onRefresh).toHaveBeenCalled();
    });

    it("web 模式不渲染窗口控制按钮（最小化/最大化/关闭）", () => {
        document.documentElement.setAttribute("data-web", "1");
        render(<PanelTitleBar panel="Settings" />);
        expect(screen.queryByTitle("最小化")).toBeNull();
        expect(screen.queryByTitle("最大化/还原")).toBeNull();
        expect(screen.queryByTitle("关闭")).toBeNull();
        expect(screen.getByRole("button", { name: "Usage面板" })).toBeInTheDocument();
    });

    it("未传 onRefresh 时刷新按钮不渲染", () => {
        render(<PanelTitleBar panel="Session" />);
        expect(screen.queryByTitle("刷新当前面板")).toBeNull();
    });

    it("切换按钮固定序「设置 用量 代理 会话」，排除当前面板（AC-001）", () => {
        render(<PanelTitleBar panel="Usage" onRefresh={vi.fn()} />);
        const panel_buttons = screen
            .getAllByRole("button")
            .map((b) => b.getAttribute("aria-label"))
            .filter((l): l is string => typeof l === "string" && l.endsWith("面板"));
        expect(panel_buttons).toEqual(["Settings面板", "Agent面板", "Session面板"]);
    });

    it("设置面板切换按钮为「用量 代理 会话」且刷新按钮恒不渲染（AC-001）", () => {
        render(<PanelTitleBar panel="Settings" onRefresh={vi.fn()} />);
        const panel_buttons = screen
            .getAllByRole("button")
            .map((b) => b.getAttribute("aria-label"))
            .filter((l): l is string => typeof l === "string" && l.endsWith("面板"));
        expect(panel_buttons).toEqual(["Usage面板", "Agent面板", "Session面板"]);
        expect(screen.queryByTitle("刷新当前面板")).toBeNull();
    });

    it("非设置面板刷新按钮在首位（AC-001）", () => {
        render(<PanelTitleBar panel="Session" onRefresh={vi.fn()} />);
        const buttons = screen.getAllByRole("button");
        expect(buttons[0]?.getAttribute("aria-label")).toBe("刷新");
    });

    it("Usage 切换按钮 icon 为 clock_forward（lucide ClockArrowUp，无 dashboard 矩形）（AC-006）", () => {
        render(<PanelTitleBar panel="Session" />);
        const usage_btn = screen.getByRole("button", { name: "Usage面板" });
        const svg = usage_btn.querySelector("svg");
        expect(svg).not.toBeNull();
        // ClockArrowUp 特征 path（时间快进上箭头）；LayoutDashboard 为四个 rect，无此 path。
        expect(svg?.innerHTML).toContain('d="m14 18 4-4 4 4"');
        expect(svg?.innerHTML).not.toContain("<rect");
    });
});
