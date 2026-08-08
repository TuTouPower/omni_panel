import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PanelTitleBar } from "../../../../src/renderer/components/PanelTitleBar";

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

    it("点击刷新调用 onRefresh；refreshing 时按钮加 spinning", () => {
        const onRefresh = vi.fn();
        render(<PanelTitleBar panel="Settings" onRefresh={onRefresh} refreshing />);
        const btn = screen.getByTitle("刷新当前面板");
        expect(btn).toHaveClass("spinning");
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
        render(<PanelTitleBar panel="Settings" />);
        expect(screen.queryByTitle("刷新当前面板")).toBeNull();
    });
});
