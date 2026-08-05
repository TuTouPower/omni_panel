import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
    TokenStatsDashboardDto,
    TokenStatsDashboardQuery,
    TokenStatsHeatmapCell,
} from "../../../../src/shared/types/token-stats";
import { TokenStatsView } from "../../../../src/renderer/views/TokenStatsView";

const mocked_bar_chart = vi.hoisted(() => ({
    props: null as { chartData?: TokenStatsDashboardDto["chart_data"] } | null,
}));
const mocked_heatmap = vi.hoisted(() => ({
    props: null as { cells?: TokenStatsHeatmapCell[] } | null,
}));
const mocked_metric_donut = vi.hoisted(() => ({
    props: [] as { centerValue?: string; segments?: { name: string; value: number }[] }[],
}));

vi.mock("../../../../src/renderer/components/token-stats/MetricDonut", () => ({
    MetricDonut: (props: {
        centerValue?: string;
        segments?: { name: string; value: number }[];
    }) => {
        mocked_metric_donut.props.push(props);
        return <div />;
    },
}));
vi.mock("../../../../src/renderer/components/token-stats/BarChart", () => ({
    BarChart: (props: { chartData?: TokenStatsDashboardDto["chart_data"] }) => {
        mocked_bar_chart.props = props;
        return <div />;
    },
}));
vi.mock("../../../../src/renderer/components/token-stats/Heatmap", () => ({
    Heatmap: (props: { cells?: TokenStatsHeatmapCell[] }) => {
        mocked_heatmap.props = props;
        return <div />;
    },
}));
vi.mock("../../../../src/renderer/components/token-stats/SessionTable", () => ({
    SessionTable: ({
        rows,
        totalRows,
        loadedOffset,
        onPageChange,
        onOpenSession,
    }: {
        rows: { session_id: string }[];
        totalRows?: number;
        loadedOffset?: number;
        onPageChange?: (offset: number) => void;
        onOpenSession?: (identity_key: string) => void;
    }) => (
        <div data-testid="session-records">
            {rows.map((row) => row.session_id).join(",")}
            <button
                type="button"
                data-testid="next-session-page"
                onClick={() => {
                    if (totalRows !== undefined && (loadedOffset ?? 0) === 0) {
                        onPageChange?.(100);
                    }
                }}
            >
                next-page
            </button>
            <button
                type="button"
                data-testid="open-session-row"
                onClick={() => {
                    onOpenSession?.("claude_code|win|initial");
                }}
            >
                open-session
            </button>
        </div>
    ),
}));
vi.mock("../../../../src/renderer/components/token-stats/RangePicker", () => ({
    RangePicker: ({ onApply }: { onApply?: (range: { start: number; end: number }) => void }) => (
        <button
            type="button"
            data-testid="apply-custom-range"
            onClick={() => onApply?.({ start: Date.now() - 3600000, end: Date.now() })}
        >
            apply-custom
        </button>
    ),
}));

const query: TokenStatsDashboardQuery = {
    agent: "all",
    platform: "all",
    start: 1_000,
    end: 2_000,
    metric: "tokens",
    xaxis: "time",
    gran: "day",
};

function dashboard(
    session_id: string,
    overrides: Partial<Pick<TokenStatsDashboardDto, "status">> = {},
): TokenStatsDashboardDto {
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
            rollup: [
                {
                    source: "claude_code",
                    model: "sonnet",
                    directory: "/project",
                    session_id,
                    title: "Session",
                    calls: 2,
                    input_tokens: 100,
                    output_tokens: 50,
                    cache_read_tokens: 30,
                    cache_write_tokens: 0,
                },
            ],
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
        status: { running: true, last_updated: null, ...overrides.status },
        freshness: { queried_at: 2_000, stale: false },
        data_version: 0,
    };
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((resolver) => {
        resolve = resolver;
    });
    return { promise, resolve };
}

describe("TokenStatsView dashboard query", () => {
    const get_dashboard = vi.fn();
    const get_records = vi.fn();
    const get_sessions = vi.fn();
    const get_buckets = vi.fn();
    const get_heatmap = vi.fn();
    const get_hour_buckets = vi.fn();
    const get_rollup = vi.fn();
    const get_dashboard_sessions = vi.fn();
    const get_config = vi.fn();
    const open_history = vi.fn();
    let updated_listener: ((dataVersion: number) => void) | null = null;

    beforeEach(() => {
        localStorage.clear();
        get_dashboard.mockReset();
        get_records.mockReset();
        get_sessions.mockReset();
        get_buckets.mockReset();
        get_heatmap.mockReset();
        get_hour_buckets.mockReset();
        get_rollup.mockReset();
        get_dashboard_sessions.mockReset();
        get_config.mockReset();
        open_history.mockReset();
        open_history.mockResolvedValue(undefined);
        updated_listener = null;
        mocked_bar_chart.props = null;
        mocked_heatmap.props = null;
        mocked_metric_donut.props = [];
        get_dashboard.mockResolvedValue(dashboard("initial"));
        get_config.mockResolvedValue({
            config: { dirAliases: [], modelAliases: [] },
            hasSecrets: {},
        });
        window.usageboard = {
            tokenStats: {
                open: vi.fn(),
                getDashboard: get_dashboard,
                getBuckets: get_buckets,
                getSessions: get_sessions,
                getRecords: get_records,
                getHeatmap: get_heatmap,
                getHourBuckets: get_hour_buckets,
                getRangeRollup: get_rollup,
                getDashboardSessions: get_dashboard_sessions,
                getStatus: vi.fn(),
                onUpdated: vi.fn((callback: (dataVersion: number) => void) => {
                    updated_listener = callback;
                    return vi.fn();
                }),
            },
            config: { get: get_config },
            event: { onConfigChange: vi.fn(() => vi.fn()) },
            log: vi.fn(),
            sessionHistory: { open: open_history },
        } as unknown as typeof window.usageboard;
    });

    it("uses one bounded dashboard request and renders all dashboard sections", async () => {
        render(<TokenStatsView />);

        expect(await screen.findByTestId("session-records")).toHaveTextContent("initial");
        expect(get_dashboard).toHaveBeenCalledTimes(1);
        expect(get_records).not.toHaveBeenCalled();
        expect(get_sessions).not.toHaveBeenCalled();
        expect(get_buckets).not.toHaveBeenCalled();
        expect(mocked_bar_chart.props?.chartData?.axis.labels).toEqual(["initial"]);
        expect(mocked_heatmap.props?.cells).toEqual([
            { weekday: 1, hour: 9, calls: 2, sessions: 1, tokens: 180 },
        ]);
    });

    it("sends one dashboard request when filters change without reading records", async () => {
        render(<TokenStatsView />);
        const user = userEvent.setup();
        await screen.findByTestId("session-records");

        await user.click(screen.getByRole("button", { name: "Win" }));
        await waitFor(() => {
            expect(get_dashboard).toHaveBeenCalledTimes(2);
        });

        const request = get_dashboard.mock.calls[1]?.[0] as TokenStatsDashboardQuery;
        expect(request.platform).toBe("win");
        expect(get_records).not.toHaveBeenCalled();
        expect(get_sessions).not.toHaveBeenCalled();
        expect(get_heatmap).not.toHaveBeenCalled();
    });

    it("t200 AC1: switching metric does not refetch the dashboard (display dims are renderer-derived)", async () => {
        render(<TokenStatsView />);
        const user = userEvent.setup();
        await screen.findByTestId("session-records");
        expect(get_dashboard).toHaveBeenCalledTimes(1);

        await user.click(screen.getByRole("button", { name: "Session" }));
        await waitFor(() => {
            expect(get_dashboard).toHaveBeenCalledTimes(1);
        });
        expect(mocked_bar_chart.props?.chartData).toBeTruthy();
    });

    it("t200 AC1: switching xaxis does not refetch the dashboard", async () => {
        render(<TokenStatsView />);
        const user = userEvent.setup();
        await screen.findByTestId("session-records");
        expect(get_dashboard).toHaveBeenCalledTimes(1);

        await user.click(screen.getByRole("button", { name: "项目" }));
        await waitFor(() => {
            expect(get_dashboard).toHaveBeenCalledTimes(1);
        });
    });

    it("AC1+AC2: offers a Grok agent filter and sends agent=grok to the dashboard", async () => {
        render(<TokenStatsView />);
        const user = userEvent.setup();
        await screen.findByTestId("session-records");

        // Filter control exposes a Grok entry (t198 AC1).
        expect(screen.getByRole("button", { name: "Grok" })).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Grok" }));
        await waitFor(() => {
            expect(get_dashboard).toHaveBeenCalledTimes(2);
        });

        const request = get_dashboard.mock.calls[1]?.[0] as TokenStatsDashboardQuery;
        expect(request.agent).toBe("grok");
    });

    it("AC4: renders without error after selecting grok when no grok data exists", async () => {
        render(<TokenStatsView />);
        const user = userEvent.setup();
        await screen.findByTestId("session-records");

        await user.click(screen.getByRole("button", { name: "Grok" }));
        await waitFor(() => {
            expect(get_dashboard).toHaveBeenCalledTimes(2);
        });

        // Fixture dashboard carries only claude_code data; selecting grok yields
        // an empty grok view that must not crash or leave a loading spinner.
        expect(get_dashboard.mock.calls[1]?.[0]).toMatchObject({ agent: "grok" });
        expect(screen.getByTestId("session-records")).toBeInTheDocument();
        expect(screen.queryByText("加载中...")).toBeNull();
    });

    it("keeps the previous DTO visible during a dashboard refresh", async () => {
        const pending = deferred<TokenStatsDashboardDto>();
        get_dashboard
            .mockResolvedValueOnce(dashboard("before"))
            .mockReturnValueOnce(pending.promise);
        render(<TokenStatsView />);
        const user = userEvent.setup();
        expect(await screen.findByTestId("session-records")).toHaveTextContent("before");

        await user.click(screen.getByRole("button", { name: "WSL" }));
        await waitFor(() => {
            expect(get_dashboard).toHaveBeenCalledTimes(2);
        });
        expect(screen.getByTestId("session-records")).toHaveTextContent("before");
        expect(screen.queryByText("加载中...")).toBeNull();
        expect(screen.getByTestId("token-stats-refreshing")).toHaveTextContent("刷新中...");

        pending.resolve(dashboard("after"));
        await waitFor(() => {
            expect(screen.getByTestId("session-records")).toHaveTextContent("after");
        });
    });

    it("refreshes the active dashboard query after collector update", async () => {
        get_dashboard
            .mockResolvedValueOnce(dashboard("before"))
            .mockResolvedValueOnce(dashboard("after"));
        render(<TokenStatsView />);
        expect(await screen.findByTestId("session-records")).toHaveTextContent("before");

        act(() => {
            updated_listener?.(0);
        });
        await waitFor(() => {
            expect(screen.getByTestId("session-records")).toHaveTextContent("after");
        });
        expect(get_dashboard).toHaveBeenCalledTimes(2);
    });

    it("AC4: reuses the cached dashboard when an update event reports the same data version", async () => {
        const fresh = dashboard("v5");
        fresh.data_version = 5;
        get_dashboard.mockResolvedValue(fresh);
        render(<TokenStatsView />);
        expect(await screen.findByTestId("session-records")).toHaveTextContent("v5");
        expect(get_dashboard).toHaveBeenCalledTimes(1);

        // Same version → cache already current, no revalidation request.
        act(() => {
            updated_listener?.(5);
        });
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(get_dashboard).toHaveBeenCalledTimes(1);
    });

    it("AC4: revalidates when an update event reports a newer data version", async () => {
        const fresh = dashboard("v5");
        fresh.data_version = 5;
        get_dashboard.mockResolvedValue(fresh);
        render(<TokenStatsView />);
        await screen.findByTestId("session-records");
        expect(get_dashboard).toHaveBeenCalledTimes(1);

        act(() => {
            updated_listener?.(6);
        });
        await waitFor(() => {
            expect(get_dashboard.mock.calls.length).toBeGreaterThan(1);
        });
    });

    it("reuses a cached dashboard when returning to the same filter combination", async () => {
        get_dashboard
            .mockResolvedValueOnce(dashboard("all"))
            .mockResolvedValueOnce(dashboard("win"));
        render(<TokenStatsView />);
        const user = userEvent.setup();
        await screen.findByTestId("session-records");

        await user.click(screen.getByRole("button", { name: "Win" }));
        await waitFor(() => {
            expect(screen.getByTestId("session-records")).toHaveTextContent("win");
        });
        await user.click(screen.getByRole("button", { name: "全平台" }));
        await waitFor(() => expect(screen.getByTestId("session-records")).toHaveTextContent("all"));
        expect(get_dashboard).toHaveBeenCalledTimes(2);
    });

    it("lists window models in the filter dropdown and defaults to all (t204)", async () => {
        const multi = dashboard("multi");
        multi.models = ["opus", "sonnet"];
        get_dashboard.mockResolvedValue(multi);
        render(<TokenStatsView />);
        await screen.findByTestId("session-records");

        const select = screen.getByLabelText("模型筛选");
        expect(select).toHaveValue("all");
        const options = screen.getAllByRole("option").map((option) => option.textContent);
        expect(options).toContain("全部模型");
        expect(options).toContain("sonnet");
        expect(options).toContain("opus");
    });

    it("selecting a model refetches the dashboard with the model and persists it (t204)", async () => {
        const multi = dashboard("multi");
        multi.models = ["opus", "sonnet"];
        get_dashboard.mockResolvedValue(multi);
        render(<TokenStatsView />);
        const user = userEvent.setup();
        await screen.findByTestId("session-records");
        expect(get_dashboard).toHaveBeenCalledTimes(1);

        await user.selectOptions(screen.getByLabelText("模型筛选"), "sonnet");
        await waitFor(() => {
            expect(get_dashboard).toHaveBeenCalledTimes(2);
        });
        const last_query = get_dashboard.mock.calls.at(-1)?.[0] as unknown as {
            model?: string;
        };
        expect(last_query.model).toBe("sonnet");
        // Prefs persisted: remounting keeps the model selection.
        const prefs = JSON.parse(localStorage.getItem("token-stats-prefs") ?? "{}") as {
            model?: string;
        };
        expect(prefs.model).toBe("sonnet");
    });

    it("model filter is part of the dashboard query cache key (t204)", async () => {
        const multi = dashboard("multi");
        multi.models = ["opus", "sonnet"];
        get_dashboard.mockResolvedValue(multi);
        render(<TokenStatsView />);
        const user = userEvent.setup();
        await screen.findByTestId("session-records");

        await user.selectOptions(screen.getByLabelText("模型筛选"), "sonnet");
        await waitFor(() => {
            expect(get_dashboard).toHaveBeenCalledTimes(2);
        });
        await user.selectOptions(screen.getByLabelText("模型筛选"), "opus");
        await waitFor(() => {
            expect(get_dashboard).toHaveBeenCalledTimes(3);
        });
        // Returning to sonnet hits the same cache entry (no refetch).
        await user.selectOptions(screen.getByLabelText("模型筛选"), "sonnet");
        await waitFor(() => {
            expect(get_dashboard).toHaveBeenCalledTimes(3);
        });
        // Back to all — the initial all-model entry is cached, no refetch either.
        await user.selectOptions(screen.getByLabelText("模型筛选"), "all");
        await waitFor(() => {
            expect(get_dashboard).toHaveBeenCalledTimes(3);
        });
    });

    it("restores the model selection from prefs on remount and refetches with it (t206 AC1)", async () => {
        const multi = dashboard("multi");
        multi.models = ["opus", "sonnet"];
        get_dashboard.mockResolvedValue(multi);
        const { unmount } = render(<TokenStatsView />);
        const user = userEvent.setup();
        await screen.findByTestId("session-records");
        await user.selectOptions(screen.getByLabelText("模型筛选"), "sonnet");
        await waitFor(() => {
            expect(get_dashboard).toHaveBeenLastCalledWith(
                expect.objectContaining({ model: "sonnet" }),
            );
        });
        // Remount: the fresh instance reads prefs and emits the model on its
        // first dashboard call (not the default "all").
        get_dashboard.mockClear();
        unmount();
        render(<TokenStatsView />);
        await screen.findByTestId("session-records");
        expect(get_dashboard).toHaveBeenCalledWith(expect.objectContaining({ model: "sonnet" }));
    });

    it("sends model and agent together (AND) and refreshes models on range change (t206 AC2)", async () => {
        const multi = dashboard("multi");
        multi.models = ["opus", "sonnet"];
        get_dashboard.mockResolvedValue(multi);
        render(<TokenStatsView />);
        const user = userEvent.setup();
        await screen.findByTestId("session-records");

        // Select model first, then agent — the resulting query carries both.
        await user.selectOptions(screen.getByLabelText("模型筛选"), "sonnet");
        await waitFor(() => {
            expect(get_dashboard).toHaveBeenLastCalledWith(
                expect.objectContaining({ model: "sonnet" }),
            );
        });
        await user.click(screen.getByRole("button", { name: "Grok" }));
        await waitFor(() => {
            expect(get_dashboard).toHaveBeenLastCalledWith(
                expect.objectContaining({ agent: "grok", model: "sonnet" }),
            );
        });

        // Switching the time range refetches; the returned models list drives
        // the dropdown (here still [opus, sonnet] from the mock).
        get_dashboard.mockClear();
        await user.click(screen.getByRole("button", { name: "7 天" }));
        await waitFor(() => {
            expect(get_dashboard).toHaveBeenCalled();
        });
        const options = screen.getAllByRole("option").map((option) => option.textContent);
        expect(options).toContain("sonnet");
        expect(options).toContain("opus");
    });

    it("loads aliases once and does not reread config when filters change", async () => {
        render(<TokenStatsView />);
        await screen.findByTestId("session-records");
        expect(get_config).toHaveBeenCalledTimes(1);

        await userEvent.setup().click(screen.getByRole("button", { name: "7 天" }));
        await waitFor(() => {
            expect(get_dashboard).toHaveBeenCalledTimes(2);
        });
        expect(get_config).toHaveBeenCalledTimes(1);
    });

    it("renders KPI and deltas from the current and previous summaries", async () => {
        render(<TokenStatsView />);
        expect(await screen.findByTestId("session-records")).toHaveTextContent("initial");

        // current.tokens=180 vs previous.tokens=90 → +100%; calls 2 vs 1 → +100%.
        expect(screen.getAllByText("▲ 100.0%").length).toBeGreaterThan(0);
        // The model donut receives the resolved current model totals.
        const token_segment = mocked_metric_donut.props.find((props) =>
            props.segments?.some((segment) => segment.name === "sonnet" && segment.value === 180),
        );
        expect(token_segment).toBeTruthy();
    });

    it("fetches the next session page through the sessions channel without refetching the dashboard (t200)", async () => {
        get_dashboard.mockResolvedValue(dashboard("page-1"));
        get_dashboard_sessions.mockResolvedValue({
            items: [
                {
                    session_id: "page-2",
                    source: "claude_code" as const,
                    env: "win" as const,
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
            total: 101,
            has_more: false,
        });
        render(<TokenStatsView />);
        const user = userEvent.setup();
        await screen.findByTestId("session-records");

        await user.click(screen.getByTestId("next-session-page"));
        await waitFor(() => {
            expect(get_dashboard_sessions).toHaveBeenCalledTimes(1);
        });
        const request = get_dashboard_sessions.mock.calls[0]?.[0] as TokenStatsDashboardQuery;
        expect(request.session_offset).toBe(100);
        // Pagination never re-requests the full dashboard.
        expect(get_dashboard).toHaveBeenCalledTimes(1);
        expect(await screen.findByTestId("session-records")).toHaveTextContent("page-2");
    });

    it("AC3: a committed data-version bump drops the stale paged session page", async () => {
        const v5 = dashboard("v5");
        v5.data_version = 5;
        const v6 = dashboard("v6");
        v6.data_version = 6;
        get_dashboard.mockResolvedValueOnce(v5).mockResolvedValueOnce(v6);
        get_dashboard_sessions.mockResolvedValue({
            items: [
                {
                    session_id: "page-2",
                    source: "claude_code" as const,
                    env: "win" as const,
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
            total: 101,
            has_more: false,
        });
        render(<TokenStatsView />);
        const user = userEvent.setup();
        await screen.findByTestId("session-records");

        await user.click(screen.getByTestId("next-session-page"));
        await waitFor(() => {
            expect(screen.getByTestId("session-records")).toHaveTextContent("page-2");
        });

        act(() => {
            updated_listener?.(6);
        });
        // The committed bump revalidates the dashboard; the paged list falls
        // back to the fresh dashboard's first page instead of the stale rows
        // (t200 AC3). A raced re-pull may fire once more, but never lands.
        await waitFor(() => {
            expect(screen.getByTestId("session-records")).toHaveTextContent("v6");
        });
        expect(screen.getByTestId("session-records")).not.toHaveTextContent("page-2");
        expect(get_dashboard_sessions.mock.calls.length).toBeLessThanOrEqual(2);
    });

    it("AC3: custom range + committed bump drops the stale paged session page", async () => {
        const v5 = dashboard("v5");
        v5.data_version = 5;
        const v6 = dashboard("v6");
        v6.data_version = 6;
        get_dashboard.mockResolvedValueOnce(v5).mockResolvedValue(v6);
        get_dashboard_sessions.mockResolvedValue({
            items: [
                {
                    session_id: "page-2",
                    source: "claude_code" as const,
                    env: "win" as const,
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
            total: 101,
            has_more: false,
        });
        render(<TokenStatsView />);
        const user = userEvent.setup();
        await screen.findByTestId("session-records");

        // Switch to a custom range: preset=null, the range is pinned (no
        // preset shift on updates), so only the onUpdated reset can drop the
        // stale page.
        await user.click(screen.getByTestId("apply-custom-range"));
        await waitFor(() => {
            expect(get_dashboard.mock.calls.length).toBeGreaterThanOrEqual(2);
        });
        await user.click(screen.getByTestId("next-session-page"));
        await waitFor(() => {
            expect(screen.getByTestId("session-records")).toHaveTextContent("page-2");
        });

        act(() => {
            updated_listener?.(7);
        });
        await waitFor(() => {
            expect(screen.getByTestId("session-records")).toHaveTextContent("v6");
        });
        expect(screen.getByTestId("session-records")).not.toHaveTextContent("page-2");
        expect(get_dashboard_sessions.mock.calls.length).toBeLessThanOrEqual(2);
    });

    it("keeps the newest filter when an older response resolves later", async () => {
        const all_pending = deferred<TokenStatsDashboardDto>();
        const wsl_pending = deferred<TokenStatsDashboardDto>();
        get_dashboard
            .mockReturnValueOnce(all_pending.promise)
            .mockReturnValueOnce(wsl_pending.promise);
        render(<TokenStatsView />);
        const user = userEvent.setup();

        await user.click(screen.getByRole("button", { name: "WSL" }));
        wsl_pending.resolve(dashboard("wsl"));
        await waitFor(() => {
            expect(screen.getByTestId("session-records")).toHaveTextContent("wsl");
        });
        all_pending.resolve(dashboard("all"));
        await waitFor(() => {
            expect(screen.getByTestId("session-records")).toHaveTextContent("wsl");
        });
    });

    it("AC3 (p034): an older in-flight response from before the update event never lands after the revalidation", async () => {
        // The update event must arrive while a query is already in-flight; the
        // guard drops its late response so the view never regresses to it.
        const first_pending = deferred<TokenStatsDashboardDto>();
        get_dashboard
            .mockReturnValueOnce(first_pending.promise)
            .mockResolvedValueOnce(dashboard("fresh"));
        render(<TokenStatsView />);

        // Event-triggered revalidation and the late stale response both settle
        // state updates; keep them inside act so no update escapes the wrapper.
        act(() => {
            updated_listener?.(1);
        });
        // The event-triggered revalidation resolves first; the stale in-flight
        // response from before the event must not overwrite it.
        await waitFor(() => {
            expect(get_dashboard).toHaveBeenCalledTimes(2);
        });
        await act(async () => {
            first_pending.resolve(dashboard("stale"));
            await Promise.resolve();
        });
        expect(screen.getByTestId("session-records")).toHaveTextContent("fresh");
        expect(screen.getByTestId("session-records")).not.toHaveTextContent("stale");
    });

    it("sends the resolved aliases with the dashboard query", async () => {
        get_config.mockResolvedValue({
            config: {
                dirAliases: [{ alias: "A", dirs: ["/p"] }],
                modelAliases: [{ alias: "M", models: ["sonnet"] }],
            },
            hasSecrets: {},
        });
        render(<TokenStatsView />);
        await screen.findByTestId("session-records");

        await waitFor(() => {
            expect(get_dashboard).toHaveBeenCalledTimes(2);
        });
        const request = get_dashboard.mock.calls[1]?.[0] as TokenStatsDashboardQuery;
        expect(request.dir_aliases).toEqual([{ alias: "A", keys: ["/p"] }]);
        expect(request.model_aliases).toEqual([{ alias: "M", keys: ["sonnet"] }]);
    });

    it("opens the session history window from the header nav button", async () => {
        render(<TokenStatsView />);
        await screen.findByTestId("session-records");

        fireEvent.click(screen.getByRole("button", { name: /到会话历史/ }));

        expect(open_history).toHaveBeenCalledWith("", "", "");
    });

    it("hides the session-history nav button in web mode (dead-button convention)", async () => {
        document.documentElement.dataset["web"] = "1";
        try {
            render(<TokenStatsView />);
            await screen.findByTestId("session-records");
            expect(screen.queryByRole("button", { name: /到会话历史/ })).toBeNull();
        } finally {
            delete document.documentElement.dataset["web"];
        }
    });

    it("opens the session history window from a session row click", async () => {
        render(<TokenStatsView />);
        await screen.findByTestId("session-records");

        fireEvent.click(screen.getByTestId("open-session-row"));

        expect(open_history).toHaveBeenCalledWith("claude_code", "win", "initial");
    });
});
