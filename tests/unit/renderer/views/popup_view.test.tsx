import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PopupView, record_bool_equal } from "../../../../src/renderer/views/PopupView";

vi.mock("../../../../src/renderer/lib/theme", () => ({
    useTheme: () => undefined,
}));

import {
    FakeResizeObserver,
    connectorInfo,
    install_popup_usageboard,
    main_panel_get_mode,
    main_panel_hide,
    plugin_list,
    plugin_refresh,
    plugin_refresh_all,
    session_history_open,
    usage_log,
} from "./popup_view_test_utils";

describe("PopupView", () => {
    beforeEach(() => {
        install_popup_usageboard();
    });

    it("renders provider tabs without a CPA provider tab", async () => {
        render(<PopupView />);

        await waitFor(() => {
            expect(screen.getByRole("button", { name: /总览/ })).toBeInTheDocument();
        });

        expect(screen.getByRole("button", { name: /^Claude$/ })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /^DeepSeek$/ })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /^CPA$/ })).not.toBeInTheDocument();
    });

    it("shows update time in title bar instead of statusbar", async () => {
        render(<PopupView />);

        await waitFor(() => {
            expect(document.querySelector(".tb-time")).not.toBeNull();
        });
        expect(document.querySelector(".tb-time")?.textContent).toBeTruthy();
        expect(document.querySelector(".statusbar")).toBeNull();
    });

    it("refreshes every enabled connector for a provider", async () => {
        plugin_list.mockResolvedValue([
            connectorInfo({
                source: "gateway",
                sourceInstanceId: "cpa-1",
                supportedProviders: ["claude"],
                activeProviders: ["claude"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [
                        {
                            id: "claude-pro",
                            metric_id: "claude:claude-account:claude-pro",
                            provider: "claude",
                            source: "gateway",
                            sourceInstanceId: "cpa-1",
                            accountId: "claude-account",
                            accountLabel: "Claude Account",
                            raw_label: "claude-pro",
                            normalized_label: "Claude Pro",
                            used: 10,
                            limit: 100,
                            displayStyle: "percent",
                            resetAt: null,
                            observedAt: 1735689600000,
                            stale: false,
                            status: "normal",
                        },
                    ],
                },
            }),
            connectorInfo({
                source: "poll",
                sourceInstanceId: "claude-direct-1",
                supportedProviders: ["claude"],
                activeProviders: ["claude"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:01:00Z",
                    items: [],
                },
            }),
            connectorInfo({
                source: "poll",
                sourceInstanceId: "claude-disabled-1",
                supportedProviders: ["claude"],
                activeProviders: ["claude"],
                enabled: false,
            }),
            connectorInfo({
                source: "poll",
                sourceInstanceId: "kimi-direct-1",
                supportedProviders: ["kimi"],
                activeProviders: ["kimi"],
            }),
        ]);

        render(<PopupView />);

        const refreshButton = await screen.findByRole("button", { name: /刷新 Claude/ });
        fireEvent.click(refreshButton);

        await waitFor(() => {
            expect(plugin_refresh).toHaveBeenCalledTimes(2);
        });
        expect(plugin_refresh).toHaveBeenCalledWith("cpa-1");
        expect(plugin_refresh).toHaveBeenCalledWith("claude-direct-1");
        expect(plugin_refresh).not.toHaveBeenCalledWith("claude-disabled-1");
        expect(plugin_refresh).not.toHaveBeenCalledWith("kimi-direct-1");
    });

    it("opens settings for re-login when provider auth fails (t157)", async () => {
        plugin_list.mockResolvedValue([
            connectorInfo({
                source: "poll",
                sourceInstanceId: "kimi-direct-1",
                name: "kimi",
                displayName: "Kimi",
                supportedProviders: ["kimi"],
                activeProviders: ["kimi"],
                snapshot: {
                    status: "failed",
                    updatedAt: "2026-01-01T12:00:00Z",
                    error: "401 Unauthorized: token expired",
                    items: [],
                },
            }),
        ]);

        const settings_open = vi.fn();
        const cookie_login = vi.fn();
        window.usageboard.settings.open = settings_open;
        window.usageboard.auth.cookieLogin = cookie_login;

        render(<PopupView />);

        const re_login = await screen.findByText("重新登录");
        fireEvent.click(re_login);

        await waitFor(() => {
            expect(settings_open).toHaveBeenCalledWith({ instanceId: "poll-connector" });
        });
        expect(cookie_login).not.toHaveBeenCalled();
    });

    it("logs provider refresh failures", async () => {
        plugin_refresh.mockRejectedValueOnce(new Error("refresh failed"));

        render(<PopupView />);

        const refreshButton = await screen.findByRole("button", { name: /刷新 Claude/ });
        fireEvent.click(refreshButton);

        await waitFor(() => {
            expect(usage_log).toHaveBeenCalledWith({
                level: "error",
                module: "PopupView",
                message: "刷新 claude 失败: refresh failed",
            });
        });
    });

    it("logs refresh all failures", async () => {
        plugin_refresh_all.mockRejectedValueOnce(new Error("refresh all failed"));

        render(<PopupView />);

        const refreshButton = await screen.findByRole("button", { name: "刷新" });
        fireEvent.click(refreshButton);

        await waitFor(() => {
            expect(usage_log).toHaveBeenCalledWith({
                level: "error",
                module: "PopupView",
                message: "刷新全部失败: refresh all failed",
            });
        });
    });

    it("collapse toggle does not trigger provider refresh", async () => {
        render(<PopupView />);

        // Switch to Claude tab to see collapsible account rows
        const claude_tab = await screen.findByRole("button", { name: /^Claude$/ });
        fireEvent.click(claude_tab);

        const collapse_btn = await screen.findByRole("button", { name: /折叠 Claude Account/ });
        fireEvent.click(collapse_btn);

        // Collapse toggles are purely UI — no refresh should fire
        expect(plugin_refresh).not.toHaveBeenCalled();
        expect(plugin_refresh_all).not.toHaveBeenCalled();
    });

    it("collapse state does not affect aggregated provider data", async () => {
        render(<PopupView />);

        // Switch to Claude tab
        const claude_tab = await screen.findByRole("button", { name: /^Claude$/ });
        fireEvent.click(claude_tab);

        // Collapse an account — the data shown for other accounts stays the same
        const collapse_btn = await screen.findByRole("button", { name: /折叠 Claude Account/ });
        fireEvent.click(collapse_btn);

        // The collapsed card is hidden but other data stays
        await waitFor(() => {
            const expand_btn = screen.queryByRole("button", { name: /展开 Claude Account/ });
            expect(expand_btn).toBeInTheDocument();
        });
    });

    it("does not show the floating close button in popup mode", async () => {
        render(<PopupView />);

        await waitFor(() => {
            expect(main_panel_get_mode).toHaveBeenCalled();
        });

        expect(screen.queryByRole("button", { name: "隐藏用量面板" })).not.toBeInTheDocument();
    });

    it("shows the floating close button in floating mode and hides the main panel", async () => {
        main_panel_get_mode.mockResolvedValue("floating");

        render(<PopupView />);

        const close_btn = await screen.findByRole("button", { name: "隐藏用量面板" });
        fireEvent.click(close_btn);

        expect(main_panel_hide).toHaveBeenCalledTimes(1);
    });

    it("does not expose extra floating close buttons from mirror trees", async () => {
        const original_resize_observer = globalThis.ResizeObserver;
        (globalThis as Record<string, unknown>)["ResizeObserver"] = FakeResizeObserver;
        main_panel_get_mode.mockResolvedValue("floating");

        const view = render(<PopupView />);

        try {
            await waitFor(() => {
                expect(screen.getAllByRole("button", { name: "隐藏用量面板" }).length).toBe(1);
            });
        } finally {
            view.unmount();
            (globalThis as Record<string, unknown>)["ResizeObserver"] = original_resize_observer;
        }
    });

    it("shows account-level menu on account rows", async () => {
        render(<PopupView />);

        // Switch to Claude tab to see accounts
        const claude_tab = await screen.findByRole("button", { name: /^Claude$/ });
        fireEvent.click(claude_tab);

        await waitFor(() => {
            expect(screen.getAllByText("Claude Account").length).toBeGreaterThan(0);
        });

        // Account rows no longer expose account-level edit menu on main panel
        expect(screen.queryByLabelText("账号操作")).not.toBeInTheDocument();
    });

    it("account rows do not show hide, delete, or 关闭监控 menus", async () => {
        // P0-3：删除 accountOverrides.disabled 后，账号子行不再有"关闭监控"
        // 入口。隐藏由 hidden 覆盖，禁用按钮违反不变量 8（越层写破坏性状态）。
        // T8：主面板编辑入口也已移除。
        render(<PopupView />);

        const claude_tab = await screen.findByRole("button", { name: /^Claude$/ });
        fireEvent.click(claude_tab);

        await waitFor(() => {
            expect(screen.getAllByText("Claude Account").length).toBeGreaterThan(0);
        });

        expect(screen.queryByLabelText("账号操作")).not.toBeInTheDocument();
        expect(screen.queryByText("编辑")).not.toBeInTheDocument();
        expect(screen.queryByText("隐藏")).not.toBeInTheDocument();
        expect(screen.queryByText("删除")).not.toBeInTheDocument();
        expect(screen.queryByText("关闭监控")).not.toBeInTheDocument();
    });

    it("status bar relative time updates automatically via useNowTick", async () => {
        vi.useFakeTimers();
        try {
            const start = new Date("2026-01-01T12:05:30Z");
            vi.setSystemTime(start);

            // Capture the useNowTick timer callback to manually invoke it.
            const setInterval_spy = vi.spyOn(globalThis, "setInterval");
            render(<PopupView />);
            const tick = setInterval_spy.mock.calls[0]?.[0];
            setInterval_spy.mockRestore();

            // Flush initial async work and render.
            await act(async () => {
                await vi.advanceTimersByTimeAsync(0);
            });

            // Latest connector updatedAt: "2026-01-01T12:05:00Z" (DeepSeek).
            // At t=12:05:30 → "30 秒前".
            expect(tick).toBeDefined();
            expect(screen.queryAllByText("30 秒前").length).toBeGreaterThan(0);

            // Simulate 30s tick → "1 分钟前"
            vi.setSystemTime(new Date("2026-01-01T12:06:00Z"));
            act(() => {
                if (tick) tick();
            });
            expect(screen.queryAllByText("1 分钟前").length).toBeGreaterThan(0);
        } finally {
            vi.useRealTimers();
        }
    });

    it("shows empty state with add service prompt when no plugins configured", async () => {
        plugin_list.mockResolvedValue([]);
        render(<PopupView />);
        await waitFor(() => {
            expect(screen.getByText("还没有添加任何服务")).toBeInTheDocument();
        });
        const add_btn = screen.getByText("添加服务");
        expect(add_btn).toBeInTheDocument();
    });

    it("opens the session history window from the title bar button", async () => {
        session_history_open.mockClear();
        render(<PopupView />);
        await waitFor(() => {
            expect(document.querySelector(".tb-time")).not.toBeNull();
        });
        const btn = screen.getByRole("button", { name: "会话历史" });
        fireEvent.click(btn);
        expect(session_history_open).toHaveBeenCalledWith("", "", "");
    });

    it("hides the session history button in web mode", async () => {
        document.documentElement.dataset["web"] = "1";
        try {
            render(<PopupView />);
            await waitFor(() => {
                expect(document.querySelector(".tb-time")).not.toBeNull();
            });
            expect(screen.queryByRole("button", { name: "会话历史" })).toBeNull();
        } finally {
            delete document.documentElement.dataset["web"];
        }
    });
});

describe("record_bool_equal", () => {
    it("returns true for identical records", () => {
        expect(record_bool_equal({ a: true, b: false }, { a: true, b: false })).toBe(true);
    });

    it("returns true when key order differs", () => {
        expect(record_bool_equal({ a: true, b: false }, { b: false, a: true })).toBe(true);
    });

    it("returns false when values differ", () => {
        expect(record_bool_equal({ a: true }, { a: false })).toBe(false);
    });

    it("returns false when key counts differ", () => {
        expect(record_bool_equal({ a: true }, { a: true, b: false })).toBe(false);
    });

    it("returns true for empty records", () => {
        expect(record_bool_equal({}, {})).toBe(true);
    });
});
