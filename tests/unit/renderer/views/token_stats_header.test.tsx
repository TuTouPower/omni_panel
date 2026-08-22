import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
    TokenStatsDashboardDto,
    TokenStatsDashboardQuery,
} from "../../../../src/shared/types/token-stats";
import { TokenStatsView } from "../../../../src/renderer/views/TokenStatsView";

vi.mock("../../../../src/renderer/components/token-stats/MetricDonut", () => ({
    MetricDonut: () => <div />,
}));
vi.mock("../../../../src/renderer/components/token-stats/BarChart", () => ({
    BarChart: () => <div />,
}));
vi.mock("../../../../src/renderer/components/token-stats/Heatmap", () => ({
    Heatmap: () => <div />,
}));
vi.mock("../../../../src/renderer/components/token-stats/SessionTable", () => ({
    SessionTable: ({ rows }: { rows: { session_id: string }[] }) => (
        <div data-testid="session-records">{rows[0]?.session_id ?? "empty"}</div>
    ),
}));
// RangePicker 不 mock：t312 需验证「选中自定义 → 弹出真实面板」。

const query: TokenStatsDashboardQuery = {
    agent: "all",
    platform: "all",
    start: 1_000,
    end: 2_000,
    metric: "tokens",
    xaxis: "time",
    gran: "day",
};

function dashboard(session_id: string): TokenStatsDashboardDto {
    const summary = {
        tokens: 180,
        sessions: 1,
        calls: 2,
        input_tokens: 100,
        output_tokens: 50,
        cache_read_tokens: 30,
        cache_write_tokens: 0,
        agent_totals: [{ key: "claude-code", value: 180 }],
        model_token_totals: [{ key: "sonnet", value: 180 }],
        model_call_totals: [{ key: "sonnet", value: 2 }],
        project_session_totals: [{ key: "/project", value: 1 }],
    };
    return {
        query,
        current: summary,
        previous: { ...summary, tokens: 90, calls: 1 },
        chart_data: {
            axis: { labels: [session_id], bucket_starts: [1_000] },
            metric_buckets: [{ hour_start: 1_000, model: "sonnet", calls: 2, tokens: 180 }],
            session_buckets: [{ hour_start: 1_000, directory: "/project", sessions: 1 }],
            rollup: [],
        },
        heatmap: [{ weekday: 1, hour: 9, calls: 2, sessions: 1, tokens: 180 }],
        models: ["sonnet"],
        sessions: {
            items: [
                {
                    session_id,
                    source: "claude_code",
                    env: "win",
                    title: "Session",
                    directory: "/project",
                    models: ["sonnet"],
                    input_tokens: 100,
                    output_tokens: 50,
                    cache_read_tokens: 30,
                    cache_write_tokens: 0,
                    calls: 2,
                    started_at: 1_000,
                    ended_at: 1_500,
                },
            ],
            total: 1,
            has_more: false,
        },
        status: { running: true, last_updated: null },
        freshness: { queried_at: 2_000, stale: false },
        data_version: 0,
    };
}

describe("TokenStatsView header single row (t312)", () => {
    const get_dashboard = vi.fn();
    const get_config = vi.fn();
    const open_settings = vi.fn();
    const open_tray_panel = vi.fn();
    const open_history = vi.fn();
    const open_token_stats = vi.fn();
    let updated_listener: ((dataVersion: number) => void) | null = null;

    beforeEach(() => {
        localStorage.clear();
        get_dashboard.mockReset();
        get_config.mockReset();
        open_settings.mockReset();
        open_tray_panel.mockReset();
        open_history.mockReset();
        open_token_stats.mockReset();
        updated_listener = null;
        get_dashboard.mockResolvedValue(dashboard("initial"));
        get_config.mockResolvedValue({
            config: { dirAliases: [], modelAliases: [] },
            hasSecrets: {},
        });
        window.usageboard = {
            tokenStats: {
                open: open_token_stats,
                getSessionStats: vi.fn().mockResolvedValue({ sessions: 0, agents: 0, tokens: 0 }),
                getDashboard: get_dashboard,
                getBuckets: vi.fn(),
                getSessions: vi.fn(),
                getRecords: vi.fn(),
                getHeatmap: vi.fn(),
                getHourBuckets: vi.fn(),
                getRangeRollup: vi.fn(),
                getDashboardSessions: vi.fn(),
                getStatus: vi.fn(),
                onUpdated: vi.fn((callback: (dataVersion: number) => void) => {
                    updated_listener = callback;
                    return vi.fn();
                }),
            },
            config: { get: get_config },
            event: { onConfigChange: vi.fn(() => vi.fn()), onThemeChange: vi.fn(() => vi.fn()) },
            log: vi.fn(),
            sessionHistory: { open: open_history },
            settings: { open: open_settings, openConnectorsDir: vi.fn() },
            tray: { open_panel: open_tray_panel },
        } as unknown as typeof window.usageboard;
    });

    it("AC-001: 标题栏单行包含 logo/标题/刷新时间/四个下拉/四个按钮", async () => {
        render(<TokenStatsView />);
        await screen.findByTestId("session-records");

        const logo = screen.getByAltText("OmniPanel");
        expect(logo).toBeInTheDocument();
        expect(screen.getByTestId("app-title")).toHaveTextContent("Omni Panel - Agent");

        const agentSelect = screen.getByLabelText("工具筛选");
        const platformSelect = screen.getByLabelText("平台筛选");
        const modelSelect = screen.getByLabelText("模型筛选");
        const rangeSelect = screen.getByLabelText("时间范围");
        const refreshBtn = screen.getByRole("button", { name: "刷新" });
        const settingsBtn = screen.getByRole("button", { name: "Settings面板" });
        const usageBtn = screen.getByRole("button", { name: "Usage面板" });
        const agentBtn = screen.getByRole("button", { name: "Agent面板" });
        const sessionBtn = screen.getByRole("button", { name: "Session面板" });

        // 单行：所有元素落在同一个标题栏容器内。
        const titlebar = screen.getByTestId("app-title").closest("[data-panel-titlebar]");
        expect(titlebar).not.toBeNull();
        for (const el of [
            logo,
            agentSelect,
            platformSelect,
            modelSelect,
            rangeSelect,
            refreshBtn,
            settingsBtn,
            usageBtn,
            agentBtn,
            sessionBtn,
        ]) {
            expect(el.closest("[data-panel-titlebar]")).toBe(titlebar);
        }

        // t380 AC-001: 导航按钮顺序固定「刷新 设置 用量 代理 会话」，刷新在首位。
        // 排除筛选器/窗口控制按钮（center 插槽的 RangePicker 触发、Select 等无
        // aria-label 的按钮），只取导航组（刷新 + 四面板切换 + 窗口控制）。
        const nav_labels = new Set([
            "刷新",
            "Settings面板",
            "Usage面板",
            "Agent面板",
            "Session面板",
        ]);
        const nav_buttons = Array.from(titlebar?.querySelectorAll("button") ?? [])
            .map((b) => b.getAttribute("aria-label") ?? "")
            .filter((label) => nav_labels.has(label));
        expect(nav_buttons).toEqual([
            "刷新",
            "Settings面板",
            "Usage面板",
            "Agent面板",
            "Session面板",
        ]);
    });

    it("AC-001: 刷新时间（刷新中）在标题栏内渲染", async () => {
        // t312_test_f001: 事件重取 pending 时「刷新中」标记出现在标题栏。
        // 不点刷新按钮——点击会与 onUpdated 自动重取竞速（reviewer 确认因果
        // 倒置），标记渲染本身由 pending 请求驱动，事件路径确定。
        const pending = new Promise<never>(() => undefined);
        get_dashboard.mockResolvedValueOnce(dashboard("initial")).mockReturnValueOnce(pending);
        render(<TokenStatsView />);
        await screen.findByTestId("session-records");

        // 事件重取（revision bump → currentRange 变化 → loadData 重发请求）挂起。
        act(() => {
            updated_listener?.(1);
        });
        expect(await screen.findByTestId("token-stats-refreshing")).toBeInTheDocument();
        expect(
            screen.getByTestId("token-stats-refreshing").closest("[data-panel-titlebar]"),
        ).not.toBeNull();
    });

    it("AC-001: 工具/平台/时间范围为 Select 下拉（非 Segmented）", async () => {
        render(<TokenStatsView />);
        await screen.findByTestId("session-records");

        expect(screen.getByLabelText("工具筛选").tagName).toBe("SELECT");
        expect(screen.getByLabelText("平台筛选").tagName).toBe("SELECT");
        expect(screen.getByLabelText("时间范围").tagName).toBe("SELECT");
        // Segmented 渲染 role=button；改造后这些选项只存在于下拉中。
        expect(screen.queryByRole("button", { name: "Claude Code" })).toBeNull();
        expect(screen.queryByRole("button", { name: "WSL" })).toBeNull();
        expect(screen.queryByRole("button", { name: "24 小时" })).toBeNull();
    });

    it("AC-001: 时间范围下拉含 24小时/7天/1月/自定义", async () => {
        render(<TokenStatsView />);
        await screen.findByTestId("session-records");

        const range = screen.getByLabelText<HTMLSelectElement>("时间范围");
        const options = [...range.options].map((o) => ({
            value: o.value,
            label: o.textContent,
        }));
        expect(options).toEqual([
            { value: "24h", label: "24 小时" },
            { value: "7d", label: "7 天" },
            { value: "30d", label: "1 月" },
            { value: "custom", label: "自定义" },
        ]);
    });

    it("AC-002: 工具下拉选择 Claude Code 过滤生效", async () => {
        render(<TokenStatsView />);
        const user = userEvent.setup();
        await screen.findByTestId("session-records");

        await user.selectOptions(screen.getByLabelText("工具筛选"), "claude-code");
        await waitFor(() => {
            expect(get_dashboard).toHaveBeenLastCalledWith(
                expect.objectContaining({ agent: "claude-code" }),
            );
        });
    });

    it("AC-002: 平台下拉选择 WSL 过滤生效", async () => {
        render(<TokenStatsView />);
        const user = userEvent.setup();
        await screen.findByTestId("session-records");

        await user.selectOptions(screen.getByLabelText("平台筛选"), "wsl");
        await waitFor(() => {
            expect(get_dashboard).toHaveBeenLastCalledWith(
                expect.objectContaining({ platform: "wsl" }),
            );
        });
    });

    it("AC-003: 时间范围下拉选择 7 天生效", async () => {
        render(<TokenStatsView />);
        const user = userEvent.setup();
        await screen.findByTestId("session-records");
        expect(get_dashboard).toHaveBeenCalledTimes(1);

        await user.selectOptions(screen.getByLabelText("时间范围"), "7d");
        await waitFor(() => {
            expect(get_dashboard).toHaveBeenCalledTimes(2);
        });
        const request = get_dashboard.mock.calls[1]?.[0] as TokenStatsDashboardQuery;
        // 近 7 天窗口；7d 默认按天聚合。
        expect(request.end - request.start).toBe(7 * 24 * 3600000);
        expect(request.gran).toBe("day");
    });

    it("AC-003: 挂载默认即 1月（30d）窗口（t312_test_f002）", async () => {
        // 30d 是默认 preset：挂载首次请求即为近 30 天窗口，无需切换。
        render(<TokenStatsView />);
        await screen.findByTestId("session-records");
        expect(get_dashboard).toHaveBeenCalledTimes(1);
        const request = get_dashboard.mock.calls[0]?.[0] as TokenStatsDashboardQuery;
        expect(request.end - request.start).toBe(30 * 24 * 3600000);
        expect(request.gran).toBe("day");
        // 下拉显示「1 月」。
        expect(screen.getByLabelText("时间范围")).toHaveValue("30d");
    });

    it("AC-003: 选择自定义弹出 RangePicker，应用后按自定义范围查询", async () => {
        render(<TokenStatsView />);
        const user = userEvent.setup();
        await screen.findByTestId("session-records");

        // 模拟选中「自定义」（select change 事件；userEvent 的 jsdom 序列会
        // 在 change 后补发 click，触发 RangePicker 的点击外部关闭逻辑）。
        fireEvent.change(screen.getByLabelText("时间范围"), { target: { value: "custom" } });
        // 真实 RangePicker 面板弹出（含日期输入与应用按钮）。
        expect(await screen.findByRole("button", { name: "应用" })).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "应用" }));
        await waitFor(() => {
            expect(get_dashboard.mock.calls.length).toBeGreaterThanOrEqual(2);
        });
        const request = get_dashboard.mock.calls.at(-1)?.[0] as TokenStatsDashboardQuery;
        expect(request.start).toBeLessThan(request.end);
        // 自定义状态保留：下拉仍显示「自定义」。
        expect(screen.getByLabelText("时间范围")).toHaveValue("custom");
    });

    it("AC-004: fresh 缓存下点刷新不重复请求（t312_test_f001）", async () => {
        get_dashboard
            .mockResolvedValueOnce(dashboard("before"))
            .mockResolvedValueOnce(dashboard("after"));
        render(<TokenStatsView />);
        const user = userEvent.setup();
        await screen.findByTestId("session-records");
        expect(get_dashboard).toHaveBeenCalledTimes(1);

        // 事件重取完成 → 缓存 fresh。
        act(() => {
            updated_listener?.(1);
        });
        await waitFor(() => {
            expect(get_dashboard).toHaveBeenCalledTimes(2);
        });

        // fresh 缓存下点刷新：query_cache 命中 fresh，不产生新请求。
        await user.click(screen.getByRole("button", { name: "刷新" }));
        await waitFor(() => {
            expect(get_dashboard).toHaveBeenCalledTimes(2);
        });
    });

    it("AC-004: 缓存失效后点刷新触发新请求并上屏（t312_test_f001）", async () => {
        // 事件重取 reject → 缓存保持 stale、inflight 清理；点刷新重新请求。
        get_dashboard
            .mockResolvedValueOnce(dashboard("before"))
            .mockRejectedValueOnce(new Error("transient"))
            .mockResolvedValueOnce(dashboard("after"));
        render(<TokenStatsView />);
        const user = userEvent.setup();
        await screen.findByTestId("session-records");
        expect(get_dashboard).toHaveBeenCalledTimes(1);

        // 事件触发重取失败（缓存 stale、inflight 清理、UI 保持旧数据）。
        act(() => {
            updated_listener?.(1);
        });
        await waitFor(() => {
            expect(get_dashboard).toHaveBeenCalledTimes(2);
        });
        expect(screen.getByTestId("session-records")).toHaveTextContent("before");

        // 点刷新 → 缓存 stale → 重新请求 → 新数据上屏。
        await user.click(screen.getByRole("button", { name: "刷新" }));
        await waitFor(() => {
            expect(screen.getByTestId("session-records")).toHaveTextContent("after");
        });
        expect(get_dashboard).toHaveBeenCalledTimes(3);
    });

    it("AC-004: 设置/用量面板/会话历史按钮导航", async () => {
        const user = userEvent.setup();
        render(<TokenStatsView />);
        await screen.findByTestId("session-records");

        await user.click(screen.getByRole("button", { name: "Settings面板" }));
        expect(open_settings).toHaveBeenCalled();

        await user.click(screen.getByRole("button", { name: "Usage面板" }));
        expect(open_tray_panel).toHaveBeenCalled();

        // Agent 自身按钮：聚焦本面板（tokenStats.open），不关面板。
        await user.click(screen.getByRole("button", { name: "Agent面板" }));
        expect(open_token_stats).toHaveBeenCalled();

        await user.click(screen.getByRole("button", { name: "Session面板" }));
        expect(open_history).toHaveBeenCalledWith("", "", "");
    });

    it("web 态互跳按钮渲染为原生链接，href 精确且无 onClick（t311 AC-001/AC-004）", async () => {
        document.documentElement.setAttribute("data-web", "1");
        try {
            render(<TokenStatsView />);
            await screen.findByTestId("session-records");

            const settings_link = screen.getByRole("link", { name: "Settings面板" });
            expect(settings_link.tagName).toBe("A");
            expect(settings_link).toHaveAttribute("href", "#setting");
            const usage_link = screen.getByRole("link", { name: "Usage面板" });
            expect(usage_link.tagName).toBe("A");
            expect(usage_link).toHaveAttribute("href", "#usage");
            const agent_link = screen.getByRole("link", { name: "Agent面板" });
            expect(agent_link.tagName).toBe("A");
            expect(agent_link).toHaveAttribute("href", "#agent");
            const session_link = screen.getByRole("link", { name: "Session面板" });
            expect(session_link.tagName).toBe("A");
            expect(session_link).toHaveAttribute("href", "#session");
            // AC-004 静态前提：无 onClick 拦截。React 合成事件不渲染 onclick
            // attribute（恒真断言无意义）；可失败断言——点击链接不触发
            // open 桥（若实现误在 <a> 上挂 onClick 会调 open_tray_panel/
            // open_history），默认导航透传由 e2e hash 断言覆盖。
            usage_link.click();
            expect(open_tray_panel).not.toHaveBeenCalled();
            session_link.click();
            expect(open_history).not.toHaveBeenCalled(); // 刷新按钮与四个下拉保持原控件形态。
            expect(screen.getByRole("button", { name: "刷新" })).toBeInTheDocument();
        } finally {
            document.documentElement.removeAttribute("data-web");
        }
    });
});
