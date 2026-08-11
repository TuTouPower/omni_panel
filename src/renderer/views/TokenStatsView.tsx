import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
    TokenStatsDashboardDto,
    TokenStatsDashboardSessionsDto,
    TokenStatsDashboardSessionSummary,
    TokenStatsEnv,
} from "../../shared/types/token-stats";
import type { TokenStatsStatus } from "../../shared/types/ipc";
import { Icon } from "../components/Icon";
import { MetricDonut } from "../components/token-stats/MetricDonut";
import { BarChart } from "../components/token-stats/BarChart";
import { Heatmap } from "../components/token-stats/Heatmap";
import { SessionTable } from "../components/token-stats/SessionTable";
import { RangePicker } from "../components/token-stats/RangePicker";
import { Button, Card, PanelTitleBar, Segmented, Select, WindowControls } from "../components/ui";
import { fmtInt, fmtRelativeTime, fmtTok } from "../lib/token-stats/format";
import type { AgentFilter, Granularity, Metric, SessionRow, XAxis } from "../lib/token-stats/types";
import {
    create_token_stats_query_cache,
    type TokenStatsQueryKey,
} from "../lib/token-stats/query-cache";
import { useGlobalTheme, useTheme } from "../lib/theme";
import { use_chart_palette, type ChartPalette } from "../lib/echarts_token_resolver";
import { use_panel_navigation } from "../lib/panel-navigation";
import logo from "../assets/logo.svg";

const MODULE = "TokenStatsView";

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
    { value: "local", label: "Local" },
    { value: "wsl", label: "WSL" },
];

const RANGE_OPTIONS: { value: RangePreset; label: string }[] = [
    { value: "24h", label: "24 小时" },
    { value: "7d", label: "7 天" },
    { value: "30d", label: "1 月" },
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
    palette: ChartPalette,
): { name: string; value: number; itemStyle: { color: string } }[] {
    const top = values.slice(0, 5).map((item, index) => ({
        name: item.key,
        value: item.value,
        itemStyle: { color: palette.series[index] ?? palette.other },
    }));
    const other_value = values.slice(5).reduce((sum, item) => sum + item.value, 0);
    if (other_value > 0) {
        top.push({
            name: "其他",
            value: other_value,
            itemStyle: { color: palette.other },
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
    palette: ChartPalette,
): Map<string, string> {
    return new Map(
        values.slice(0, 5).map((item, index) => [item.key, palette.series[index] ?? palette.other]),
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
    // t312: 时间范围下拉「自定义」触发 RangePicker 面板（受控开关）。
    const [rangePickerOpen, setRangePickerOpen] = useState(false);
    const [metric, setMetric] = useState<Metric>(saved.metric ?? "tokens");
    const [xaxis, setXaxis] = useState<XAxis>(saved.xaxis ?? "time");
    const [gran, setGran] = useState<Granularity>(saved.gran ?? "day");
    const [model, setModel] = useState<string>(saved.model ?? "all");
    // t252 AC6: 主题跟随全局（弃用独立 usage-theme 存储）。
    const theme = useGlobalTheme();
    // 同步 data-theme 与 canvas 图表 token，确保主题切换立即重绘。
    useTheme();
    const { palette } = use_chart_palette(theme);
    const navigate = use_panel_navigation();
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

    // t309 AC-004: 源级采集状态（unavailable/failed 带原因）在新鲜度旁渲染；
    // ok 源不产生标记。
    const sourceIssues = (status?.sources_status ?? []).filter((s) => s.status !== "ok");

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
    // selected value (kept when the window no longer contains it). Display text
    // uses configured aliases so the dropdown matches chart/donut labels, while
    // the option value stays the original model name for backend filtering.
    const aliasToOriginal = useMemo(() => {
        const map = new Map<string, string>();
        for (const { alias, models } of modelAliases) {
            for (const m of models) {
                if (!map.has(alias)) map.set(alias, m);
            }
        }
        return map;
    }, [modelAliases]);
    const originalToAlias = useMemo(() => {
        const map = new Map<string, string>();
        for (const { alias, models } of modelAliases) {
            for (const m of models) {
                if (!map.has(m)) map.set(m, alias);
            }
        }
        return map;
    }, [modelAliases]);
    const modelOptions = useMemo(() => {
        const list: { value: string; label: string }[] =
            model === "all" ? [] : [{ value: model, label: originalToAlias.get(model) ?? model }];
        for (const alias of dashboard?.models ?? []) {
            const value = aliasToOriginal.get(alias) ?? alias;
            if (!list.some((o) => o.value === value)) {
                list.push({ value, label: alias });
            }
        }
        return list;
    }, [model, dashboard?.models, aliasToOriginal, originalToAlias]);
    const currentComp = currentSummary
        ? [
              {
                  name: "cache_read",
                  value: currentSummary.cache_read_tokens,
                  itemStyle: { color: palette.composition["cache_read"] ?? palette.other },
              },
              {
                  name: "input",
                  value: currentSummary.input_tokens,
                  itemStyle: { color: palette.composition["input"] ?? palette.other },
              },
              {
                  name: "cache_write",
                  value: currentSummary.cache_write_tokens,
                  itemStyle: { color: palette.composition["cache_write"] ?? palette.other },
              },
              {
                  name: "output",
                  value: currentSummary.output_tokens,
                  itemStyle: { color: palette.composition["output"] ?? palette.other },
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
    const agentSegmentsData = dashboard_segments(currentSummary?.agent_totals ?? [], palette);
    const modelTokenSegs = dashboard_segments(currentSummary?.model_token_totals ?? [], palette);
    const modelCallSegs = dashboard_segments(currentSummary?.model_call_totals ?? [], palette);
    const modelColors = dashboard_model_colors(currentSummary?.model_token_totals ?? [], palette);
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
            return (
                <b className="font-mono text-[length:var(--text-body-sm)] font-medium text-[var(--color-on-surface-muted)]">
                    前段无数据
                </b>
            );
        }
        if (pp) {
            const d = (current - previous) * 100;
            return d >= 0 ? (
                <b className="font-mono text-[length:var(--text-body-sm)] font-medium text-[var(--color-success)]">
                    ▲ {d.toFixed(1)} pp
                </b>
            ) : (
                <b className="font-mono text-[length:var(--text-body-sm)] font-medium text-[var(--color-error)]">
                    ▼ {Math.abs(d).toFixed(1)} pp
                </b>
            );
        }
        const d = previous === 0 ? 0 : (current - previous) / previous;
        return d >= 0 ? (
            <b className="font-mono text-[length:var(--text-body-sm)] font-medium text-[var(--color-success)]">
                ▲ {(d * 100).toFixed(1)}%
            </b>
        ) : (
            <b className="font-mono text-[length:var(--text-body-sm)] font-medium text-[var(--color-error)]">
                ▼ {Math.abs(d * 100).toFixed(1)}%
            </b>
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

    const select_range_value: string = custom !== null ? "custom" : (preset ?? "30d");

    const header_title = (
        <div className="flex min-w-0 items-center gap-2">
            <img
                src={logo}
                alt="OmniPanel"
                className="h-6 w-6 shrink-0 object-contain drop-shadow-[0_3px_7px_rgba(61,122,253,0.26)]"
            />
            <span
                className="truncate text-[length:var(--text-title-md)] font-bold tracking-[-0.01em]"
                data-testid="app-title"
            >
                Omni Panel - Agent
            </span>
            {updatedAgo && (
                <span className="shrink-0 font-mono text-[length:var(--text-label-caps)] font-medium text-[var(--color-on-surface-muted)]">
                    {updatedAgo}
                </span>
            )}
            {sourceIssues.map((s) => (
                <span
                    key={`${s.source}|${s.env}`}
                    data-testid="token-stats-source-status"
                    className="shrink-0 font-mono text-[length:var(--text-label-caps)] font-medium text-[var(--color-error)]"
                    title={s.lastError}
                    role="status"
                >
                    {s.source} ({s.env}): {s.lastError ?? s.status}
                </span>
            ))}
            {refreshing && (
                <span
                    className="shrink-0 font-mono text-[length:var(--text-label-caps)] font-medium text-[var(--color-on-surface-muted)]"
                    data-testid="token-stats-refreshing"
                >
                    刷新中...
                </span>
            )}
            {error && dashboard && (
                <span
                    className="shrink-0 font-mono text-[length:var(--text-label-caps)] font-medium text-[var(--color-error)]"
                    role="status"
                >
                    刷新失败
                </span>
            )}
        </div>
    );

    const header_actions = (
        <div className="flex items-center gap-2">
            <Select
                className="h-8 w-auto min-w-[112px] py-1 text-[length:var(--text-label-md)]"
                aria-label="工具筛选"
                value={agent}
                onChange={(e) => {
                    setAgent(e.target.value as AgentFilter);
                }}
            >
                {AGENT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </Select>
            <Select
                className="h-8 w-auto min-w-[88px] py-1 text-[length:var(--text-label-md)]"
                aria-label="平台筛选"
                value={platform}
                onChange={(e) => {
                    setPlatform(e.target.value as PlatformFilter);
                }}
            >
                {PLATFORM_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </Select>
            <Select
                className="h-8 w-auto min-w-[128px] py-1 text-[length:var(--text-label-md)]"
                aria-label="模型筛选"
                value={model}
                onChange={(e) => {
                    setModel(e.target.value);
                }}
            >
                <option value="all">全部模型</option>
                {modelOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </Select>
            <Select
                className="h-8 w-auto min-w-[104px] py-1 text-[length:var(--text-label-md)]"
                aria-label="时间范围"
                value={select_range_value}
                onChange={(e) => {
                    const v = e.target.value;
                    if (v === "custom") {
                        setRangePickerOpen(true);
                    } else {
                        handlePresetChange(v as RangePreset);
                    }
                }}
            >
                {RANGE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
                <option value="custom">自定义</option>
            </Select>
            <RangePicker
                start={currentRange.start}
                end={currentRange.end}
                active={custom !== null}
                open={rangePickerOpen}
                onOpenChange={setRangePickerOpen}
                onApply={(range) => {
                    handleCustomApply(range);
                    setRangePickerOpen(false);
                }}
            />
            <Button
                variant="icon"
                size="sm"
                className="h-8 w-8 p-0"
                title="刷新当前面板"
                aria-label="刷新"
                onClick={() => {
                    void loadData(false);
                }}
            >
                <Icon
                    name="refresh"
                    size={16}
                    {...(refreshing ? { className: "animate-spin" } : {})}
                />
            </Button>
            <Button
                variant="icon"
                size="sm"
                className="h-8 w-8 p-0"
                title="Settings面板"
                aria-label="Settings面板"
                onClick={() => {
                    navigate("Settings");
                }}
            >
                <Icon name="gear" size={16} />
            </Button>
            <Button
                variant="icon"
                size="sm"
                className="h-8 w-8 p-0"
                title="Usage面板"
                aria-label="Usage面板"
                onClick={() => {
                    navigate("Usage");
                }}
            >
                <Icon name="dashboard" size={16} />
            </Button>
            <Button
                variant="icon"
                size="sm"
                className="h-8 w-8 p-0"
                title="Session面板"
                aria-label="Session面板"
                onClick={() => {
                    navigate("Session");
                }}
            >
                <Icon name="chat_square" size={16} />
            </Button>
            <WindowControls />
        </div>
    );

    return (
        <div className="token-stats flex min-h-full flex-col gap-4 bg-[var(--color-surface-window)] p-4 text-[var(--color-on-surface)] md:p-6">
            <PanelTitleBar
                title={header_title}
                actions={header_actions}
                data-panel-titlebar="Agent"
            />

            {loading ? (
                <Card className="flex min-h-[180px] items-center justify-center text-[length:var(--text-label-md)] text-[var(--color-on-surface-muted)]">
                    加载中...
                </Card>
            ) : error && !dashboard ? (
                <Card
                    className="flex flex-wrap items-center justify-center gap-3 text-[length:var(--text-label-md)] text-[var(--color-error)]"
                    role="alert"
                >
                    <span>查询失败：{error}</span>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                            void loadData();
                        }}
                    >
                        重试
                    </Button>
                </Card>
            ) : !dashboard || dashboard.current.calls === 0 ? (
                <Card className="flex min-h-[180px] items-center justify-center text-[length:var(--text-label-md)] text-[var(--color-on-surface-muted)]">
                    该筛选条件下暂无记录
                </Card>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                        <Card className="min-w-0">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <h3 className="m-0 text-[length:var(--text-label-caps)] font-semibold text-[var(--color-on-surface-variant)]">
                                    总 Token 消耗
                                </h3>
                                {deltaHtml(totalTokens, prevTokens)}
                            </div>
                            <MetricDonut
                                centerValue={fmtTok(totalTokens)}
                                segments={modelTokenSegs}
                                format={fmtTok}
                                theme={theme}
                            />
                        </Card>
                        <Card className="min-w-0">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <h3 className="m-0 text-[length:var(--text-label-caps)] font-semibold text-[var(--color-on-surface-variant)]">
                                    会话数
                                </h3>
                                {deltaHtml(totalSessions, prevSessions)}
                            </div>
                            <MetricDonut
                                centerValue={fmtInt(totalSessions)}
                                segments={dashboard_segments(
                                    currentSummary?.project_session_totals ?? [],
                                    palette,
                                )}
                                format={fmtInt}
                                theme={theme}
                            />
                        </Card>
                        <Card className="min-w-0">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <h3 className="m-0 text-[length:var(--text-label-caps)] font-semibold text-[var(--color-on-surface-variant)]">
                                    调用次数
                                </h3>
                                {deltaHtml(totalCalls, prevCalls)}
                            </div>
                            <MetricDonut
                                centerValue={fmtInt(totalCalls)}
                                segments={modelCallSegs}
                                format={fmtInt}
                                theme={theme}
                            />
                        </Card>
                        <Card className="min-w-0">
                            <h3 className="mb-2 m-0 text-[length:var(--text-label-caps)] font-semibold text-[var(--color-on-surface-variant)]">
                                工具占比
                            </h3>
                            <MetricDonut
                                centerValue={topAgentLabel}
                                segments={agentSegmentsData}
                                format={fmtTok}
                                theme={theme}
                            />
                        </Card>
                        <Card className="min-w-0">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <h3 className="m-0 text-[length:var(--text-label-caps)] font-semibold text-[var(--color-on-surface-variant)]">
                                    缓存命中率
                                </h3>
                                {deltaHtml(hitRate, prevHitRate, true)}
                            </div>
                            <MetricDonut
                                centerValue={`${(hitRate * 100).toFixed(1)}%`}
                                segments={currentComp}
                                format={fmtTok}
                                theme={theme}
                            />
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-8">
                        <Card className="min-w-0 xl:col-span-5">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <Segmented
                                    options={METRIC_OPTIONS}
                                    value={metric}
                                    size="sm"
                                    aria-label="图表指标"
                                    onChange={(v) => {
                                        handleMetricChange(v);
                                    }}
                                />
                                <div className="flex flex-wrap items-center gap-2">
                                    {effective_xaxis === "time" && (
                                        <Segmented
                                            options={GRAN_OPTIONS}
                                            value={effective_gran}
                                            size="sm"
                                            aria-label="图表粒度"
                                            onChange={(v) => {
                                                setGran(v);
                                            }}
                                        />
                                    )}
                                    <Segmented
                                        options={XAXIS_OPTIONS.map((o) => ({
                                            ...o,
                                            disabled: metric === "sessions" && o.value !== "time",
                                        }))}
                                        value={effective_xaxis}
                                        size="sm"
                                        aria-label="图表横轴"
                                        onChange={(v) => {
                                            setXaxis(v);
                                        }}
                                    />
                                </div>
                            </div>
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
                        </Card>
                        <Card className="min-w-0 xl:col-span-3">
                            <h3 className="mb-2 m-0 text-[length:var(--text-label-caps)] font-semibold text-[var(--color-on-surface-variant)]">
                                时段热力
                            </h3>
                            <Heatmap cells={dashboard.heatmap} metric={metric} theme={theme} />
                        </Card>
                    </div>

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
                </>
            )}
        </div>
    );
}
