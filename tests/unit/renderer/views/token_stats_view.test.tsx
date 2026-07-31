import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
    TokenStatsBucket,
    TokenStatsHeatmapCell,
    TokenStatsSession,
} from "../../../../src/shared/types/token-stats";
import { TokenStatsView } from "../../../../src/renderer/views/TokenStatsView";

const mocked_donuts = vi.hoisted(() => ({ centers: [] as string[] }));

vi.mock("../../../../src/renderer/components/token-stats/MetricDonut", () => ({
    MetricDonut: (props: { centerValue?: string }) => {
        mocked_donuts.centers.push(props.centerValue ?? "");
        return <div />;
    },
}));
const mocked_bar_chart = vi.hoisted(() => ({
    props: null as {
        gran: string;
        records?: unknown[];
        buckets?: { bucket_date: string }[];
        hourBuckets?: { hour_start: number }[];
    } | null,
}));

vi.mock("../../../../src/renderer/components/token-stats/BarChart", () => ({
    BarChart: (props: {
        gran: string;
        records?: unknown[];
        buckets?: { bucket_date: string }[];
        hourBuckets?: { hour_start: number }[];
    }) => {
        mocked_bar_chart.props = props;
        return <div />;
    },
}));
const mocked_heatmap = vi.hoisted(() => ({
    props: null as { cells?: TokenStatsHeatmapCell[] } | null,
}));

vi.mock("../../../../src/renderer/components/token-stats/Heatmap", () => ({
    Heatmap: (props: { cells?: TokenStatsHeatmapCell[] }) => {
        mocked_heatmap.props = props;
        return <div />;
    },
}));
vi.mock("../../../../src/renderer/components/token-stats/SessionTable", () => ({
    SessionTable: ({ rows }: { rows: { session_id: string }[] }) => (
        <div data-testid="session-records">{rows.map((r) => r.session_id).join(",")}</div>
    ),
}));
vi.mock("../../../../src/renderer/components/token-stats/RangePicker", () => ({
    RangePicker: () => <div />,
}));

function session(id: string, overrides: Partial<TokenStatsSession> = {}): TokenStatsSession {
    return {
        id,
        source: "claude_code",
        env: "win",
        model: "model-1",
        title: "Session",
        directory: "D:\\project",
        input_tokens: 100,
        output_tokens: 10,
        cache_read_tokens: 5,
        cache_write_tokens: 0,
        calls: 1,
        started_at: Date.now() - 1000,
        ended_at: Date.now(),
        ...overrides,
    };
}

function bucket(overrides: Partial<TokenStatsBucket> = {}): TokenStatsBucket {
    return {
        source: "claude_code",
        env: "win",
        bucket_date: "2026-07-29",
        model: "model-1",
        input_tokens: 100,
        output_tokens: 10,
        cache_read_tokens: 5,
        cache_write_tokens: 0,
        sessions: 1,
        calls: 1,
        ...overrides,
    };
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((resolver) => {
        resolve = resolver;
    });
    return { promise, resolve };
}

describe("TokenStatsView", () => {
    const get_records = vi.fn();
    const get_sessions = vi.fn();
    const get_buckets = vi.fn();
    const get_heatmap = vi.fn();
    const get_hour_buckets = vi.fn();

    beforeEach(() => {
        get_records.mockReset();
        get_sessions.mockReset();
        get_buckets.mockReset();
        get_heatmap.mockReset();
        get_hour_buckets.mockReset();
        mocked_bar_chart.props = null;
        mocked_heatmap.props = null;
        mocked_donuts.centers = [];
        get_records.mockResolvedValue([]);
        get_sessions.mockResolvedValue([]);
        get_buckets.mockResolvedValue([]);
        get_heatmap.mockResolvedValue([]);
        get_hour_buckets.mockResolvedValue([]);
        window.usageboard = {
            tokenStats: {
                open: vi.fn(),
                getBuckets: get_buckets,
                getSessions: get_sessions,
                getRecords: get_records,
                getHeatmap: get_heatmap,
                getHourBuckets: get_hour_buckets,
                getStatus: vi.fn().mockResolvedValue({ running: true, last_updated: null }),
                onUpdated: vi.fn(() => vi.fn()),
            },
            config: {
                get: vi.fn().mockResolvedValue({
                    config: { dirAliases: [], modelAliases: [] },
                    hasSecrets: {},
                }),
            },
            log: vi.fn(),
        } as unknown as typeof window.usageboard;
    });

    it("loads all platforms by default and switches between Win, WSL, and all", async () => {
        get_sessions
            .mockResolvedValueOnce([session("all-session")])
            .mockResolvedValueOnce([session("win-session")])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([session("all-again")]);

        render(<TokenStatsView />);
        const user = userEvent.setup();

        await waitFor(() => {
            expect(get_records).toHaveBeenNthCalledWith(1, expect.objectContaining({}));
        });
        expect(await screen.findByTestId("session-records")).toHaveTextContent("all-session");

        // Kimi Code option is present in the agent filter.
        expect(screen.getByRole("button", { name: "Kimi Code" })).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Win" }));
        await waitFor(() => {
            expect(get_records).toHaveBeenNthCalledWith(2, expect.objectContaining({ env: "win" }));
        });
        expect(await screen.findByTestId("session-records")).toHaveTextContent("win-session");

        await user.click(screen.getByRole("button", { name: "WSL" }));
        await waitFor(() => {
            expect(get_records).toHaveBeenNthCalledWith(3, expect.objectContaining({ env: "wsl" }));
        });
        expect(await screen.findByText("该筛选条件下暂无记录")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "全平台" }));
        await waitFor(() => {
            expect(get_records).toHaveBeenNthCalledWith(4, expect.objectContaining({}));
            expect(get_records).toHaveBeenNthCalledWith(
                4,
                expect.not.objectContaining({ env: "wsl" }),
            );
        });
        expect(await screen.findByTestId("session-records")).toHaveTextContent("all-again");
    });

    it("passes the current time window (start/end) to getRecords", async () => {
        const now = Date.now();
        const day = 86400000;
        get_records.mockResolvedValue([]);

        render(<TokenStatsView />);
        const user = userEvent.setup();
        await user.click(screen.getByRole("button", { name: "7 天" }));

        await waitFor(() => {
            const last_call = get_records.mock.calls.at(-1)?.[0] as {
                start?: number;
                end?: number;
            };
            expect(last_call).toBeDefined();
            const { start, end } = last_call;
            expect(typeof start).toBe("number");
            expect(typeof end).toBe("number");
            // 7d window: end ≈ now, start ≈ now - 7d
            expect(end).toBeGreaterThan(now - 5000);
            expect(start).toBeGreaterThan(now - 7 * day - 5000);
            expect(start).toBeLessThan(now - 7 * day + 5000);
        });
    });

    it("ignores an older platform response after a faster switch", async () => {
        const all_request = deferred<TokenStatsSession[]>();
        get_sessions.mockImplementation((filters: { env?: "win" | "wsl" }) => {
            if (filters.env === "wsl") {
                return Promise.resolve([session("wsl-session")]);
            }
            return all_request.promise;
        });

        render(<TokenStatsView />);
        const user = userEvent.setup();
        await user.click(screen.getByRole("button", { name: "WSL" }));

        expect(await screen.findByTestId("session-records")).toHaveTextContent("wsl-session");
        all_request.resolve([session("stale-all-session")]);

        await waitFor(() => {
            expect(screen.getByTestId("session-records")).toHaveTextContent("wsl-session");
        });
        expect(screen.getByTestId("session-records")).not.toHaveTextContent("stale-all-session");
    });

    it("shows period-over-period delta when the prior window has buckets", async () => {
        const now = Date.now();
        const today = new Date(now);
        const ymd = (d: Date) =>
            `${String(d.getUTCFullYear())}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
        const today_str = ymd(today);
        // prior bucket ~8 days ago
        const prior_date = new Date(now - 8 * 86400000);
        const prior_str = ymd(prior_date);
        get_buckets.mockResolvedValue([
            bucket({ bucket_date: today_str, input_tokens: 100, output_tokens: 50 }),
            bucket({ bucket_date: prior_str, input_tokens: 40, output_tokens: 20 }),
        ]);
        get_sessions.mockResolvedValue([
            session("current-session"),
            // A session in the prior 7d window so the session-count delta
            // (sourced from the sessions table) also has a prior value.
            session("prior-session", {
                started_at: now - 9 * 86400000,
                ended_at: now - 8 * 86400000,
            }),
        ]);

        render(<TokenStatsView />);
        const user = userEvent.setup();

        await user.click(screen.getByRole("button", { name: "7 天" }));

        // current-window session reaches the table
        expect(await screen.findByTestId("session-records")).toHaveTextContent("current-session");

        // KPI deltas must show a percentage arrow, not "前段无数据"
        await waitFor(() => {
            expect(screen.queryAllByText("前段无数据")).toHaveLength(0);
        });
        expect(screen.getAllByText(/▲|▼/).length).toBeGreaterThan(0);
    });

    it("derives 24h delta from records (not day-bucketed) so windows are symmetric", async () => {
        const now = Date.now();
        const hour = 3600000;
        // current window: 1 record ~1h ago; prior window: 1 record ~25h ago.
        // Return both across the 2x-wide records fetch ([now-48h, now]).
        get_records.mockImplementation((filters: { start?: number; end?: number }) => {
            const start = filters.start ?? 0;
            const end = filters.end ?? now;
            const recs: {
                session_id: string;
                timestamp: number;
                input_tokens: number;
                output_tokens: number;
            }[] = [];
            const cur = now - 1 * hour;
            const prev = now - 25 * hour;
            if (cur >= start && cur <= end) {
                recs.push({
                    session_id: "cur",
                    timestamp: cur,
                    input_tokens: 100,
                    output_tokens: 50,
                });
            }
            if (prev >= start && prev <= end) {
                recs.push({
                    session_id: "prev",
                    timestamp: prev,
                    input_tokens: 40,
                    output_tokens: 20,
                });
            }
            return Promise.resolve(
                recs.map((r) => ({
                    ...session(r.session_id),
                    timestamp: r.timestamp,
                    input_tokens: r.input_tokens,
                    output_tokens: r.output_tokens,
                })),
            );
        });
        // A bucket for today keeps the panel non-empty (render gate) while KPI
        // delta itself comes from records in the 24h branch.
        const today_str = `${String(new Date(now).getUTCFullYear())}-${String(
            new Date(now).getUTCMonth() + 1,
        ).padStart(2, "0")}-${String(new Date(now).getUTCDate()).padStart(2, "0")}`;
        get_buckets.mockResolvedValue([bucket({ bucket_date: today_str, sessions: 1 })]);
        get_sessions.mockResolvedValue([session("cur")]);

        render(<TokenStatsView />);
        const user = userEvent.setup();
        await user.click(screen.getByRole("button", { name: "24 小时" }));

        // current-window record must be reflected; delta must show an arrow
        // (not "前段无数据"), proving the prior 24h window has data via records.
        await waitFor(() => {
            expect(screen.queryAllByText("前段无数据")).toHaveLength(0);
        });
        expect(screen.getAllByText(/▲|▼/).length).toBeGreaterThan(0);
    });

    it("persists agent and preset selection across remount", async () => {
        get_sessions.mockResolvedValue([session("s")]);
        const user = userEvent.setup();

        const { unmount } = render(<TokenStatsView />);
        await user.click(screen.getByRole("button", { name: "7 天" }));
        unmount();

        const prefs = JSON.parse(localStorage.getItem("token-stats-prefs") ?? "{}") as {
            preset?: string;
        };
        expect(prefs.preset).toBe("7d");
    });

    it("passes the selected preset granularity to the bar chart", async () => {
        get_sessions.mockResolvedValue([session("s")]);
        get_buckets.mockResolvedValue([bucket()]);
        render(<TokenStatsView />);
        const user = userEvent.setup();

        await screen.findByTestId("session-records");
        expect(mocked_bar_chart.props?.gran).toBe("day");

        await user.click(screen.getByRole("button", { name: "24 小时" }));
        await waitFor(() => {
            expect(mocked_bar_chart.props?.gran).toBe("hour");
        });

        await user.click(screen.getByRole("button", { name: "1 月" }));
        await waitFor(() => {
            expect(mocked_bar_chart.props?.gran).toBe("day");
        });
    });

    it("feeds BarChart full multi-day buckets (not truncated records) on 7d window", async () => {
        // Regression (t164): 7d records (~137k rows on real installs) get
        // truncated by the fetch LIMIT, so the bar chart only showed the last
        // day or two. The fix routes the day-axis through buckets, which are
        // pre-aggregated and never truncated. This test mocks a wide buckets
        // set spanning the window and asserts BarChart receives it intact.
        const now = Date.now();
        const ymd = (offset_days: number) => {
            const d = new Date(now - offset_days * 86400000);
            return `${String(d.getUTCFullYear())}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
        };
        const wide_buckets = [0, 1, 2, 3, 4, 5, 6].map((i) =>
            bucket({ bucket_date: ymd(i), input_tokens: 100 * (i + 1) }),
        );
        // records deliberately empty (simulating full truncation) - BarChart
        // must still render via buckets.
        get_records.mockResolvedValue([]);
        get_buckets.mockResolvedValue(wide_buckets);
        get_sessions.mockResolvedValue([session("s")]);

        render(<TokenStatsView />);
        const user = userEvent.setup();
        await user.click(screen.getByRole("button", { name: "7 天" }));

        await waitFor(() => {
            const bar_buckets = mocked_bar_chart.props?.buckets;
            expect(bar_buckets).toBeDefined();
            expect(bar_buckets?.length).toBe(7);
        });
        // All 7 distinct days present (not collapsed to 1-2).
        const dates = new Set(mocked_bar_chart.props?.buckets?.map((b) => b.bucket_date));
        expect(dates.size).toBe(7);
    });

    it("feeds the Heatmap from the getHeatmap aggregate scoped to the window (not truncated records)", async () => {
        // Regression (t170/p010): the 7d Heatmap dropped early-week weekdays
        // because records were fetched ORDER BY DESC LIMIT 100000, cutting rows
        // before ~6h of recent activity. The Heatmap now consumes the SQL
        // weekday×hour aggregate directly, so the window's whole week is present
        // regardless of the records LIMIT.
        get_buckets.mockResolvedValue([bucket()]);
        get_sessions.mockResolvedValue([session("s")]);
        get_heatmap.mockResolvedValue([
            { weekday: 1, hour: 9, calls: 1, sessions: 1, tokens: 100 },
        ]);

        render(<TokenStatsView />);
        const user = userEvent.setup();
        await user.click(screen.getByRole("button", { name: "7 天" }));

        await waitFor(() => {
            expect(get_heatmap).toHaveBeenCalled();
            const last_call = get_heatmap.mock.calls.at(-1)?.[0] as
                | { start?: number; end?: number }
                | undefined;
            if (!last_call) throw new Error("expected getHeatmap to be called");
            const { start, end } = last_call;
            if (start === undefined || end === undefined) {
                throw new Error("expected getHeatmap window start/end");
            }
            const now = Date.now();
            const day = 86400000;
            // 7d window forwarded to the aggregate: end ≈ now, start ≈ now - 7d.
            expect(end).toBeGreaterThan(now - 5000);
            expect(end).toBeLessThanOrEqual(now);
            expect(start).toBeLessThanOrEqual(end - 7 * day);
            expect(start).toBeGreaterThan(end - 7 * day - 60000);
        });
        expect(mocked_heatmap.props?.cells).toEqual([
            { weekday: 1, hour: 9, calls: 1, sessions: 1, tokens: 100 },
        ]);
    });

    it("counts distinct sessions for the session KPI on wide windows (not bucket sum)", async () => {
        // Regression: buckets' `sessions` field is per-day-per-model distinct;
        // summing it across days double-counts a multi-day session. The session
        // KPI must count from the sessions table instead. Here 1 session spans
        // 3 buckets (3 days) -> KPI must show 1, not 3.
        const now = Date.now();
        const ymd = (offset_days: number) => {
            const d = new Date(now - offset_days * 86400000);
            return `${String(d.getUTCFullYear())}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
        };
        get_buckets.mockResolvedValue([
            // 3 day-buckets, each reports 7 distinct sessions for that day
            // (sum would be 21 — the bug). Only 1 real session spans them.
            bucket({ bucket_date: ymd(0), sessions: 7, calls: 100 }),
            bucket({ bucket_date: ymd(1), sessions: 7, calls: 100 }),
            bucket({ bucket_date: ymd(2), sessions: 7, calls: 100 }),
        ]);
        // One session overlapping the 7d window.
        get_sessions.mockResolvedValue([session("only-session")]);

        render(<TokenStatsView />);
        const user = userEvent.setup();
        await user.click(screen.getByRole("button", { name: "7 天" }));

        await waitFor(() => {
            // centers includes the distinct session count "1".
            expect(mocked_donuts.centers).toContain("1");
        });
        // The buggy bucket-summed session count (21) must not appear.
        expect(mocked_donuts.centers).not.toContain("21");
    });

    it("renders nav buttons to usage panel and settings", async () => {
        get_sessions.mockResolvedValue([session("s")]);
        render(<TokenStatsView />);
        await waitFor(() => expect(screen.getByText("代理面板")).toBeInTheDocument());
        expect(screen.getByRole("button", { name: "用量面板" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
    });

    it("feeds BarChart hour buckets on wide windows at hour granularity (t173)", async () => {
        // Regression: the hour bar must switch to the pre-aggregated
        // getHourBuckets source on >=7d windows; if the wiring regresses the
        // chart silently falls back to LIMIT-truncated records and drops early
        // hours again (parallel to the t164 day-buckets wiring test).
        const now = Date.now();
        const hour = 3600000;
        get_sessions.mockResolvedValue([session("s")]);
        get_hour_buckets.mockResolvedValue([
            { hour_start: now - hour, model: "model-1", calls: 2, sessions: 1, tokens: 100 },
        ]);
        render(<TokenStatsView />);
        const user = userEvent.setup();

        await user.click(screen.getByRole("button", { name: "7 天" }));
        await user.click(screen.getByRole("button", { name: "小时" }));

        await waitFor(() => {
            expect(get_hour_buckets).toHaveBeenCalled();
            const last_call = get_hour_buckets.mock.calls.at(-1)?.[0] as
                | { start?: number; end?: number }
                | undefined;
            expect(last_call?.start).toBeDefined();
            expect(last_call?.end).toBeDefined();
        });
        // The window must be forwarded to the aggregate (7d: end ≈ now, start ≈ now - 7d).
        const last_call = get_hour_buckets.mock.calls.at(-1)?.[0] as {
            start: number;
            end: number;
        };
        const day = 86400000;
        expect(last_call.end).toBeGreaterThan(now - 5000);
        expect(last_call.start).toBeLessThanOrEqual(last_call.end - 7 * day);
        expect(mocked_bar_chart.props?.hourBuckets).toBeDefined();
        expect(mocked_bar_chart.props?.hourBuckets?.length).toBeGreaterThan(0);
    });

    it("skips the hour bucket fetch on short windows and day granularity (t173)", async () => {
        // Prior tests persist prefs (incl. gran=hour) to localStorage; clear so
        // this test starts from the default day granularity.
        localStorage.clear();
        get_sessions.mockResolvedValue([session("s")]);
        render(<TokenStatsView />);
        const user = userEvent.setup();

        // Default 30d window at day granularity: no hour fetch.
        await screen.findByTestId("session-records");
        expect(get_hour_buckets).not.toHaveBeenCalled();

        // 24h (short window) at hour granularity: still no hour fetch.
        await user.click(screen.getByRole("button", { name: "24 小时" }));
        await waitFor(() => {
            expect(get_hour_buckets).not.toHaveBeenCalled();
        });
    });

    it("skips the hour bucket fetch when the bar axis is not time (t173)", async () => {
        // gran=hour retained while a project/session x-axis is active; the
        // hour aggregate would be fetched but never consumed by the chart.
        get_sessions.mockResolvedValue([session("s")]);
        render(<TokenStatsView />);
        const user = userEvent.setup();

        await user.click(screen.getByRole("button", { name: "7 天" }));
        await user.click(screen.getByRole("button", { name: "小时" }));
        // The hour branch is exercised once while the time axis is active.
        await waitFor(() => {
            expect(get_hour_buckets).toHaveBeenCalled();
        });
        get_hour_buckets.mockClear();

        // Switching to a project axis must not issue the (unconsumed) fetch.
        await user.click(screen.getByRole("button", { name: "项目" }));
        await waitFor(() => {
            expect(get_hour_buckets).not.toHaveBeenCalled();
        });
    });
});
