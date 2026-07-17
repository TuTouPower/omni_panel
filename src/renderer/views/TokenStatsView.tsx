import { useState, useEffect, useCallback, useMemo } from "react";
import type { TokenStatsBucket, TokenStatsSession } from "../../shared/types/token-stats";
import type { TokenStatsStatus } from "../../shared/types/ipc";
import { useTheme } from "../lib/theme";

const MODULE = "TokenStatsView";

type TimeRange = "7d" | "30d" | "month" | "all";
type EnvFilter = "all" | "win" | "wsl";
type SourceFilter = "all" | "claude_code" | "opencode";

const TIME_RANGES: { value: TimeRange; label: string }[] = [
    { value: "7d", label: "近 7 天" },
    { value: "30d", label: "近 30 天" },
    { value: "month", label: "本月" },
    { value: "all", label: "全部" },
];
const SOURCES: { value: SourceFilter; label: string }[] = [
    { value: "all", label: "全部来源" },
    { value: "claude_code", label: "Claude Code" },
    { value: "opencode", label: "OpenCode" },
];
const ENVS: { value: EnvFilter; label: string }[] = [
    { value: "all", label: "全部环境" },
    { value: "win", label: "Win" },
    { value: "wsl", label: "WSL" },
];

// Theme-aware model palette (globals.css tokens)
const MODEL_COLORS = ["var(--blue)", "var(--purple)", "var(--green)", "var(--amber)", "var(--red)"];
const MAX_LEGEND_ITEMS = 15;

export function TokenStatsView() {
    useTheme();

    const [buckets, setBuckets] = useState<TokenStatsBucket[]>([]);
    const [sessions, setSessions] = useState<TokenStatsSession[]>([]);
    const [status, setStatus] = useState<TokenStatsStatus | null>(null);
    const [timeRange, setTimeRange] = useState<TimeRange>("30d");
    const [envFilter, setEnvFilter] = useState<EnvFilter>("all");
    const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);

    const load_data = useCallback(async () => {
        setLoading(true);
        try {
            const bucket_filters: { source?: string; env?: string; from_date?: string } = {};
            const session_filters: {
                source?: string;
                env?: string;
                search?: string;
                limit: number;
            } = { limit: 200 };
            if (envFilter !== "all") {
                bucket_filters.env = envFilter;
                session_filters.env = envFilter;
            }
            if (sourceFilter !== "all") {
                bucket_filters.source = sourceFilter;
                session_filters.source = sourceFilter;
            }
            if (search) {
                session_filters.search = search;
            }
            const from_date = window_from_date(timeRange);
            if (from_date) {
                bucket_filters.from_date = from_date;
            }

            const [b, s, st] = await Promise.all([
                window.usageboard.tokenStats.getBuckets(bucket_filters),
                window.usageboard.tokenStats.getSessions(session_filters),
                window.usageboard.tokenStats.getStatus(),
            ]);
            setBuckets(b);
            setSessions(s);
            setStatus(st);
        } catch (err: unknown) {
            window.usageboard.log({
                level: "error",
                module: MODULE,
                message: `Failed to load token stats: ${err instanceof Error ? err.message : String(err)}`,
            });
        } finally {
            setLoading(false);
        }
    }, [timeRange, envFilter, sourceFilter, search]);

    useEffect(() => {
        void load_data();
    }, [load_data]);

    // Reload automatically whenever the collector stores new data
    useEffect(() => {
        return window.usageboard.tokenStats.onUpdated(() => {
            void load_data();
        });
    }, [load_data]);

    // --- KPI calculations ---
    const kpis = useMemo(() => {
        const total_tokens = buckets.reduce((sum, b) => sum + b.input_tokens + b.output_tokens, 0);
        const total_calls = buckets.reduce((sum, b) => sum + b.calls, 0);
        const model_totals = new Map<string, number>();
        for (const b of buckets) {
            model_totals.set(
                b.model,
                (model_totals.get(b.model) ?? 0) + b.input_tokens + b.output_tokens,
            );
        }
        const top_model = [...model_totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
        const unique_days = new Set(buckets.map((b) => b.bucket_date)).size;
        const daily_avg = unique_days > 0 ? Math.round(total_tokens / unique_days) : 0;
        return { total_tokens, total_calls, top_model, daily_avg };
    }, [buckets]);

    // --- Chart data: per-date totals stacked by model ---
    const chart = useMemo(() => {
        const models = [...new Set(buckets.map((b) => b.model))].sort();
        const model_color = new Map<string, string>(
            models.map((m, i) => [m, MODEL_COLORS[i % MODEL_COLORS.length] ?? "var(--blue)"]),
        );
        const date_map = new Map<string, Map<string, number>>();
        for (const b of buckets) {
            let entry = date_map.get(b.bucket_date);
            if (!entry) {
                entry = new Map();
                date_map.set(b.bucket_date, entry);
            }
            entry.set(b.model, (entry.get(b.model) ?? 0) + b.input_tokens + b.output_tokens);
        }
        const dates = [...date_map.keys()].sort();
        const day_totals = dates.map((d) =>
            [...(date_map.get(d)?.values() ?? [])].reduce((s, v) => s + v, 0),
        );
        const max_total = Math.max(...day_totals, 1);
        const label_every = Math.max(1, Math.ceil(dates.length / MAX_LEGEND_ITEMS));
        return { models, model_color, date_map, dates, day_totals, max_total, label_every };
    }, [buckets]);

    // --- Sessions visible in the selected window (CC counts active sessions) ---
    const window_start_ms = useMemo(() => {
        const from = window_from_date(timeRange);
        return from ? Date.parse(`${from}T00:00:00Z`) : 0;
    }, [timeRange]);
    const visible_sessions = useMemo(
        () => sessions.filter((s) => s.ended_at >= window_start_ms),
        [sessions, window_start_ms],
    );

    const has_data = visible_sessions.length > 0 || buckets.length > 0;

    return (
        <div className="window">
            {/* Title bar */}
            <div className="settings-titlebar">
                <span className="st-title">Token 统计</span>
                <div className="st-controls">
                    <button
                        className="st-btn close"
                        onClick={() => {
                            window.close();
                        }}
                        title="关闭"
                        type="button"
                    >
                        <svg width="10" height="10" viewBox="0 0 10 10">
                            <path
                                d="M0.5 0.5L9.5 9.5M9.5 0.5L0.5 9.5"
                                stroke="currentColor"
                                strokeWidth="1.2"
                            />
                        </svg>
                    </button>
                </div>
            </div>

            <div className="ts-body">
                {/* Filters */}
                <div className="ts-toolbar">
                    <div className="seg">
                        {TIME_RANGES.map((r) => (
                            <button
                                key={r.value}
                                className={timeRange === r.value ? "on" : ""}
                                onClick={() => {
                                    setTimeRange(r.value);
                                }}
                                type="button"
                            >
                                {r.label}
                            </button>
                        ))}
                    </div>
                    <div className="seg">
                        {SOURCES.map((s) => (
                            <button
                                key={s.value}
                                className={sourceFilter === s.value ? "on" : ""}
                                onClick={() => {
                                    setSourceFilter(s.value);
                                }}
                                type="button"
                            >
                                {s.label}
                            </button>
                        ))}
                    </div>
                    <div className="seg">
                        {ENVS.map((e) => (
                            <button
                                key={e.value}
                                className={envFilter === e.value ? "on" : ""}
                                onClick={() => {
                                    setEnvFilter(e.value);
                                }}
                                type="button"
                            >
                                {e.label}
                            </button>
                        ))}
                    </div>
                    <input
                        type="text"
                        className="ts-field ts-search"
                        placeholder="搜索标题 / 目录 / 模型"
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                        }}
                    />
                </div>

                {!has_data && !loading ? (
                    <div className="ts-empty-wrap">
                        <div className="empty">
                            <div className="empty-title">暂无数据</div>
                            <div className="empty-sub">
                                采集器每 10 分钟读取一次 Claude Code（~/.claude）与
                                OpenCode（~/.local/share/opencode）的本地记录
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* KPI cards */}
                        <div className="ts-kpis">
                            <KpiCard label="总 Token" value={format_tokens(kpis.total_tokens)} />
                            <KpiCard label="调用次数" value={format_tokens(kpis.total_calls)} />
                            <KpiCard label="Session 数" value={String(visible_sessions.length)} />
                            <KpiCard label="主用模型" value={kpis.top_model} />
                            <KpiCard label="日均 Token" value={format_tokens(kpis.daily_avg)} />
                        </div>

                        {/* Stacked bar chart */}
                        <div className="ts-chart-panel">
                            <div className="ts-chart-head">
                                <span className="ts-chart-title">每日 Token</span>
                                <div className="ts-legend">
                                    {chart.models.map((m) => (
                                        <span key={m} className="lg-item">
                                            <span
                                                className="lg-dot"
                                                style={{
                                                    background: chart.model_color.get(m),
                                                }}
                                            />
                                            {m}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div className="ts-chart">
                                {chart.dates.length === 0 && !loading && (
                                    <div className="ts-chart-empty">所选范围内无数据</div>
                                )}
                                {chart.dates.map((date, i) => {
                                    const entry = chart.date_map.get(date);
                                    if (!entry) return null;
                                    const total = chart.day_totals[i] ?? 0;
                                    const bar_height = Math.max(
                                        2,
                                        Math.round((total / chart.max_total) * 100),
                                    );
                                    return (
                                        <div
                                            key={date}
                                            className="ts-day"
                                            title={`${date}: ${format_tokens(total)}`}
                                        >
                                            <div
                                                className="ts-bar"
                                                style={{ height: `${String(bar_height)}%` }}
                                            >
                                                {chart.models.map((m) => {
                                                    const v = entry.get(m) ?? 0;
                                                    if (v === 0) return null;
                                                    return (
                                                        <div
                                                            key={m}
                                                            className="ts-bar-seg"
                                                            style={{
                                                                height: `${String((v / total) * 100)}%`,
                                                                background:
                                                                    chart.model_color.get(m),
                                                            }}
                                                            title={`${m}: ${format_tokens(v)}`}
                                                        />
                                                    );
                                                })}
                                            </div>
                                            {i % chart.label_every === 0 && (
                                                <span className="ts-day-label">
                                                    {date.slice(5)}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Session list */}
                        <div className="ts-table-wrap">
                            <table className="ts-table">
                                <thead>
                                    <tr>
                                        <th>标题</th>
                                        <th>来源</th>
                                        <th>环境</th>
                                        <th>模型</th>
                                        <th className="ts-num">Calls</th>
                                        <th className="ts-num">Input</th>
                                        <th className="ts-num">Output</th>
                                        <th className="ts-num">时间</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visible_sessions.map((s) => (
                                        <tr key={`${s.source}:${s.env}:${s.id}`}>
                                            <td
                                                className="ts-title-cell"
                                                title={s.directory ?? undefined}
                                            >
                                                {s.title ?? s.id.slice(0, 8)}
                                            </td>
                                            <td>
                                                <span
                                                    className={`ts-badge ${
                                                        s.source === "claude_code"
                                                            ? "ts-badge-cc"
                                                            : "ts-badge-oc"
                                                    }`}
                                                >
                                                    {s.source === "claude_code" ? "CC" : "OC"}
                                                </span>
                                            </td>
                                            <td className="ts-dim">{s.env.toUpperCase()}</td>
                                            <td className="ts-model-cell ts-dim" title={s.model}>
                                                {s.model}
                                            </td>
                                            <td className="ts-num">{s.calls}</td>
                                            <td className="ts-num">
                                                {format_tokens(s.input_tokens)}
                                            </td>
                                            <td className="ts-num">
                                                {format_tokens(s.output_tokens)}
                                            </td>
                                            <td className="ts-num ts-dim">
                                                {format_session_date(s.started_at)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {sessions.length >= 200 && (
                                <div
                                    className="ts-dim"
                                    style={{ padding: "8px 10px", fontSize: 12 }}
                                >
                                    显示前 200 条；用搜索缩小范围
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Status bar */}
            <div className="statusbar">
                <div className="sb-left">
                    <span className={`dot ${status?.running ? "green" : "red"}`} />
                    <span>{status?.running ? "采集器运行中" : "采集器已停止"}</span>
                </div>
                <div className="sb-right">
                    {loading
                        ? "加载中..."
                        : status?.last_updated
                          ? `更新于 ${new Date(status.last_updated).toLocaleString("zh-CN", { hour12: false })}`
                          : "尚未采集到数据"}
                </div>
            </div>
        </div>
    );
}

function KpiCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="ts-kpi">
            <div className="ts-kpi-label">{label}</div>
            <div className="ts-kpi-value" title={value}>
                {value}
            </div>
        </div>
    );
}

/**
 * Truncate (not round) to one decimal, matching Claude Code /stats display
 * convention (e.g. 2.259b shows as "2.2b").
 */
function format_tokens(n: number): string {
    if (n >= 1_000_000_000) return `${(Math.floor(n / 100_000_000) / 10).toFixed(1)}B`;
    if (n >= 1_000_000) return `${(Math.floor(n / 100_000) / 10).toFixed(1)}M`;
    if (n >= 1_000) return `${(Math.floor(n / 100) / 10).toFixed(1)}K`;
    return String(n);
}

function utc_date_str(d: Date): string {
    return d.toISOString().slice(0, 10);
}

/**
 * Start date (UTC, YYYY-MM-DD) of a time range, or null for "all".
 * Claude Code /stats defines "Last 7 days" as the last 7 UTC calendar days
 * including today, so 7d = today-6, 30d = today-29.
 */
function window_from_date(range: TimeRange): string | null {
    const now = Date.now();
    if (range === "7d") {
        return utc_date_str(new Date(now - 6 * 86400000));
    }
    if (range === "30d") {
        return utc_date_str(new Date(now - 29 * 86400000));
    }
    if (range === "month") {
        const d = new Date();
        return utc_date_str(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
    }
    return null;
}

function format_session_date(ts: number): string {
    const d = new Date(ts);
    const today = new Date();
    const same_day =
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate();
    if (same_day) {
        return d.toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("zh-CN");
}
