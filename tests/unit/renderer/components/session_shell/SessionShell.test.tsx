import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { vi } from "vitest";
import { SessionShell } from "../../../../../src/renderer/components/session-shell/SessionShell";
import { install_history_usageboard } from "../../views/session_history_test_utils";

/**
 * t223 会话窗口单壳双页签外壳测试。
 * 覆盖 AC：页签切换与内部状态保留、全局主题跟随与事件同步、跳转按钮 IPC、
 * 会话库空态占位、无命令面板/拖文件导入入口。
 */

const THEME_KEY = "omni_session_theme";

type MockFn = ReturnType<typeof vi.fn>;
interface MockBoard {
    sessionHistory: {
        open: MockFn;
        subscribe: MockFn;
        unsubscribe: MockFn;
        query: MockFn;
        recent: MockFn;
        onMessagesUpdated: MockFn;
        onFocus: MockFn;
    };
    tokenStats: { open: MockFn; getSessions: MockFn };
    tray: { open_panel: MockFn };
}

function usageboard(): MockBoard {
    return (globalThis as unknown as { usageboard: MockBoard }).usageboard;
}

function focus_cb(): (loc: unknown) => void {
    const ub = usageboard();
    const cb = ub.sessionHistory.onFocus.mock.calls[0]?.[0] as ((loc: unknown) => void) | undefined;
    if (!cb) throw new Error("onFocus callback not registered");
    return cb;
}

function msg(id: string, role: "user" | "assistant", text: string, timestamp: number) {
    return { id, role, text, timestamp };
}

beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    install_history_usageboard();
});

describe("SessionShell (t223)", () => {
    it("默认落在工作台页签，渲染工作台视图", async () => {
        render(<SessionShell />);
        await act(async () => {
            await Promise.resolve();
        });
        expect(screen.getByRole("button", { name: "工作台" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "会话库" })).toBeTruthy();
        expect(screen.getByText("工作台为空")).toBeTruthy();
        expect(document.querySelector('[data-pane="workspace"]')?.getAttribute("data-active")).toBe(
            "true",
        );
        expect(document.querySelector('[data-pane="library"]')?.getAttribute("data-active")).toBe(
            "false",
        );
    });

    it("切换到会话库显示会话库视图，工作台隐藏但保持挂载", async () => {
        render(<SessionShell />);
        await act(async () => {
            await Promise.resolve();
        });
        fireEvent.click(screen.getByRole("button", { name: "会话库" }));
        // t227 会话库为真实视图（.library-view），非空态占位。
        expect(document.querySelector(".library-view")).toBeTruthy();
        expect(document.querySelector('[data-pane="workspace"]')?.getAttribute("data-active")).toBe(
            "false",
        );
        expect(document.querySelector('[data-pane="library"]')?.getAttribute("data-active")).toBe(
            "true",
        );
        // 工作台内容仍在 DOM（display 隐藏而非卸载）
        expect(screen.getByText("工作台为空")).toBeTruthy();
    });

    it("切回工作台后已打开会话的栏状态保留", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({
            messages: [msg("m1", "user", "你好", 100)],
            next_cursor: null,
        });
        render(<SessionShell />);
        await act(async () => {
            await Promise.resolve();
        });
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "sess_a" });
        });
        await waitFor(() => screen.getByText("你好"));

        fireEvent.click(screen.getByRole("button", { name: "会话库" }));
        expect(document.querySelector('[data-pane="workspace"]')?.getAttribute("data-active")).toBe(
            "false",
        );

        fireEvent.click(screen.getByRole("button", { name: "工作台" }));
        expect(document.querySelector('[data-pane="workspace"]')?.getAttribute("data-active")).toBe(
            "true",
        );
        expect(screen.getByText("你好")).toBeTruthy();
        expect(ub.sessionHistory.unsubscribe).not.toHaveBeenCalled();
    });

    it("顶栏移除主题切换按钮与未生效的摘选托盘按钮", async () => {
        render(<SessionShell />);
        await act(async () => {
            await Promise.resolve();
        });
        expect(screen.queryByRole("button", { name: /切换到浅色模式|切换到暗色模式/ })).toBeNull();
        expect(screen.queryByRole("button", { name: "摘选托盘" })).toBeNull();
    });

    it("会话窗口跟随全局主题且不读取独立主题存储", async () => {
        localStorage.setItem(THEME_KEY, "dark");
        const ub = install_history_usageboard(() => ({
            schemaVersion: 1,
            language: "zh-Hans",
            plugins: [],
            launchAtLogin: false,
            theme: "light",
        }));
        render(<SessionShell />);
        await act(async () => {
            await Promise.resolve();
        });

        await waitFor(() => {
            expect(document.documentElement.getAttribute("data-theme")).toBe("light");
        });
        expect(localStorage.getItem(THEME_KEY)).toBe("dark");
        expect(ub.config.get).toHaveBeenCalled();
        expect(ub.event.onThemeChange).toHaveBeenCalled();

        const theme_event_mock = ub.event.onThemeChange as unknown as MockFn;
        const on_theme_change = theme_event_mock.mock.calls[0]?.[0] as
            | ((is_dark: boolean) => void)
            | undefined;
        if (!on_theme_change) throw new Error("theme callback not registered");
        act(() => {
            on_theme_change(true);
        });
        expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
        expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    });

    it("标题栏面板切换图标调用对应面板 open", async () => {
        const ub = usageboard();
        render(<SessionShell />);
        await act(async () => {
            await Promise.resolve();
        });
        // t252: 原 shell-actions 跳转按钮被统一控制区吸收；点击切换图标跳转目标面板。
        fireEvent.click(screen.getByRole("button", { name: "Usage面板" }));
        expect(ub.tray.open_panel).toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Agent面板" }));
        expect(ub.tokenStats.open).toHaveBeenCalled();
    });

    it("窗口内无命令面板与拖文件导入入口", async () => {
        render(<SessionShell />);
        await act(async () => {
            await Promise.resolve();
        });
        expect(screen.queryByText("命令面板")).toBeNull();
        expect(screen.queryByText(/⌘/)).toBeNull();
        expect(screen.queryByText(/拖文件|拖拽导入|import/i)).toBeNull();
    });

    it("t380 AC-004：页签迁入 PanelTitleBar 中间插槽，不再绝对定位", async () => {
        render(<SessionShell />);
        await act(async () => {
            await Promise.resolve();
        });
        const titlebar = document.querySelector("[data-panel-titlebar=Session]");
        expect(titlebar?.className).toContain("flex-1");
        const tabs = document.querySelector(".session-tabs");
        // t380: 页签入 center 插槽，不再 absolute/translate 居中；仍 no-drag 可点。
        expect(tabs).toBeNull();
        expect(screen.getByRole("navigation", { name: "面板页签" })).toBeInTheDocument();
        const tab_nav = document.querySelector("nav[aria-label='面板页签']");
        expect(tab_nav).toBeTruthy();
        expect(titlebar?.contains(tab_nav)).toBe(true);
    });

    it("t315 AC1：根容器与顶栏背景为 surface-window（对齐用量/设置/代理面板）", async () => {
        render(<SessionShell />);
        await act(async () => {
            await Promise.resolve();
        });
        const root = document.querySelector(".session-shell");
        expect(root?.className).toContain("bg-[var(--color-surface-window)]");
        expect(root?.className).not.toContain("bg-[var(--color-surface)]");
        const topbar = document.querySelector(".session-topbar");
        expect(topbar?.className).toContain("bg-[var(--color-surface-window)]");
        expect(topbar?.className).not.toContain("bg-[var(--color-surface)]");
    });
});

function before(a: HTMLElement, b: HTMLElement): boolean {
    return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

describe("SessionShell (t323 顶栏三按钮上移)", () => {
    it("AC-001：三按钮渲染于刷新按钮左侧，顺序 最近会话/清空/视图", async () => {
        render(<SessionShell />);
        await act(async () => {
            await Promise.resolve();
        });
        const titlebar = document.querySelector("[data-panel-titlebar=Session]");
        expect(titlebar).toBeTruthy();
        const recent = screen.getByRole("button", { name: "最近会话" });
        const clear = screen.getByRole("button", { name: "清空" });
        const view = screen.getByRole("button", { name: /视图/ });
        const refresh = screen.getByTitle("刷新当前面板");
        // 三按钮位于面板顶栏（PanelTitleBar）内。
        for (const el of [recent, clear, view]) {
            expect(titlebar?.contains(el)).toBe(true);
        }
        // 顺序：最近会话 → 清空 → 视图 → 刷新。
        expect(before(recent, clear)).toBe(true);
        expect(before(clear, view)).toBe(true);
        expect(before(view, refresh)).toBe(true);
    });

    it("t413 AC-001/002：无 session-rail-toggle-row；折叠按钮在侧栏头部，折叠/展开不变", async () => {
        render(<SessionShell />);
        await act(async () => {
            await Promise.resolve();
        });
        // AC-001：不再渲染独立空带行；页签栏之下直接内容区。
        expect(document.querySelector(".session-rail-toggle-row")).toBeNull();
        const topbar = document.querySelector(".session-topbar");
        const body = document.querySelector(".session-body");
        expect(topbar).toBeTruthy();
        expect(body).toBeTruthy();
        // 顶栏下一节点即 session-body（中间无 toggle-row）。
        expect(topbar?.nextElementSibling).toBe(body);

        const toggle = screen.getByRole("button", { name: "折叠槽位栏" });
        // AC-002：toggle 在侧栏头部行内，不在顶栏。
        expect(toggle.closest(".session-rail-header")).not.toBeNull();
        expect(toggle.closest(".session-rail")).not.toBeNull();
        expect(toggle.closest(".session-topbar")).toBeNull();
        const toggle_cls = toggle.className;
        expect(toggle_cls).toContain("session-rail-toggle");
        expect(toggle_cls).not.toContain("color-mix");

        expect(document.querySelector(".session-rail")?.className).not.toContain("collapsed");
        fireEvent.click(toggle);
        expect(document.querySelector(".session-rail")?.className).toContain("collapsed");
        fireEvent.click(screen.getByRole("button", { name: "展开槽位栏" }));
        expect(document.querySelector(".session-rail")?.className).not.toContain("collapsed");
    });
});
