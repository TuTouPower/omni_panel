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

    // 旧测试「渲染品牌标题：软件 icon + `Omni Panel - <面板名>`」已被 t493 AC-002 废弃：
    // 用户要求全平台标题栏不再渲染 logo 与品牌前缀，只留纯面板名。按 AGENTS.md 废除并新增覆盖新语义测试。
    it("所有面板标题栏只显示面板名，不再渲染 logo 与「Omni Panel - 」前缀 (t493 AC-002)", () => {
        render(<PanelTitleBar panel="Settings" />);
        expect(screen.getByTestId("app-title")).toHaveTextContent("Settings");
        expect(screen.queryByText("Omni Panel - Settings")).toBeNull();
        expect(screen.queryByAltText("OmniPanel")).toBeNull();
    });

    it("macOS 下 setting/agent/session/dev 预留 78px 交通灯区域，内容不重叠 (t493 AC-001)", () => {
        const { unmount } = render(<PanelTitleBar panel="Settings" platform="darwin" />);
        expect(screen.getByTestId("traffic-lights-spacer")).toBeInTheDocument();
        expect(screen.getByTestId("traffic-lights-spacer")).toHaveClass("w-[78px]");
        unmount();

        // Usage 面板（托盘弹窗）不预留交通灯空间
        render(<PanelTitleBar panel="Usage" platform="darwin" />);
        expect(screen.queryByTestId("traffic-lights-spacer")).toBeNull();
    });

    it("Windows/Linux 下不预留交通灯区域 (t493)", () => {
        render(<PanelTitleBar panel="Settings" platform="win32" />);
        expect(screen.queryByTestId("traffic-lights-spacer")).toBeNull();
    });

    it("macOS 下正常面板窗口不渲染自绘最小化/最大化/关闭按钮 (t493 AC-003)", () => {
        render(<PanelTitleBar panel="Settings" platform="darwin" />);
        expect(screen.queryByTitle("最小化")).toBeNull();
        expect(screen.queryByTitle("最大化/还原")).toBeNull();
        expect(screen.queryByTitle("关闭")).toBeNull();
    });

    it("Windows/Linux 下渲染自绘最小化/最大化/关闭按钮 (t493 AC-003)", () => {
        render(<PanelTitleBar panel="Settings" platform="win32" />);
        expect(screen.getByTitle("最小化")).toBeInTheDocument();
        expect(screen.getByTitle("最大化/还原")).toBeInTheDocument();
        expect(screen.getByTitle("关闭")).toBeInTheDocument();
    });

    it("macOS 下 floating popup 模式仍渲染「隐藏到托盘」按钮 (t493 非范围)", () => {
        render(<PanelTitleBar panel="Usage" floating platform="darwin" />);
        expect(screen.getByTitle("隐藏到托盘")).toBeInTheDocument();
        expect(screen.queryByTitle("最小化")).toBeNull();
    });

    it("面板形态恒定渲染五个切换按钮，含当前面板（AC-001）", () => {
        render(<PanelTitleBar panel="Session" />);
        expect(screen.getByRole("button", { name: "Session面板" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Usage面板" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Agent面板" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Settings面板" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Dev面板" })).toBeInTheDocument();
    });

    it("点击当前面板自身按钮调用 onNavigate 不抛错（AC-003）", () => {
        const onNavigate = vi.fn();
        render(<PanelTitleBar panel="Usage" onNavigate={onNavigate} />);
        expect(() => {
            fireEvent.click(screen.getByRole("button", { name: "Usage面板" }));
        }).not.toThrow();
        expect(onNavigate).toHaveBeenCalledWith("Usage");
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
        // t311：web 下互跳入口为原生链接（不再是 button）。
        expect(screen.getByRole("link", { name: "Usage面板" })).toBeInTheDocument();
    });

    it("web 态互跳图标渲染为原生链接，href 精确且无 onClick 拦截（t311 AC-001/AC-004）", () => {
        document.documentElement.setAttribute("data-web", "1");
        const onNavigate = vi.fn();
        try {
            render(<PanelTitleBar panel="Settings" onNavigate={onNavigate} />);
            const usage = screen.getByRole("link", { name: "Usage面板" });
            const agent = screen.getByRole("link", { name: "Agent面板" });
            const session = screen.getByRole("link", { name: "Session面板" });
            const settings = screen.getByRole("link", { name: "Settings面板" });
            expect(usage.tagName).toBe("A");
            expect(usage).toHaveAttribute("href", "#usage");
            expect(agent).toHaveAttribute("href", "#agent");
            expect(session).toHaveAttribute("href", "#session");
            expect(settings).toHaveAttribute("href", "#setting");
            // AC-004 静态前提：无 onClick 拦截。React 合成事件不渲染 onclick
            // attribute（hasAttribute 恒真断言无意义）；jsdom 无默认 hash 导航。
            // 可失败断言：点击链接不触发 onNavigate（若实现误在 <a> 上挂 onClick
            // 拦截会调它）——默认导航透传由 web e2e 真实浏览器 hash 切换断言覆盖。
            usage.click();
            expect(onNavigate).not.toHaveBeenCalled();
        } finally {
            document.documentElement.removeAttribute("data-web");
        }
    });

    it("桌面态互跳图标保持按钮语义，无 href（t311 AC-005）", () => {
        render(<PanelTitleBar panel="Settings" />);
        const usage = screen.getByRole("button", { name: "Usage面板" });
        expect(usage.tagName).toBe("BUTTON");
        expect(usage.hasAttribute("href")).toBe(false);
        const agent = screen.getByRole("button", { name: "Agent面板" });
        expect(agent.tagName).toBe("BUTTON");
    });

    it("未传 onRefresh 时刷新按钮不渲染", () => {
        render(<PanelTitleBar panel="Session" />);
        expect(screen.queryByTitle("刷新当前面板")).toBeNull();
    });

    it("切换按钮固定序「设置 用量 代理 会话 开发」，含当前面板（AC-001）", () => {
        render(<PanelTitleBar panel="Usage" onRefresh={vi.fn()} />);
        const panel_buttons = screen
            .getAllByRole("button")
            .map((b) => b.getAttribute("aria-label"))
            .filter((l): l is string => typeof l === "string" && l.endsWith("面板"));
        expect(panel_buttons).toEqual([
            "Settings面板",
            "Usage面板",
            "Agent面板",
            "Session面板",
            "Dev面板",
        ]);
    });

    it("设置面板切换按钮恒定五枚「设置 用量 代理 会话 开发」且刷新按钮恒不渲染（AC-001）", () => {
        render(<PanelTitleBar panel="Settings" onRefresh={vi.fn()} />);
        const panel_buttons = screen
            .getAllByRole("button")
            .map((b) => b.getAttribute("aria-label"))
            .filter((l): l is string => typeof l === "string" && l.endsWith("面板"));
        expect(panel_buttons).toEqual([
            "Settings面板",
            "Usage面板",
            "Agent面板",
            "Session面板",
            "Dev面板",
        ]);
        expect(screen.queryByTitle("刷新当前面板")).toBeNull();
    });

    it("非设置面板刷新按钮在首位（AC-001）", () => {
        render(<PanelTitleBar panel="Session" onRefresh={vi.fn()} />);
        const buttons = screen.getAllByRole("button");
        expect(buttons[0]?.getAttribute("aria-label")).toBe("刷新");
    });

    it("before_actions 渲染于刷新按钮左侧（t323 三按钮插槽）", () => {
        render(
            <PanelTitleBar
                panel="Session"
                onRefresh={vi.fn()}
                before_actions={
                    <>
                        <button type="button">最近会话</button>
                        <button type="button">清空</button>
                        <button type="button">视图 ▾</button>
                    </>
                }
            />,
        );
        const recent = screen.getByRole("button", { name: "最近会话" });
        const view = screen.getByRole("button", { name: /视图/ });
        const refresh = screen.getByTitle("刷新当前面板");
        const in_titlebar = (el: HTMLElement): boolean =>
            document.querySelector("[data-panel-titlebar=Session]")?.contains(el) ?? false;
        expect(in_titlebar(recent)).toBe(true);
        // 最近会话在视图前，视图在刷新前（全部左侧）。
        expect(
            recent.compareDocumentPosition(view) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
            view.compareDocumentPosition(refresh) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
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

    it("center 插槽渲染于标题与动作区之间（t380）", () => {
        render(
            <PanelTitleBar panel="Agent" center={<span data-testid="center-slot">筛选器</span>} />,
        );
        expect(screen.getByTestId("center-slot")).toBeInTheDocument();
    });

    it("title_extra 渲染于品牌标题后（t380）", () => {
        render(
            <PanelTitleBar
                panel="Agent"
                title_extra={<span data-testid="title-extra">状态</span>}
            />,
        );
        expect(screen.getByTestId("title-extra")).toBeInTheDocument();
    });

    it("onRefreshAll 时刷新按钮标题为「刷新全部」且点击调用 onRefreshAll（t380）", () => {
        const onRefreshAll = vi.fn();
        render(<PanelTitleBar panel="Usage" onRefreshAll={onRefreshAll} is_live />);
        const refresh_btn = screen.getByRole("button", { name: "刷新" });
        expect(refresh_btn.getAttribute("title")).toBe("刷新全部");
        fireEvent.click(refresh_btn);
        expect(onRefreshAll).toHaveBeenCalledTimes(1);
    });

    it("onRefresh 时刷新按钮标题为「刷新当前面板」（t380）", () => {
        const onRefresh = vi.fn();
        render(<PanelTitleBar panel="Agent" onRefresh={onRefresh} is_live />);
        const refresh_btn = screen.getByRole("button", { name: "刷新" });
        expect(refresh_btn.getAttribute("title")).toBe("刷新当前面板");
    });

    it("floating 模式窗口控制只渲染「隐藏用量面板」，无最小化/最大化（t380）", () => {
        const onClose = vi.fn();
        render(<PanelTitleBar panel="Usage" floating onClose={onClose} />);
        const hide_btn = screen.getByRole("button", { name: "隐藏用量面板" });
        expect(screen.queryByRole("button", { name: "最小化" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "最大化/还原" })).not.toBeInTheDocument();
        fireEvent.click(hide_btn);
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
