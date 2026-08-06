import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { vi } from "vitest";
import { SessionShell } from "../../../../../src/renderer/components/session-shell/SessionShell";
import { SESSION_THEME_KEY } from "../../../../../src/renderer/lib/session-shell/theme";
import { install_history_usageboard } from "../../views/session_history_test_utils";

/**
 * t223 会话窗口单壳双页签外壳测试。
 * 覆盖 AC：页签切换与内部状态保留、主题切换与持久化、跳转按钮 IPC、
 * 会话库空态占位、无命令面板/拖文件导入入口。
 */

const THEME_KEY = SESSION_THEME_KEY;

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
    it("默认落在工作台页签，渲染会话历史视图", () => {
        render(<SessionShell />);
        expect(screen.getByRole("button", { name: "工作台" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "会话库" })).toBeTruthy();
        expect(screen.getByText(/未打开会话/)).toBeTruthy();
        expect(document.querySelector('[data-pane="workspace"]')?.getAttribute("data-active")).toBe(
            "true",
        );
        expect(document.querySelector('[data-pane="library"]')?.getAttribute("data-active")).toBe(
            "false",
        );
    });

    it("切换到会话库显示空态占位，工作台隐藏但保持挂载", () => {
        render(<SessionShell />);
        fireEvent.click(screen.getByRole("button", { name: "会话库" }));
        expect(screen.getByText(/会话库为空|尚未有会话|即将上线/)).toBeTruthy();
        expect(document.querySelector('[data-pane="workspace"]')?.getAttribute("data-active")).toBe(
            "false",
        );
        expect(document.querySelector('[data-pane="library"]')?.getAttribute("data-active")).toBe(
            "true",
        );
        // 工作台内容仍在 DOM（display 隐藏而非卸载）
        expect(screen.getByText(/未打开会话/)).toBeTruthy();
    });

    it("切回工作台后已打开会话的栏状态保留", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({
            messages: [msg("m1", "user", "你好", 100)],
            next_cursor: null,
        });
        render(<SessionShell />);
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

    it("全新默认暗色：html data-theme=dark", () => {
        render(<SessionShell />);
        expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });

    it("预存 light 时初始浅色主题", () => {
        localStorage.setItem(THEME_KEY, "light");
        render(<SessionShell />);
        expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });

    it("主题切换按钮更新 data-theme 并持久化", () => {
        render(<SessionShell />);
        fireEvent.click(screen.getByTitle("切换到浅色模式"));
        expect(document.documentElement.getAttribute("data-theme")).toBe("light");
        expect(localStorage.getItem(THEME_KEY)).toBe("light");
        fireEvent.click(screen.getByTitle("切换到暗色模式"));
        expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
        expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    });

    it("顶栏跳转按钮调用用量/代理面板 IPC", () => {
        const ub = usageboard();
        render(<SessionShell />);
        fireEvent.click(screen.getByTestId("shell-open-usage"));
        expect(ub.tray.open_panel).toHaveBeenCalled();
        fireEvent.click(screen.getByTestId("shell-open-token"));
        expect(ub.tokenStats.open).toHaveBeenCalled();
    });

    it("窗口内无命令面板与拖文件导入入口", () => {
        render(<SessionShell />);
        expect(screen.queryByText("命令面板")).toBeNull();
        expect(screen.queryByText(/⌘/)).toBeNull();
        expect(screen.queryByText(/拖文件|拖拽导入|import/i)).toBeNull();
    });
});
