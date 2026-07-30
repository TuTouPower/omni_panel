import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
    AgentSessionUsage,
    TokenStatsBucket,
    TokenStatsEnv,
    TokenStatsSession,
} from "../../shared/types/token-stats";
import type { TokenStatsStatus } from "../../shared/types/ipc";
import { MetricDonut } from "../components/token-stats/MetricDonut";
import { BarChart } from "../components/token-stats/BarChart";
import { Heatmap } from "../components/token-stats/Heatmap";
import { SessionTable } from "../components/token-stats/SessionTable";
import { Segmented } from "../components/token-stats/Segmented";
import { RangePicker } from "../components/token-stats/RangePicker";
import { filtered } from "../lib/token-stats/filter";
import {
    metricValue,
    hitRateOf,
    prevRangeRecords,
    sessionRowsFromSessions,
} from "../lib/token-stats/aggregate";
import { fmtInt, fmtRelativeTime, fmtTok } from "../lib/token-stats/format";
import {
    agentSegments,
    agentSegmentsFromBuckets,
    compositionSegments,
    compositionSegmentsFromBuckets,
    kpiFromBuckets,
    modelColorMapFromBuckets,
    modelSegments,
    modelSegmentsFromBuckets,
    oneValue,
    projectSegmentsFromSessions,
    sumTokensValue,
} from "../lib/token-stats/chart-data";
import type { AgentFilter, Granularity, Metric, XAxis } from "../lib/token-stats/types";
import "../styles/token-stats.css";

const MODULE = "TokenStatsView";

/** Map agent filter (kebab) to token_stats source (snake). */
const AGENT_TO_SOURCE: Record<Exclude<AgentFilter, "all">, string> = {
    "claude-code": "claude_code",
    opencode: "opencode",
    "kimi-code": "kimi_code",
};

/** epoch ms -> YYYY-MM-DD (UTC) to match bucket_date (daily table is UTC-dated). */
function utc_date(ms: number): string {
    const d = new Date(ms);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${String(y)}-${m}-${day}`;
}

type Theme = "dark" | "light";
type RangePreset = "24h" | "7d" | "30d";
type PlatformFilter = "all" | TokenStatsEnv;

const AGENT_OPTIONS: { value: AgentFilter; label: string }[] = [
    { value: "all", label: "全部工具" },
    { value: "claude-code", label: "Claude Code" },
    { value: "opencode", label: "OpenCode" },
    { value: "kimi-code", label: "Kimi Code" },
];

const PLATFORM_OPTIONS: { value: PlatformFilter; label: string }[] = [
    { value: "all", label: "全平台" },
    { value: "win", label: "Win" },
    { value: "wsl", label: "WSL" },
];

const RANGE_OPTIONS: { value: RangePreset; label: string }[] = [
    { value: "24h", label: "24 小时" },
    { value: "7d", label: "7 天" },
    { value: "30d", label: "1 月" },
];

const THEME_OPTIONS: { value: Theme; label: string }[] = [
    { value: "dark", label: "🌙 深色" },
    { value: "light", label: "☀️ 浅色" },
];

const METRIC_OPTIONS: { value: Metric; label: string }[] = [
    { value: "tokens", label: "Token" },
    { value: "sessions", label: "Session" },
    { value: "calls", label: "调用次数" },
];

const GRAN_OPTIONS: { value: Granularity; label: string }[] = [
    { value: "hour", label: "小时" },
    { value: "day", label: "天" },
];

const XAXIS_OPTIONS: { value: XAxis; label: string; disabled?: boolean }[] = [
    { value: "time", label: "时间" },
    { value: "project", label: "项目" },
    { value: "session", label: "会话" },
];

const PRESET_MS: Record<RangePreset, number> = {
    "24h": 24 * 3600000,
    "7d": 7 * 24 * 3600000,
    "30d": 30 * 24 * 3600000,
};

function presetRange(preset: RangePreset): { start: number; end: number } {
    const end = Date.now();
    return { start: end - PRESET_MS[preset], end };
}

function readSavedTheme(): Theme {
    try {
        const raw = localStorage.getItem("usage-theme");
        return raw === "light" ? "light" : "dark";
    } catch {
        return "dark";
    }
}

function saveTheme(theme: Theme) {
    try {
        localStorage.setItem("usage-theme", theme);
    } catch {
        // ignore
    }
}

interface TokenStatsPrefs {
    agent: AgentFilter;
    platform: PlatformFilter;
    preset: RangePreset | null;
    metric: Metric;
    xaxis: XAxis;
    gran: Granularity;
}

const PREFS_KEY = "token-stats-prefs";

function load_prefs(): Partial<TokenStatsPrefs> {
    try {
        return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<TokenStatsPrefs>;
    } catch {
        return {};
    }
}

function save_prefs(p: TokenStatsPrefs): void {
    try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    } catch {
        // ignore
    }
}

export function TokenStatsView() {
    const saved = useMemo(() => load_prefs(), []);
    const [records, setRecords] = useState<AgentSessionUsage[]>([]);
    const [buckets, setBuckets] = useState<TokenStatsBucket[]>([]);
    const [sessions, setSessions] = useState<TokenStatsSession[]>([]);
    const [status, setStatus] = useState<TokenStatsStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [agent, setAgent] = useState<AgentFilter>(saved.agent ?? "all");
    const [platform, setPlatform] = useState<PlatformFilter>(saved.platform ?? "all");
    const [preset, setPreset] = useState<RangePreset | null>(saved.preset ?? "30d");
    const [custom, setCustom] = useState<{ start: number; end: number } | null>(null);
    const [metric, setMetric] = useState<Metric>(saved.metric ?? "tokens");
    const [xaxis, setXaxis] = useState<XAxis>(saved.xaxis ?? "time");
    const [gran, setGran] = useState<Granularity>(saved.gran ?? "day");
    const [theme, setTheme] = useState<Theme>(readSavedTheme());
    const [dirAliases, setDirAliases] = useState<{ alias: string; dirs: string[] }[]>([]);
    const [modelAliases, setModelAliases] = useState<{ alias: string; models: string[] }[]>([]);
    const load_request_id = useRef(0);

    const currentRange = useMemo(
        () =>
            custom ? { ...custom } : preset ? presetRange(preset) : { start: 0, end: Date.now() },
        [custom, preset],
    );
    // Short windows (<=25h) cannot be split symmetrically on day-granular
    // buckets, so KPI/donut deltas fall back to per-message records there.
    const is_short_window = currentRange.end - currentRange.start <= 25 * 3600000;

    const updatedAgo = useMemo(() => {
        if (!status?.last_updated) return null;
        return fmtRelativeTime(Date.now() - status.last_updated);
    }, [status?.last_updated]);

    const loadData = useCallback(
        async (silent = false) => {
            const request_id = ++load_request_id.current;
            // Silent refresh (collector auto-update) keeps the previous data on
            // screen instead of flashing "加载中"; only user-driven reloads show
            // the loading state.
            if (!silent) setLoading(true);
            try {
                const env_filter = platform === "all" ? {} : { env: platform };
                // buckets/sessions filters accept `source` (snake); records filter
                // accepts `agent` (kebab). Map the agent selector to both.
                const source_filter = agent === "all" ? {} : { source: AGENT_TO_SOURCE[agent] };
                const agent_filter = agent === "all" ? {} : { agent };
                // Pull buckets across [start - width, end] so the renderer can
                // derive both the current window and the equal-width prior
                // window (for delta arrows) by splitting on bucket_date.
                const width = Math.max(0, currentRange.end - currentRange.start);
                const bucket_filter = {
                    ...env_filter,
                    ...source_filter,
                    from_date: utc_date(currentRange.start - width),
                    to_date: utc_date(currentRange.end),
                };
                // records feed the Bar/Heatmap (hourly resolution) AND, short
                // windows (<=25h, e.g. 24h preset), the KPI/donut delta — day
                // buckets cannot split a 24h window symmetrically, so we fall
                // back to per-message records there. Fetch 2x wide so the prior
                // window is available for delta; bounded by LIMIT.
                const records_fetch = is_short_window
                    ? { start: currentRange.start - width, end: currentRange.end, limit: 50000 }
                    : { start: currentRange.start, end: currentRange.end };
                const [recs, bkts, sess, st, cfg] = await Promise.all([
                    window.usageboard.tokenStats.getRecords({
                        ...env_filter,
                        ...agent_filter,
                        ...records_fetch,
                    }),
                    window.usageboard.tokenStats.getBuckets(bucket_filter),
                    window.usageboard.tokenStats.getSessions({
                        ...env_filter,
                        ...source_filter,
                        limit: 500,
                    }),
                    window.usageboard.tokenStats.getStatus(),
                    window.usageboard.config.get(),
                ]);
                if (request_id !== load_request_id.current) return;
                setRecords(recs);
                setBuckets(bkts);
                setSessions(sess);
                setStatus(st);
                setDirAliases(
                    (cfg.config.dirAliases ?? []).map((a) => ({
                        alias: a.alias,
                        dirs: [...a.dirs],
                    })),
                );
                setModelAliases(
                    (cfg.config.modelAliases ?? []).map((a) => ({
                        alias: a.alias,
                        models: [...a.models],
                    })),
                );
            } catch (err: unknown) {
                if (request_id !== load_request_id.current) return;
                window.usageboard.log({
                    level: "error",
                    module: MODULE,
                    message: `Failed to load token stats: ${err instanceof Error ? err.message : String(err)}`,
                });
            } finally {
                if (!silent && request_id === load_request_id.current) {
                    setLoading(false);
                }
            }
        },
        [platform, agent, currentRange, is_short_window],
    );

    useEffect(() => {
        void loadData();
    }, [loadData]);

    useEffect(() => {
        return window.usageboard.tokenStats.onUpdated(() => {
            void loadData(true);
        });
    }, [loadData]);

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
        saveTheme(theme);
    }, [theme]);

    useEffect(() => {
        save_prefs({ agent, platform, preset, metric, xaxis, gran });
    }, [agent, platform, preset, metric, xaxis, gran]);

    const agentFiltered = useMemo(
        () => records.filter((r) => agent === "all" || r.agent === agent),
        [records, agent],
    );

    const currentRecords = useMemo(
        () => filtered(agentFiltered, { agent: "all", ...currentRange }),
        [agentFiltered, currentRange],
    );

    // Prior-window records for short-window (24h) delta — per-message epoch
    // split avoids the day-bucket asymmetry that inflates 24h deltas. Reuse
    // prevRangeRecords (half-open [start-width, start)) so the boundary record
    // is not double-counted in both current and prior windows.
    const prevRecords = useMemo(
        () => prevRangeRecords(agentFiltered, currentRange),
        [agentFiltered, currentRange],
    );

    // Split the 2x-wide buckets into current and equal-width prior windows by
    // bucket_date (UTC YYYY-MM-DD). Day-level granularity means the boundary
    // aligns to the date containing currentRange.start, not the exact epoch -
    // acceptable for KPI/donut deltas which are day-granular anyway.
    const currentBuckets = useMemo(() => {
        const start_date = utc_date(currentRange.start);
        const end_date = utc_date(currentRange.end);
        return buckets.filter((b) => b.bucket_date >= start_date && b.bucket_date <= end_date);
    }, [buckets, currentRange]);

    const prevBuckets = useMemo(() => {
        const start_date = utc_date(currentRange.start);
        const width = Math.max(0, currentRange.end - currentRange.start);
        const prev_start_date = utc_date(currentRange.start - width);
        return buckets.filter(
            (b) => b.bucket_date >= prev_start_date && b.bucket_date < start_date,
        );
    }, [buckets, currentRange]);

    // Sessions overlapping the current window (started before end, ended after
    // start). getSessions has no date filter, so filter client-side.
    const currentSessions = useMemo(
        () =>
            sessions.filter(
                (s) => s.started_at <= currentRange.end && s.ended_at >= currentRange.start,
            ),
        [sessions, currentRange],
    );

    const isSessionMetric = metric === "sessions";
    const effectiveXaxis = isSessionMetric ? "time" : xaxis;

    useEffect(() => {
        if (effectiveXaxis !== "time") return;
        if (preset === "24h") setGran("hour");
        else setGran("day");
    }, [preset, effectiveXaxis]);

    const deltaHtml = useCallback((current: number, previous: number, pp = false) => {
        if (previous <= 0 && !(pp && previous !== 0)) {
            return <b style={{ color: "var(--ts-text-3)" }}>前段无数据</b>;
        }
        if (pp) {
            const d = (current - previous) * 100;
            return d >= 0 ? (
                <b className="up">▲ {d.toFixed(1)} pp</b>
            ) : (
                <b className="down">▼ {Math.abs(d).toFixed(1)} pp</b>
            );
        }
        const d = previous === 0 ? 0 : (current - previous) / previous;
        return d >= 0 ? (
            <b className="up">▲ {(d * 100).toFixed(1)}%</b>
        ) : (
            <b className="down">▼ {Math.abs(d * 100).toFixed(1)}%</b>
        );
    }, []);

    const currentKpi = is_short_window
        ? {
              tokens: metricValue(currentRecords, "tokens"),
              sessions: metricValue(currentRecords, "sessions"),
              calls: metricValue(currentRecords, "calls"),
          }
        : kpiFromBuckets(currentBuckets);
    const currentComp = is_short_window
        ? compositionSegments(currentRecords)
        : compositionSegmentsFromBuckets(currentBuckets);
    const compInput = currentComp.find((c) => c.name === "input")?.value ?? 0;
    const compCacheRead = currentComp.find((c) => c.name === "cache_read")?.value ?? 0;
    const hitRate = is_short_window
        ? hitRateOf(currentRecords)
        : compCacheRead + compInput > 0
          ? compCacheRead / (compCacheRead + compInput)
          : 0;

    const prevKpi = is_short_window
        ? {
              tokens: metricValue(prevRecords, "tokens"),
              sessions: metricValue(prevRecords, "sessions"),
              calls: metricValue(prevRecords, "calls"),
          }
        : kpiFromBuckets(prevBuckets);
    const prevComp = is_short_window ? [] : compositionSegmentsFromBuckets(prevBuckets);
    const prevHitRate = is_short_window
        ? hitRateOf(prevRecords)
        : (() => {
              const pi = prevComp.find((c) => c.name === "input")?.value ?? 0;
              const pc = prevComp.find((c) => c.name === "cache_read")?.value ?? 0;
              return pc + pi > 0 ? pc / (pc + pi) : 0;
          })();

    const totalTokens = currentKpi.tokens;
    const totalSessions = currentKpi.sessions;
    const totalCalls = currentKpi.calls;

    const prevTokens = prevKpi.tokens;
    const prevSessions = prevKpi.sessions;
    const prevCalls = prevKpi.calls;

    const agentSegmentsData = is_short_window
        ? agentSegments(currentRecords)
        : agentSegmentsFromBuckets(currentBuckets);
    // Donut segments: short windows derive from records (precise epoch window),
    // longer windows from buckets (day-granular, fine for >=7d).
    const modelTokenSegs = is_short_window
        ? modelSegments(currentRecords, sumTokensValue, theme)
        : modelSegmentsFromBuckets(currentBuckets, theme);
    const modelCallSegs = is_short_window
        ? modelSegments(currentRecords, oneValue, theme)
        : modelSegmentsFromBuckets(currentBuckets, theme, (b) => b.calls);
    const topAgentSeg = agentSegmentsData.reduce<{ name: string; value: number } | null>(
        (acc, b) => (!acc || b.value > acc.value ? b : acc),
        null,
    );
    const topAgentLabel = topAgentSeg ? topAgentSeg.name.replace(/ /g, "\n") : "—";

    const handlePresetChange = (p: RangePreset) => {
        setPreset(p);
        setCustom(null);
        setGran(p === "24h" ? "hour" : "day");
    };

    const handleCustomApply = (range: { start: number; end: number }) => {
        setCustom(range);
        setPreset(null);
    };

    const handleMetricChange = (m: Metric) => {
        setMetric(m);
        if (m === "sessions") setXaxis("time");
    };

    return (
        <div className="token-stats">
            <header>
                <div className="brand">
                    <h1>
                        <span className="dot" />
                        代理面板
                        {updatedAgo && <span className="update-ago">{updatedAgo}</span>}
                    </h1>
                </div>
                <div className="controls">
                    <Segmented
                        options={AGENT_OPTIONS}
                        value={agent}
                        onChange={(v) => {
                            setAgent(v);
                        }}
                    />
                    <Segmented
                        options={PLATFORM_OPTIONS}
                        value={platform}
                        onChange={(v) => {
                            setPlatform(v);
                        }}
                    />
                    <Segmented
                        options={RANGE_OPTIONS}
                        value={preset}
                        onChange={(v) => {
                            handlePresetChange(v);
                        }}
                    />
                    <Segmented
                        options={THEME_OPTIONS}
                        value={theme}
                        onChange={(v) => {
                            setTheme(v);
                        }}
                    />
                    <RangePicker
                        start={currentRange.start}
                        end={currentRange.end}
                        active={custom !== null}
                        onApply={handleCustomApply}
                    />
                    <button
                        className="ts-nav-btn"
                        type="button"
                        onClick={() => {
                            window.usageboard.tray.open_panel();
                        }}
                    >
                        用量面板
                    </button>
                    <button
                        className="ts-nav-btn"
                        type="button"
                        onClick={() => {
                            window.usageboard.settings.open();
                        }}
                    >
                        设置
                    </button>
                </div>
            </header>

            {loading ? (
                <div className="empty">加载中...</div>
            ) : currentBuckets.length === 0 && currentSessions.length === 0 ? (
                <div className="empty">该筛选条件下暂无记录</div>
            ) : (
                <>
                    <div className="grid kpi-grid">
                        <div className="card span-3">
                            <h3>
                                总 Token 消耗{" "}
                                <span className="delta">{deltaHtml(totalTokens, prevTokens)}</span>
                            </h3>
                            <MetricDonut
                                centerValue={fmtTok(totalTokens)}
                                segments={modelTokenSegs}
                                format={fmtTok}
                                theme={theme}
                            />
                        </div>
                        <div className="card span-3">
                            <h3>
                                会话数{" "}
                                <span className="delta">
                                    {deltaHtml(totalSessions, prevSessions)}
                                </span>
                            </h3>
                            <MetricDonut
                                centerValue={fmtInt(totalSessions)}
                                segments={projectSegmentsFromSessions(currentSessions, theme)}
                                format={fmtInt}
                                theme={theme}
                            />
                        </div>
                        <div className="card span-3">
                            <h3>
                                调用次数{" "}
                                <span className="delta">{deltaHtml(totalCalls, prevCalls)}</span>
                            </h3>
                            <MetricDonut
                                centerValue={fmtInt(totalCalls)}
                                segments={modelCallSegs}
                                format={fmtInt}
                                theme={theme}
                            />
                        </div>
                        <div className="card span-3">
                            <h3>工具占比</h3>
                            <MetricDonut
                                centerValue={topAgentLabel}
                                segments={agentSegmentsData}
                                format={fmtTok}
                                theme={theme}
                            />
                        </div>
                        <div className="card span-3">
                            <h3>
                                缓存命中率{" "}
                                <span className="delta">
                                    {deltaHtml(hitRate, prevHitRate, true)}
                                </span>
                            </h3>
                            <MetricDonut
                                centerValue={`${(hitRate * 100).toFixed(1)}%`}
                                segments={currentComp}
                                format={fmtTok}
                                theme={theme}
                            />
                        </div>
                    </div>

                    <div className="grid">
                        <div className="card span-8">
                            <h3 className="bar-chart-header">
                                <Segmented
                                    options={METRIC_OPTIONS}
                                    value={metric}
                                    onChange={(v) => {
                                        handleMetricChange(v);
                                    }}
                                    size="sm"
                                />
                                <span className="h3ctrl">
                                    {effectiveXaxis === "time" && (
                                        <Segmented
                                            options={GRAN_OPTIONS}
                                            value={gran}
                                            onChange={(v) => {
                                                setGran(v);
                                            }}
                                            size="sm"
                                        />
                                    )}
                                    <Segmented
                                        options={XAXIS_OPTIONS.map((o) => ({
                                            ...o,
                                            disabled: isSessionMetric && o.value !== "time",
                                        }))}
                                        value={effectiveXaxis}
                                        onChange={(v) => {
                                            setXaxis(v);
                                        }}
                                        size="sm"
                                    />
                                </span>
                            </h3>
                            <div className="bar-chart-wrap">
                                <BarChart
                                    records={currentRecords}
                                    metric={metric}
                                    xaxis={effectiveXaxis}
                                    gran={gran}
                                    start={currentRange.start}
                                    end={currentRange.end}
                                    theme={theme}
                                    dirAliases={dirAliases}
                                    modelAliases={modelAliases}
                                />
                            </div>
                        </div>
                        <div className="card span-4">
                            <h3>时段热力</h3>
                            <Heatmap records={currentRecords} metric={metric} theme={theme} />
                        </div>
                    </div>

                    <div className="grid">
                        <SessionTable
                            rows={sessionRowsFromSessions(currentSessions)}
                            theme={theme}
                            modelColors={modelColorMapFromBuckets(
                                currentBuckets,
                                theme,
                                metric === "calls"
                                    ? (b) => b.calls
                                    : metric === "sessions"
                                      ? (b) => b.sessions
                                      : undefined,
                            )}
                            modelAliases={modelAliases}
                        />
                    </div>
                </>
            )}
        </div>
    );
}
