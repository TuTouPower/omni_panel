import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
    TokenStatsDashboardDto,
    TokenStatsDashboardSessionsDto,
    TokenStatsDashboardSessionSummary,
    TokenStatsEnv,
} from "../../shared/types/token-stats";
import type { TokenStatsStatus } from "../../shared/types/ipc";
import { MetricDonut } from "../components/token-stats/MetricDonut";
import { BarChart } from "../components/token-stats/BarChart";
import { Heatmap } from "../components/token-stats/Heatmap";
import { SessionTable } from "../components/token-stats/SessionTable";
import { Segmented } from "../components/token-stats/Segmented";
import { RangePicker } from "../components/token-stats/RangePicker";
import { Icon } from "../components/Icon";
import { fmtInt, fmtRelativeTime, fmtTok } from "../lib/token-stats/format";
import type { AgentFilter, Granularity, Metric, SessionRow, XAxis } from "../lib/token-stats/types";
import {
    create_token_stats_query_cache,
    type TokenStatsQueryKey,
} from "../lib/token-stats/query-cache";
import { is_web } from "../lib/is-web";
import "../styles/token-stats.css";

const MODULE = "TokenStatsView";

type Theme = "dark" | "light";
type RangePreset = "24h" | "7d" | "30d";
type PlatformFilter = "all" | TokenStatsEnv;
const SESSION_QUERY_LIMIT = 100;

const AGENT_OPTIONS: { value: AgentFilter; label: string }[] = [
    { value: "all", label: "全部工具" },
    { value: "claude-code", label: "Claude Code" },
    { value: "opencode", label: "OpenCode" },
    { value: "kimi-code", label: "Kimi Code" },
    { value: "grok", label: "Grok" },
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
    model: string;
}

interface TokenStatsQueryData {
    dashboard: TokenStatsDashboardDto;
}

function dashboard_segments(
    values: readonly { key: string; value: number }[],
    theme: Theme,
): { name: string; value: number; itemStyle: { color: string } }[] {
    const colors = ["#7c6cf6", "#4cc2ff", "#3ddc97", "#ffb454", "#f56cc6"];
    const top = values.slice(0, 5).map((item, index) => ({
        name: item.key,
        value: item.value,
        itemStyle: { color: colors[index] ?? (theme === "dark" ? "#46506a" : "#98a0b4") },
    }));
    const other_value = values.slice(5).reduce((sum, item) => sum + item.value, 0);
    if (other_value > 0) {
        top.push({
            name: "其他",
            value: other_value,
            itemStyle: { color: theme === "dark" ? "#46506a" : "#98a0b4" },
        });
    }
    return top;
}

function effective_granularity(
    preset: RangePreset | null,
    custom: { start: number; end: number } | null,
    gran: Granularity,
): Granularity {
    if (custom) return gran;
    return preset === "24h" ? "hour" : gran;
}

function dashboard_session_rows(items: readonly TokenStatsDashboardSessionSummary[]): SessionRow[] {
    return items.map((item) => {
        const tokens =
            item.input_tokens +
            item.output_tokens +
            item.cache_read_tokens +
            item.cache_write_tokens;
        const input_with_cache = item.input_tokens + item.cache_read_tokens;
        return {
            session_id: item.session_id,
            identity_key: `${item.source}|${item.env}|${item.session_id}`,
            title: item.title ?? "(无标题)",
            slug: null,
            directory: item.directory ?? "—",
            agent: item.source.replace(/_/g, "-"),
            version: null,
            sub: false,
            models: [...item.models],
            calls: item.calls,
            tokens,
            cacheRate: input_with_cache ? item.cache_read_tokens / input_with_cache : 0,
            lastTs: item.ended_at,
        };
    });
}

function dashboard_model_colors(
    values: readonly { key: string; value: number }[],
    theme: Theme,
): Map<string, string> {
    const colors = ["#7c6cf6", "#4cc2ff", "#3ddc97", "#ffb454", "#f56cc6"];
    return new Map(
        values
            .slice(0, 5)
            .map((item, index) => [
                item.key,
                colors[index] ?? (theme === "dark" ? "#46506a" : "#98a0b4"),
            ]),
    );
}

const TOKEN_STATS_CACHE_MAX_ENTRIES = 8;
const PRESET_RANGE_CACHE_TTL_MS = 5 * 60 * 1000;

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
    const [dashboard, setDashboard] = useState<TokenStatsDashboardDto | null>(null);
    const [status, setStatus] = useState<TokenStatsStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [agent, setAgent] = useState<AgentFilter>(saved.agent ?? "all");
    const [platform, setPlatform] = useState<PlatformFilter>(saved.platform ?? "all");
    const [preset, setPreset] = useState<RangePreset | null>(saved.preset ?? "30d");
    const [custom, setCustom] = useState<{ start: number; end: number } | null>(null);
    const [metric, setMetric] = useState<Metric>(saved.metric ?? "tokens");
    const [xaxis, setXaxis] = useState<XAxis>(saved.xaxis ?? "time");
    const [gran, setGran] = useState<Granularity>(saved.gran ?? "day");
    const [model, setModel] = useState<string>(saved.model ?? "all");
    const [theme, setTheme] = useState<Theme>(readSavedTheme());
    const [dirAliases, setDirAliases] = useState<{ alias: string; dirs: string[] }[]>([]);
    const [modelAliases, setModelAliases] = useState<{ alias: string; models: string[] }[]>([]);
    const effective_xaxis = metric === "sessions" ? "time" : xaxis;
    const effective_gran = effective_granularity(preset, custom, gran);
    const alias_fingerprint = useMemo(
        () =>
            JSON.stringify({
                dir: dirAliases.map(({ alias, dirs }) => ({ alias, keys: dirs })),
                model: modelAliases.map(({ alias, models }) => ({ alias, keys: models })),
            }),
        [dirAliases, modelAliases],
    );
    const query_cache = useMemo(
        () =>
            create_token_stats_query_cache<TokenStatsQueryData>({
                max_entries: TOKEN_STATS_CACHE_MAX_ENTRIES,
            }),
        [],
    );
    const load_request_id = useRef(0);
    const has_loaded_data = useRef(false);
    // Monotonic data version of the latest committed batch the renderer has
    // seen (from dashboard.data_version). Events with a version ≤ this carry no
    // new data, so cached payloads stay valid (t192 AC4).
    const last_data_version = useRef(0);
    const preset_ranges = useRef<
        Partial<Record<RangePreset, { start: number; end: number; captured_at: number }>>
    >({});
    const [preset_range_revision, set_preset_range_revision] = useState(0);
    const [session_offset, set_session_offset] = useState(0);
    const [session_page, set_session_page] = useState<TokenStatsDashboardSessionsDto | null>(null);
    // Display dimensions (metric/xaxis) must not invalidate the dashboard query
    // cache (p026/t200): the response is metric/xaxis-agnostic (chart_data), so
    // switching them re-derives locally. The fetch reads them through a ref so
    // metric/xaxis switches never re-create loadData (gran stays in the key —
    // it shapes the returned bucket granularity).
    const display_ref = useRef({ metric, xaxis: effective_xaxis, gran: effective_gran });
    display_ref.current = { metric, xaxis: effective_xaxis, gran: effective_gran };
    const range_refresh_key = `${agent}|${platform}|${model}`;

    const currentRange = useMemo(() => {
        void preset_range_revision;
        void range_refresh_key;
        if (custom) return { ...custom };
        if (preset) {
            const cached = preset_ranges.current[preset];
            if (cached && Date.now() - cached.captured_at < PRESET_RANGE_CACHE_TTL_MS) {
                return { start: cached.start, end: cached.end };
            }
            const range = presetRange(preset);
            preset_ranges.current[preset] = { ...range, captured_at: range.end };
            return range;
        }
        return { start: 0, end: Date.now() };
    }, [custom, preset, preset_range_revision, range_refresh_key]);

    // Sessions reset with the dashboard data identity (agent/platform/model/
    // range/gran/aliases), not display dims — paging within one window survives
    // metric/xaxis switches (p029/t200).
    const session_data_identity = `${agent}|${platform}|${model}|${String(currentRange.start)}|${String(currentRange.end)}|${effective_gran}|${alias_fingerprint}`;
    const last_session_data_identity = useRef<string | null>(null);

    const updatedAgo = useMemo(() => {
        if (!status?.last_updated) return null;
        return fmtRelativeTime(Date.now() - status.last_updated);
    }, [status?.last_updated]);

    const apply_query_data = useCallback((data: TokenStatsQueryData): void => {
        has_loaded_data.current = true;
        setError(null);
        setDashboard(data.dashboard);
        setStatus(data.dashboard.status);
        last_data_version.current = data.dashboard.data_version;
    }, []);

    const apply_config_aliases = useCallback(
        (config: {
            readonly dirAliases?: readonly {
                readonly alias: string;
                readonly dirs: readonly string[];
            }[];
            readonly modelAliases?: readonly {
                readonly alias: string;
                readonly models: readonly string[];
            }[];
        }): void => {
            setDirAliases(
                (config.dirAliases ?? []).map((a) => ({ alias: a.alias, dirs: [...a.dirs] })),
            );
            setModelAliases(
                (config.modelAliases ?? []).map((a) => ({ alias: a.alias, models: [...a.models] })),
            );
        },
        [],
    );

    const loadData = useCallback(
        async (silent = false) => {
            const request_id = ++load_request_id.current;
            const {
                metric: fetch_metric,
                xaxis: fetch_xaxis,
                gran: fetch_gran,
            } = display_ref.current;
            if (last_session_data_identity.current !== session_data_identity) {
                last_session_data_identity.current = session_data_identity;
                set_session_offset(0);
                set_session_page(null);
            }
            const query_key: TokenStatsQueryKey = {
                agent,
                platform,
                model,
                range_start: currentRange.start,
                range_end: currentRange.end,
                query_mode: "dashboard",
                gran: effective_gran,
                alias_fingerprint,
            };
            const cached = query_cache.peek(query_key);
            if (cached) {
                apply_query_data(cached.data);
                setLoading(false);
                setRefreshing(cached.stale);
            } else {
                if (!silent && !has_loaded_data.current) setLoading(true);
                setRefreshing(has_loaded_data.current);
            }

            try {
                const result = await query_cache.load(query_key, async () => ({
                    dashboard: await window.usageboard.tokenStats.getDashboard({
                        agent,
                        platform,
                        start: currentRange.start,
                        end: currentRange.end,
                        metric: fetch_metric,
                        xaxis: fetch_xaxis,
                        gran: fetch_gran,
                        ...(model !== "all" ? { model } : {}),
                        session_offset: 0,
                        session_limit: SESSION_QUERY_LIMIT,
                        ...(dirAliases.length
                            ? {
                                  dir_aliases: dirAliases.map(({ alias, dirs }) => ({
                                      alias,
                                      keys: dirs,
                                  })),
                              }
                            : {}),
                        ...(modelAliases.length
                            ? {
                                  model_aliases: modelAliases.map(({ alias, models }) => ({
                                      alias,
                                      keys: models,
                                  })),
                              }
                            : {}),
                    }),
                }));
                if (request_id !== load_request_id.current) return;
                if (!cached || cached.stale) apply_query_data(result.data);
            } catch (err: unknown) {
                if (request_id !== load_request_id.current) return;
                const message = err instanceof Error ? err.message : String(err);
                setError(message);
                window.usageboard.log({
                    level: "error",
                    module: MODULE,
                    message: `Failed to load token stats: ${err instanceof Error ? err.message : String(err)}`,
                });
            } finally {
                if (request_id === load_request_id.current) {
                    setLoading(false);
                    setRefreshing(false);
                }
            }
        },
        [
            agent,
            alias_fingerprint,
            apply_query_data,
            currentRange,
            model,
            dirAliases,
            effective_gran,
            modelAliases,
            platform,
            query_cache,
            session_data_identity,
        ],
    );

    useEffect(() => {
        void loadData();
    }, [loadData]);

    // Session pagination (p029/t200): page changes fetch only the session page
    // through a dedicated channel; the dashboard cache (summary/chart/heatmap)
    // is never re-requested on pagination.
    useEffect(() => {
        if (session_offset === 0) return;
        let active = true;
        window.usageboard.tokenStats
            .getDashboardSessions({
                agent,
                platform,
                start: currentRange.start,
                end: currentRange.end,
                ...(model !== "all" ? { model } : {}),
                session_offset,
                session_limit: SESSION_QUERY_LIMIT,
                ...(dirAliases.length
                    ? {
                          dir_aliases: dirAliases.map(({ alias, dirs }) => ({
                              alias,
                              keys: dirs,
                          })),
                      }
                    : {}),
                ...(modelAliases.length
                    ? {
                          model_aliases: modelAliases.map(({ alias, models }) => ({
                              alias,
                              keys: models,
                          })),
                      }
                    : {}),
            })
            .then((page) => {
                if (active) set_session_page(page);
            })
            .catch((err: unknown) => {
                if (active) {
                    setError(err instanceof Error ? err.message : String(err));
                }
            });
        return () => {
            active = false;
        };
    }, [session_offset, agent, platform, model, currentRange, dirAliases, modelAliases]);

    useEffect(() => {
        let active = true;
        let config_event_version = 0;
        const unsubscribe = window.usageboard.event.onConfigChange?.((config) => {
            config_event_version += 1;
            apply_config_aliases(config);
        });
        void window.usageboard.config
            .get()
            .then(({ config }) => {
                if (active && config_event_version === 0) apply_config_aliases(config);
            })
            .catch((err: unknown) => {
                window.usageboard.log({
                    level: "error",
                    module: MODULE,
                    message: `Failed to load token stats aliases: ${err instanceof Error ? err.message : String(err)}`,
                });
            });
        return () => {
            active = false;
            unsubscribe?.();
        };
    }, [apply_config_aliases]);

    useEffect(() => {
        return window.usageboard.tokenStats.onUpdated((dataVersion) => {
            // Skip revalidating cached payloads when the event carries no newer
            // committed data (t192 AC4): a version equal to the last seen one
            // means the cache is already current. Version 0 is the web build
            // (no push channel) — treat as new so polled refreshes keep firing.
            if (dataVersion > 0 && dataVersion <= last_data_version.current) {
                return;
            }
            query_cache.mark_stale();
            // A committed data-version bump invalidates the cached session page
            // too: fall back to the refreshed dashboard's first page so the
            // paged list never shows stale rows (t200 AC3). The preset branch
            // also shifts currentRange (loadData re-resets via the identity
            // check); the custom-range branch relies on this reset alone.
            set_session_offset(0);
            set_session_page(null);
            if (preset) {
                const range = presetRange(preset);
                preset_ranges.current[preset] = { ...range, captured_at: range.end };
                set_preset_range_revision((revision) => revision + 1);
            } else {
                void loadData(true);
            }
        });
    }, [loadData, preset, query_cache]);

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
        saveTheme(theme);
    }, [theme]);

    useEffect(() => {
        save_prefs({ agent, platform, preset, metric, xaxis, gran, model });
    }, [agent, platform, preset, metric, xaxis, gran, model]);

    const currentSessionItems = useMemo(
        () => session_page?.items ?? dashboard?.sessions.items ?? [],
        [session_page, dashboard],
    );
    const sessions_total = session_page?.total ?? dashboard?.sessions.total ?? 0;
    const currentSessionRows = useMemo(
        () => dashboard_session_rows(currentSessionItems),
        [currentSessionItems],
    );
    const currentKpi = dashboard?.current ?? { tokens: 0, sessions: 0, calls: 0 };
    const prevKpi = dashboard?.previous ?? { tokens: 0, sessions: 0, calls: 0 };
    const currentSummary = dashboard?.current;
    const previousSummary = dashboard?.previous;
    // Model filter options: the window's distinct models plus the currently
    // selected value (kept when the window no longer contains it).
    const modelOptions = useMemo(() => {
        const list: string[] = model === "all" ? [] : [model];
        for (const m of dashboard?.models ?? []) {
            if (!list.includes(m)) list.push(m);
        }
        return list;
    }, [model, dashboard?.models]);
    const currentComp = currentSummary
        ? [
              {
                  name: "cache_read",
                  value: currentSummary.cache_read_tokens,
                  itemStyle: { color: "#3ddc97" },
              },
              {
                  name: "input",
                  value: currentSummary.input_tokens,
                  itemStyle: { color: "#4cc2ff" },
              },
              {
                  name: "cache_write",
                  value: currentSummary.cache_write_tokens,
                  itemStyle: { color: "#ffb454" },
              },
              {
                  name: "output",
                  value: currentSummary.output_tokens,
                  itemStyle: { color: "#7c6cf6" },
              },
          ].filter((item) => item.value > 0)
        : [];
    const compInput = currentSummary?.input_tokens ?? 0;
    const compCacheRead = currentSummary?.cache_read_tokens ?? 0;
    const hitRate = compCacheRead + compInput > 0 ? compCacheRead / (compCacheRead + compInput) : 0;
    const prevInput = previousSummary?.input_tokens ?? 0;
    const prevCacheRead = previousSummary?.cache_read_tokens ?? 0;
    const prevHitRate =
        prevCacheRead + prevInput > 0 ? prevCacheRead / (prevCacheRead + prevInput) : 0;
    const totalTokens = currentKpi.tokens;
    const totalSessions = currentKpi.sessions;
    const totalCalls = currentKpi.calls;
    const prevTokens = prevKpi.tokens;
    const prevSessions = prevKpi.sessions;
    const prevCalls = prevKpi.calls;
    const agentSegmentsData = dashboard_segments(currentSummary?.agent_totals ?? [], theme);
    const modelTokenSegs = dashboard_segments(currentSummary?.model_token_totals ?? [], theme);
    const modelCallSegs = dashboard_segments(currentSummary?.model_call_totals ?? [], theme);
    const modelColors = dashboard_model_colors(currentSummary?.model_token_totals ?? [], theme);
    const currentRecords: never[] = [];
    const currentBuckets: never[] = [];
    const hourBuckets: never[] = [];
    const rollup: never[] = [];
    const topAgentSeg = agentSegmentsData.reduce<{ name: string; value: number } | null>(
        (acc, b) => (!acc || b.value > acc.value ? b : acc),
        null,
    );
    const topAgentLabel = topAgentSeg ? topAgentSeg.name.replace(/ /g, "\\n") : "—";
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
                        {refreshing && (
                            <span className="update-ago" data-testid="token-stats-refreshing">
                                刷新中...
                            </span>
                        )}
                        {error && dashboard && (
                            <span className="update-ago" role="status">
                                刷新失败
                            </span>
                        )}
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
                    <select
                        className="pgselect ts-model-select"
                        aria-label="模型筛选"
                        value={model}
                        onChange={(e) => {
                            setModel(e.target.value);
                        }}
                    >
                        <option value="all">全部模型</option>
                        {modelOptions.map((m) => (
                            <option key={m} value={m}>
                                {m}
                            </option>
                        ))}
                    </select>
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
                        className="ts-nav-btn ts-nav-icon"
                        type="button"
                        title="用量面板"
                        aria-label="用量面板"
                        onClick={() => {
                            window.usageboard.tray.open_panel();
                        }}
                    >
                        <Icon name="clock_forward" size={16} />
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
                    {!is_web() && (
                        <button
                            className="ts-nav-btn ts-nav-icon"
                            type="button"
                            title="到会话历史"
                            aria-label="到会话历史"
                            onClick={() => {
                                // 纯跳转入口：无具体会话，开/聚焦空窗。
                                void window.usageboard.sessionHistory.open("", "", "");
                            }}
                        >
                            <Icon name="chat_square" size={16} />
                        </button>
                    )}
                </div>
            </header>

            {loading ? (
                <div className="empty">加载中...</div>
            ) : error && !dashboard ? (
                <div className="empty" role="alert">
                    查询失败：{error}
                    <button
                        type="button"
                        onClick={() => {
                            void loadData();
                        }}
                    >
                        重试
                    </button>
                </div>
            ) : !dashboard || dashboard.current.calls === 0 ? (
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
                                segments={dashboard_segments(
                                    currentSummary?.project_session_totals ?? [],
                                    theme,
                                )}
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
                                    {effective_xaxis === "time" && (
                                        <Segmented
                                            options={GRAN_OPTIONS}
                                            value={effective_gran}
                                            onChange={(v) => {
                                                setGran(v);
                                            }}
                                            size="sm"
                                        />
                                    )}
                                    <Segmented
                                        options={XAXIS_OPTIONS.map((o) => ({
                                            ...o,
                                            disabled: metric === "sessions" && o.value !== "time",
                                        }))}
                                        value={effective_xaxis}
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
                                    buckets={currentBuckets}
                                    hourBuckets={hourBuckets}
                                    rollup={rollup}
                                    metric={metric}
                                    xaxis={effective_xaxis}
                                    gran={effective_gran}
                                    start={currentRange.start}
                                    end={currentRange.end}
                                    theme={theme}
                                    dirAliases={dirAliases}
                                    modelAliases={modelAliases}
                                    chartData={dashboard.chart_data}
                                />
                            </div>
                        </div>
                        <div className="card span-4">
                            <h3>时段热力</h3>
                            <Heatmap cells={dashboard.heatmap} metric={metric} theme={theme} />
                        </div>
                    </div>

                    <div className="grid">
                        <SessionTable
                            rows={currentSessionRows}
                            theme={theme}
                            modelColors={modelColors}
                            modelAliases={modelAliases}
                            totalRows={sessions_total}
                            loadedOffset={session_offset}
                            onPageChange={set_session_offset}
                            onOpenSession={(identity_key) => {
                                // identity_key = source|env|session_id；无管道分隔（session_id
                                // 兜底）时丢弃，避免拆出非法 source 打开错误会话。
                                const parts = identity_key.split("|");
                                if (parts.length !== 3) return;
                                void window.usageboard.sessionHistory.open(
                                    parts[0] ?? "",
                                    parts[1] ?? "",
                                    parts[2] ?? "",
                                );
                            }}
                            onOpenSelected={(keys) => {
                                for (const key of keys) {
                                    const parts = key.split("|");
                                    if (parts.length !== 3) continue;
                                    void window.usageboard.sessionHistory.open(
                                        parts[0] ?? "",
                                        parts[1] ?? "",
                                        parts[2] ?? "",
                                    );
                                }
                            }}
                        />
                    </div>
                </>
            )}
        </div>
    );
}
