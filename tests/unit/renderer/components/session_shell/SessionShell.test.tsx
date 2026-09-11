import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { vi } from "vitest";
import { SessionShell } from "../../../../../src/renderer/components/session-shell/SessionShell";
import { install_history_usageboard } from "../../views/session_history_test_utils";

/**
 * P6 会话窗口外壳：默认会话库 + 同屏查看，无工作台页签。
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
    tokenStats: {
        open: MockFn;
        forceCollect: MockFn;
        getSessions: MockFn;
        getSessionStats: MockFn;
    };
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

describe("SessionShell (P6 library + compare)", () => {
    it("默认落在会话库，无工作台页签", async () => {
        render(<SessionShell />);
        await act(async () => {
            await Promise.resolve();
        });
        expect(screen.queryByRole("button", { name: "工作台" })).toBeNull();
        expect(screen.queryByRole("navigation", { name: "面板页签" })).toBeNull();
        expect(document.querySelector('[data-testid="library-view"]')).toBeTruthy();
        expect(document.querySelector('[data-pane="library"]')?.getAttribute("data-active")).toBe(
            "true",
        );
        expect(document.querySelector('[data-pane="compare"]')?.getAttribute("data-active")).toBe(
            "false",
        );
    });

    it("同屏查看进入 compare，返回会话库保留库视图挂载", async () => {
        const ub = usageboard();
        ub.tokenStats.getSessions.mockResolvedValue([
            {
                id: "lib_a",
                source: "opencode",
                env: "linux",
                title: "库会话A",
                model: "",
                directory: null,
                input_tokens: 1,
                output_tokens: 1,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                calls: 1,
                started_at: 1,
                ended_at: 2,
            },
            {
                id: "lib_b",
                source: "grok",
                env: "linux",
                title: "库会话B",
                model: "",
                directory: null,
                input_tokens: 1,
                output_tokens: 1,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                calls: 1,
                started_at: 1,
                ended_at: 3,
            },
        ] as never);
        ub.sessionHistory.query.mockResolvedValue({
            messages: [msg("m1", "user", "你好", 100)],
            next_cursor: null,
        });
        render(<SessionShell />);
        await waitFor(() => {
            expect(document.querySelector('[data-session-id="lib_a"]')).toBeTruthy();
        });
        fireEvent.click(screen.getByRole("button", { name: "会话 lib_a" }));
        fireEvent.click(screen.getByRole("button", { name: "会话 lib_b" }));
        expect(screen.getByText("已选 2 条")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /同屏查看/ }));

        await waitFor(() => {
            expect(document.querySelector('[data-testid="compare-view"]')).toBeTruthy();
        });
        expect(document.querySelector('[data-pane="compare"]')?.getAttribute("data-active")).toBe(
            "true",
        );
        expect(document.querySelector('[data-pane="library"]')?.getAttribute("data-active")).toBe(
            "false",
        );
        // 库仍挂载（hidden）
        expect(document.querySelector('[data-testid="library-view"]')).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "返回会话库" }));
        expect(document.querySelector('[data-pane="library"]')?.getAttribute("data-active")).toBe(
            "true",
        );
    });

    it("外部 onFocus 打开进入同屏查看", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({
            messages: [msg("m1", "user", "外部消息", 100)],
            next_cursor: null,
        });
        render(<SessionShell />);
        await act(async () => {
            await Promise.resolve();
        });
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "sess_a" });
        });
        await waitFor(() => {
            expect(document.querySelector('[data-testid="compare-view"]')).toBeTruthy();
        });
        await waitFor(() => screen.getByText("外部消息"));
        expect(document.querySelector('[data-testid="compare-panel"]')).toBeTruthy();
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

    it("P6：无工作台/会话库页签导航", async () => {
        render(<SessionShell />);
        await act(async () => {
            await Promise.resolve();
        });
        expect(screen.queryByRole("navigation", { name: "面板页签" })).toBeNull();
        expect(screen.queryByRole("button", { name: "工作台" })).toBeNull();
        expect(screen.queryByRole("button", { name: "会话库" })).toBeNull();
    });

    it("t315 AC1：根容器与顶栏背景为 surface-window", async () => {
        render(<SessionShell />);
        await act(async () => {
            await Promise.resolve();
        });
        const root = document.querySelector('[data-testid="session-shell"]');
        expect(root?.className).toContain("bg-[var(--color-surface-window)]");
        expect(root?.className).not.toContain("bg-[var(--color-surface)]");
        const topbar = document.querySelector('[data-testid="session-topbar"]');
        expect(topbar?.className).toContain("bg-[var(--color-surface-window)]");
        expect(topbar?.className).not.toContain("bg-[var(--color-surface)]");
    });

    it("顶栏刷新触发 forceCollect 与会话库重拉", async () => {
        const ub = usageboard();
        ub.tokenStats.getSessions.mockResolvedValue([
            {
                id: "s1",
                source: "claude_code",
                env: "win",
                title: "会话一",
                model: "",
                directory: null,
                input_tokens: 0,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                calls: 0,
                started_at: 1,
                ended_at: 1,
            },
        ] as never);
        render(<SessionShell />);
        await waitFor(() => screen.getByTestId("library-card"));
        const sessions_after_first = ub.tokenStats.getSessions.mock.calls.length;
        expect(sessions_after_first).toBeGreaterThan(0);

        fireEvent.click(screen.getByTitle("刷新当前面板"));
        await waitFor(() => {
            expect(ub.tokenStats.forceCollect).toHaveBeenCalled();
        });
        await waitFor(() => {
            expect(ub.tokenStats.getSessions.mock.calls.length).toBeGreaterThan(
                sessions_after_first,
            );
        });
    });

    it("无工作台三按钮与槽位栏", async () => {
        render(<SessionShell />);
        await act(async () => {
            await Promise.resolve();
        });
        expect(screen.queryByRole("button", { name: "最近会话" })).toBeNull();
        expect(document.querySelector('[data-testid="session-rail"]')).toBeNull();
        expect(document.querySelector(".session-rail-toggle-row")).toBeNull();
    });
});
