import { useState, useEffect, useCallback } from "react";
import type { TokenStatsBucket, TokenStatsSession } from "../../shared/types/token-stats";

const MODULE = "TokenStatsView";

type TimeRange = "7d" | "30d" | "month" | "all";
type EnvFilter = "all" | "win" | "wsl";

export function TokenStatsView() {
    const [buckets, setBuckets] = useState<TokenStatsBucket[]>([]);
    const [sessions, setSessions] = useState<TokenStatsSession[]>([]);
    const [timeRange, setTimeRange] = useState<TimeRange>("30d");
    const [envFilter, setEnvFilter] = useState<EnvFilter>("all");
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);

    const load_data = useCallback(async () => {
        setLoading(true);
        try {
            const env = envFilter === "all" ? undefined : envFilter;
            let from_date: string | undefined;
            const now = new Date();
            if (timeRange === "7d") {
                from_date = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
            } else if (timeRange === "30d") {
                from_date = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
            } else if (timeRange === "month") {
                from_date = new Date(now.getFullYear(), now.getMonth(), 1)
                    .toISOString()
                    .slice(0, 10);
            }

            const [b, s] = await Promise.all([
                window.usageboard.tokenStats.getBuckets({
                    env,
                    from_date,
                }),
                window.usageboard.tokenStats.getSessions({
                    env,
                    search: search || undefined,
                    limit: 200,
                }),
            ]);
            setBuckets(b);
            setSessions(s);
        } catch (err: unknown) {
            window.usageboard.log({
                level: "error",
                module: MODULE,
                message: `Failed to load token stats: ${err instanceof Error ? err.message : String(err)}`,
            });
        } finally {
            setLoading(false);
        }
    }, [timeRange, envFilter, search]);

    useEffect(() => {
        void load_data();
    }, [load_data]);

    // KPI calculations
    const total_tokens = buckets.reduce((sum, b) => sum + b.input_tokens + b.output_tokens, 0);
    const total_sessions = sessions.length;
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

    // Group buckets by date for chart
    const date_groups = new Map<string, Map<string, number>>();
    for (const b of buckets) {
        let date_map = date_groups.get(b.bucket_date);
        if (!date_map) {
            date_map = new Map();
            date_groups.set(b.bucket_date, date_map);
        }
        date_map.set(b.model, (date_map.get(b.model) ?? 0) + b.input_tokens + b.output_tokens);
    }
    const sorted_dates = [...date_groups.keys()].sort();
    const chart_max = Math.max(
        ...[...date_groups.values()].map((m) => [...m.values()].reduce((s, v) => s + v, 0)),
        1,
    );

    return (
        <div className="flex flex-col h-full bg-[var(--bg-primary)] text-[var(--text-primary)]">
            {/* Title bar */}
            <div className="flex items-center justify-between px-4 py-2 drag-region">
                <span className="text-sm font-medium">Token 统计</span>
                <button
                    onClick={() => {
                        window.close();
                    }}
                    className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--bg-hover)] text-xs"
                >
                    ×
                </button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--border)]">
                <select
                    value={timeRange}
                    onChange={(e) => {
                        setTimeRange(e.target.value as TimeRange);
                    }}
                    className="text-xs bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2 py-1"
                >
                    <option value="7d">近 7 天</option>
                    <option value="30d">近 30 天</option>
                    <option value="month">本月</option>
                    <option value="all">全部</option>
                </select>
                <select
                    value={envFilter}
                    onChange={(e) => {
                        setEnvFilter(e.target.value as EnvFilter);
                    }}
                    className="text-xs bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2 py-1"
                >
                    <option value="all">全部环境</option>
                    <option value="win">Win</option>
                    <option value="wsl">WSL</option>
                </select>
                <input
                    type="text"
                    placeholder="搜索 session..."
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value);
                    }}
                    className="text-xs bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2 py-1 flex-1 max-w-48"
                />
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-4 gap-3 px-4 py-3">
                <KpiCard label="总 Token" value={format_tokens(total_tokens)} />
                <KpiCard label="Session 数" value={String(total_sessions)} />
                <KpiCard label="主用模型" value={top_model} />
                <KpiCard label="日均 Token" value={format_tokens(daily_avg)} />
            </div>

            {/* Simple bar chart */}
            <div className="px-4 py-2 flex-1 min-h-0">
                <div className="text-xs text-[var(--text-secondary)] mb-2">
                    按天分布 {loading ? "(加载中...)" : ""}
                </div>
                <div className="flex items-end gap-1 h-32 overflow-x-auto">
                    {sorted_dates.map((date) => {
                        const date_map = date_groups.get(date);
                        if (!date_map) return null;
                        const total = [...date_map.values()].reduce((s, v) => s + v, 0);
                        const height_pct = (total / chart_max) * 100;
                        return (
                            <div
                                key={date}
                                className="flex flex-col items-center flex-shrink-0"
                                title={`${date}: ${format_tokens(total)}`}
                            >
                                <div
                                    className="w-4 bg-blue-500 rounded-t"
                                    style={{ height: `${String(height_pct)}%` }}
                                />
                                <span className="text-[9px] text-[var(--text-tertiary)] mt-1 rotate-45 origin-left">
                                    {date.slice(5)}
                                </span>
                            </div>
                        );
                    })}
                    {sorted_dates.length === 0 && !loading && (
                        <div className="text-xs text-[var(--text-tertiary)] py-8">无数据</div>
                    )}
                </div>
            </div>

            {/* Session list */}
            <div className="px-4 py-2 flex-1 min-h-0 overflow-auto">
                <div className="text-xs text-[var(--text-secondary)] mb-2">
                    Session 列表 ({String(sessions.length)})
                </div>
                <table className="w-full text-xs">
                    <thead>
                        <tr className="text-left text-[var(--text-tertiary)] border-b border-[var(--border)]">
                            <th className="py-1 pr-2">标题</th>
                            <th className="py-1 pr-2">来源</th>
                            <th className="py-1 pr-2">环境</th>
                            <th className="py-1 pr-2">模型</th>
                            <th className="py-1 pr-2 text-right">Input</th>
                            <th className="py-1 pr-2 text-right">Output</th>
                            <th className="py-1 text-right">时间</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sessions.slice(0, 100).map((s) => (
                            <tr
                                key={`${s.source}:${s.env}:${s.id}`}
                                className="border-b border-[var(--border)] hover:bg-[var(--bg-hover)]"
                            >
                                <td className="py-1 pr-2 truncate max-w-32">
                                    {s.title ?? s.id.slice(0, 8)}
                                </td>
                                <td className="py-1 pr-2">
                                    <span
                                        className={`px-1 rounded text-[10px] ${s.source === "claude_code" ? "bg-purple-900/30 text-purple-300" : "bg-blue-900/30 text-blue-300"}`}
                                    >
                                        {s.source === "claude_code" ? "CC" : "OC"}
                                    </span>
                                </td>
                                <td className="py-1 pr-2">
                                    <span className="text-[var(--text-tertiary)]">
                                        {s.env.toUpperCase()}
                                    </span>
                                </td>
                                <td className="py-1 pr-2 truncate max-w-24">{s.model}</td>
                                <td className="py-1 pr-2 text-right font-mono">
                                    {format_tokens(s.input_tokens)}
                                </td>
                                <td className="py-1 pr-2 text-right font-mono">
                                    {format_tokens(s.output_tokens)}
                                </td>
                                <td className="py-1 text-right text-[var(--text-tertiary)]">
                                    {new Date(s.started_at).toLocaleDateString("zh-CN")}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {sessions.length > 100 && (
                    <div className="text-xs text-[var(--text-tertiary)] py-2 text-center">
                        显示前 100 条，共 {String(sessions.length)} 条
                    </div>
                )}
            </div>
        </div>
    );
}

function KpiCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-[var(--bg-secondary)] rounded-lg p-3">
            <div className="text-[10px] text-[var(--text-tertiary)] mb-1">{label}</div>
            <div className="text-sm font-semibold">{value}</div>
        </div>
    );
}

function format_tokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
}
