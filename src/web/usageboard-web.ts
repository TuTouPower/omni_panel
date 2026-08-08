/**
 * Web entry shim that provides `window.usageboard` over the local-api HTTP
 * endpoints. Used only by the web build (browsers reach the desktop app's
 * local-api on 0.0.0.0). Electron builds keep using preload's ipcRenderer
 * bridge. Native-only surfaces (tray, window controls) are no-ops; the
 * renderer hides their buttons in web mode (see is_web flag).
 */
import type {
    UsageboardApi,
    ConnectorSnapshotDTO,
    HistoryMessageLike,
    RendererLogPayload,
    SessionHistoryLoc,
    SessionHistorySearchContentRequest,
    SessionHistorySearchContentResponse,
} from "../shared/types/ipc";
import type {
    TokenStatsHeatmapFilters,
    TokenStatsHourFilters,
    TokenStatsRollupFilters,
    TokenStatsDashboardQuery,
    TokenStatsDashboardSessionsQuery,
    TokenStatsSession,
    TokenStatsSessionFilters,
} from "../shared/types/token-stats";

const POLL_MS = 10_000;

async function get_json<T>(path: string): Promise<T> {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`GET ${path} failed: ${String(res.status)}`);
    return res.json() as Promise<T>;
}

async function post_json(path: string, body: unknown): Promise<unknown> {
    const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${path} failed: ${String(res.status)}`);
    return res.json();
}

const noop = (): void => undefined;
const return_noop = (): (() => void) => noop;
const noop_promise_void = (): Promise<void> => Promise.resolve();
const noop_promise_logged_out = (): Promise<{ logged_out: boolean }> =>
    Promise.resolve({ logged_out: false });
const noop_promise_refresh_result = (): Promise<{ success: boolean; error?: string }> =>
    Promise.resolve({ success: false });
const noop_promise_device_start = (): Promise<{
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete: string | null;
    expires_in: number;
    interval: number;
}> =>
    Promise.resolve({
        device_code: "",
        user_code: "",
        verification_uri: "",
        verification_uri_complete: null,
        expires_in: 0,
        interval: 0,
    });

export function create_web_usageboard(): UsageboardApi {
    const token_stats_callbacks = new Set<(dataVersion: number) => void>();
    // t228: web 端无窗口广播，sessionHistory.open 直接分发给 onFocus 订阅者，
    // 对齐 Electron 主进程 open_or_focus 的广播语义，让「打开会话」能装工作台槽位。
    const session_focus_listeners = new Set<
        (loc: { source: string; env: string; session_id: string }) => void
    >();
    setInterval(() => {
        // Web build has no push channel for committed data versions; polled
        // dashboards carry their own data_version, so events pass 0 (no-op
        // for version-based staleness, still triggers a refresh request).
        for (const cb of token_stats_callbacks) cb(0);
    }, POLL_MS);

    // SSE push channel — mirrors the desktop IPC EVENT_STATE_CHANGE broadcast.
    // local-api streams runtimeStore state changes over GET /v1/events; this
    // relays them to renderer subscribers (use_plugins) so the web panel
    // refreshes without polling.
    const state_change_cbs = new Set<(instanceId: string, state: ConnectorSnapshotDTO) => void>();
    let events_source: EventSource | null = null;
    function ensure_events(): void {
        if (events_source) return;
        events_source = new EventSource("/v1/events");
        events_source.addEventListener("message", (ev: MessageEvent) => {
            try {
                const payload = JSON.parse(ev.data as string) as {
                    instanceId: string;
                    state: ConnectorSnapshotDTO;
                };
                for (const cb of state_change_cbs) {
                    cb(payload.instanceId, payload.state);
                }
            } catch {
                /* ignore malformed SSE frame */
            }
        });
    }

    const api: UsageboardApi = {
        platform: "win32" as const,
        connector: {
            list: () => get_json("/v1/connectors"),
            catalog: () => get_json("/v1/catalog"),
            getState: (instanceId: string) =>
                get_json(`/v1/connectors/${encodeURIComponent(instanceId)}/state`),
            refresh: (instanceId: string) =>
                post_json(
                    `/v1/connectors/${encodeURIComponent(instanceId)}/refresh`,
                    {},
                ) as Promise<void>,
            refreshAll: () => post_json("/v1/connectors", {}) as Promise<void>,
            snapshot: () => Promise.resolve({}),
        },
        plugin: {
            list: () => get_json("/v1/connectors"),
            getState: (instanceId: string) =>
                get_json(`/v1/connectors/${encodeURIComponent(instanceId)}/state`),
            refresh: (instanceId: string) =>
                post_json(
                    `/v1/connectors/${encodeURIComponent(instanceId)}/refresh`,
                    {},
                ) as Promise<void>,
            refreshAll: () => post_json("/v1/connectors", {}) as Promise<void>,
        },
        config: {
            get: () => get_json("/v1/config"),
            save: async (config: unknown) => {
                await post_json("/v1/config", config);
            },
            getSecrets: (instanceId: string) =>
                get_json(`/v1/secrets?instanceId=${encodeURIComponent(instanceId)}`),
            saveSecrets: async (payload: unknown) => {
                await post_json("/v1/secrets", payload);
            },
            duplicate: () => Promise.resolve({ instanceId: "" }),
            createInstance: () => Promise.resolve({ instanceId: "" }),
            export: () => Promise.resolve({ saved: false }),
            import: () => Promise.resolve({ imported: false }),
        },
        event: {
            onStateChange: (cb: (instanceId: string, state: ConnectorSnapshotDTO) => void) => {
                ensure_events();
                state_change_cbs.add(cb);
                return () => {
                    state_change_cbs.delete(cb);
                };
            },
            onConfigChange: return_noop,
            onThemeChange: return_noop,
            onSettingsNavigate: return_noop,
        },
        popup: { report_content_height: noop },
        main_panel: { hide: noop, get_mode: () => Promise.resolve("popup" as const) },
        theme: { set: noop },
        settings: {
            open: () => {
                window.location.hash = "setting";
            },
            openConnectorsDir: noop,
        },
        tray: {
            open_panel: () => {
                window.location.hash = "usage";
            },
            refresh_all: noop,
            toggle_pause: noop,
            toggle_autostart: noop,
            open_settings: noop,
            open_web: noop,
            check_update: noop,
            survey: noop,
            sponsor: noop,
            restart: noop,
            quit: noop,
            hide: noop,
            report_menu_size: noop,
            on_pause_state: return_noop,
            on_autostart_state: return_noop,
        },
        auth: { cookieLogin: () => Promise.resolve({ saved: false }) },
        session: {
            login: () => Promise.resolve({ saved: false }),
            refresh: () => Promise.resolve({ saved: false }),
        },
        grok: {
            login_start: noop_promise_device_start,
            login_poll: () => Promise.resolve({ saved: false }),
            login_cancel: noop_promise_void,
            login_status: () =>
                Promise.resolve({ has_token: false, expires_at: null, can_refresh: false }),
            logout: noop_promise_logged_out,
            refresh: noop_promise_refresh_result,
        },
        kimi: {
            login_start: noop_promise_device_start,
            login_poll: () => Promise.resolve({ saved: false }),
            login_cancel: noop_promise_void,
            login_status: () =>
                Promise.resolve({ has_token: false, expires_at: null, can_refresh: false }),
            logout: noop_promise_logged_out,
            refresh: noop_promise_refresh_result,
        },
        logs: { export: () => Promise.resolve({ saved: false }) },
        log: (payload: RendererLogPayload) => {
            console.debug("[usageboard]", payload);
        },
        tokenStats: {
            open: () => {
                window.location.hash = "agent";
            },
            getBuckets: () => get_json("/v1/buckets"),
            getSessions: (filters?: TokenStatsSessionFilters) => {
                const params = new URLSearchParams();
                if (filters?.source) params.set("source", filters.source);
                if (filters?.sources?.length) params.set("sources", filters.sources.join(","));
                if (filters?.env) params.set("env", filters.env);
                if (filters?.search) params.set("search", filters.search);
                if (filters?.start_at !== undefined)
                    params.set("start_at", String(filters.start_at));
                if (filters?.end_at !== undefined) params.set("end_at", String(filters.end_at));
                if (filters?.order_by) params.set("order_by", filters.order_by);
                if (filters?.direction) params.set("direction", filters.direction);
                if (filters?.limit !== undefined) params.set("limit", String(filters.limit));
                if (filters?.offset !== undefined) params.set("offset", String(filters.offset));
                const qs = params.toString();
                return get_json(`/v1/sessions${qs ? `?${qs}` : ""}`);
            },
            getSessionStats: () => get_json("/v1/sessionStats"),
            getRecords: () => get_json("/v1/records"),
            getHeatmap: (filters?: TokenStatsHeatmapFilters) => {
                const params = new URLSearchParams();
                if (filters?.agent) params.set("agent", filters.agent);
                if (filters?.env) params.set("env", filters.env);
                if (filters?.model) params.set("model", filters.model);
                if (filters?.start !== undefined) params.set("start", String(filters.start));
                if (filters?.end !== undefined) params.set("end", String(filters.end));
                const qs = params.toString();
                return get_json(`/v1/heatmap${qs ? `?${qs}` : ""}`);
            },
            getHourBuckets: (filters?: TokenStatsHourFilters) => {
                const params = new URLSearchParams();
                if (filters?.agent) params.set("agent", filters.agent);
                if (filters?.env) params.set("env", filters.env);
                if (filters?.model) params.set("model", filters.model);
                if (filters?.start !== undefined) params.set("start", String(filters.start));
                if (filters?.end !== undefined) params.set("end", String(filters.end));
                const qs = params.toString();
                return get_json(`/v1/hourBuckets${qs ? `?${qs}` : ""}`);
            },
            getRangeRollup: (filters?: TokenStatsRollupFilters) => {
                const params = new URLSearchParams();
                if (filters?.agent) params.set("agent", filters.agent);
                if (filters?.env) params.set("env", filters.env);
                if (filters?.model) params.set("model", filters.model);
                if (filters?.start !== undefined) params.set("start", String(filters.start));
                if (filters?.end !== undefined) params.set("end", String(filters.end));
                const qs = params.toString();
                return get_json(`/v1/rollup${qs ? `?${qs}` : ""}`);
            },
            getDashboard: (query: TokenStatsDashboardQuery) => {
                const params = new URLSearchParams({
                    agent: query.agent,
                    platform: query.platform,
                    start: String(query.start),
                    end: String(query.end),
                    metric: query.metric,
                    xaxis: query.xaxis,
                    gran: query.gran,
                });
                if (query.model !== undefined) {
                    params.set("model", query.model);
                }
                if (query.session_offset !== undefined) {
                    params.set("session_offset", String(query.session_offset));
                }
                if (query.session_limit !== undefined) {
                    params.set("session_limit", String(query.session_limit));
                }
                if (query.dir_aliases?.length) {
                    params.set("dir_aliases", JSON.stringify(query.dir_aliases));
                }
                if (query.model_aliases?.length) {
                    params.set("model_aliases", JSON.stringify(query.model_aliases));
                }
                return get_json(`/v1/dashboard?${params.toString()}`);
            },
            getDashboardSessions: (query: TokenStatsDashboardSessionsQuery) => {
                const params = new URLSearchParams({
                    agent: query.agent,
                    platform: query.platform,
                    start: String(query.start),
                    end: String(query.end),
                });
                if (query.model !== undefined) {
                    params.set("model", query.model);
                }
                if (query.session_offset !== undefined) {
                    params.set("session_offset", String(query.session_offset));
                }
                if (query.session_limit !== undefined) {
                    params.set("session_limit", String(query.session_limit));
                }
                if (query.dir_aliases?.length) {
                    params.set("dir_aliases", JSON.stringify(query.dir_aliases));
                }
                if (query.model_aliases?.length) {
                    params.set("model_aliases", JSON.stringify(query.model_aliases));
                }
                return get_json(`/v1/dashboard/sessions?${params.toString()}`);
            },
            getStatus: () => get_json("/v1/status"),
            onUpdated: (cb: (dataVersion: number) => void) => {
                token_stats_callbacks.add(cb);
                return () => {
                    token_stats_callbacks.delete(cb);
                };
            },
        },
        trend: {
            get: (
                provider: string,
                accountId: string,
                metricId: string,
                sourceInstanceId: string,
                days?: number,
            ) => {
                const params = new URLSearchParams({
                    provider,
                    accountId,
                    metricId,
                    sourceInstanceId,
                });
                if (days !== undefined) params.set("days", String(days));
                return get_json<({ date: string; percent: number } | null)[]>(
                    `/v1/trend?${params.toString()}`,
                );
            },
            // t196 AC5: web 后端走 LocalAPI /v1/trend 单周期等价；bulk 按各周期
            // 依次取（web 面不常用，保持契约兼容）。
            getBulk: async (payload: {
                provider: string;
                account_id: string;
                source_instance_id: string;
                periods: { metric_id: string; days?: number }[];
            }) => {
                const series = await Promise.all(
                    payload.periods.map(async (period) => ({
                        metric_id: period.metric_id,
                        series: await get_json<({ date: string; percent: number } | null)[]>(
                            `/v1/trend?${new URLSearchParams({
                                provider: payload.provider,
                                accountId: payload.account_id,
                                metricId: period.metric_id,
                                sourceInstanceId: payload.source_instance_id,
                                ...(period.days !== undefined ? { days: String(period.days) } : {}),
                            }).toString()}`,
                        ),
                    })),
                );
                return { series };
            },
        },
        sessionHistory: {
            open: (source: string, env: string, session_id: string) => {
                for (const fn of session_focus_listeners) {
                    fn({ source, env, session_id });
                }
                return Promise.resolve();
            },
            subscribe: () => Promise.resolve({ subscribed: false }),
            unsubscribe: () => Promise.resolve({ unsubscribed: false }),
            // t228/t237: web 端经 local-api mock 读会话消息（fixture 按 session_id 索引）。
            query: async (
                _source: string,
                _env: string,
                session_id: string,
                options?: { limit?: number; before_cursor?: unknown } | null,
            ) => {
                const params = new URLSearchParams({ id: session_id });
                if (options?.limit) params.set("limit", String(options.limit));
                if (
                    options?.before_cursor != null &&
                    (typeof options.before_cursor === "string" ||
                        typeof options.before_cursor === "number")
                ) {
                    params.set("before_cursor", String(options.before_cursor));
                }
                return get_json<{ messages: HistoryMessageLike[]; next_cursor: string | null }>(
                    `/v1/sessionHistory?${params.toString()}`,
                );
            },
            recent: async () => {
                const sessions = await get_json<TokenStatsSession[]>("/v1/sessions");
                return sessions.slice(0, 20).map((s) => ({
                    source: s.source,
                    env: s.env,
                    session_id: s.id,
                    title: s.title ?? null,
                    agent: s.source.replace(/_/g, "-"),
                }));
            },
            searchContent: (
                _request_or_locs: SessionHistorySearchContentRequest | readonly SessionHistoryLoc[],
                _keyword?: string,
            ) => {
                // t239/t248: web 端当前没有批量内容搜索 endpoint；保留两种调用形态。
                void _request_or_locs;
                void _keyword;
                return Promise.resolve<SessionHistorySearchContentResponse>({
                    hits: [],
                    sessions: [],
                });
            },
            summaries: (_locs: readonly SessionHistoryLoc[]) => {
                // t239: web 端本地 API 暂未暴露批量摘要；返回空映射保持兼容。
                void _locs;
                return Promise.resolve({});
            },
            onMessagesUpdated: () => () => {
                /* web 端不暴露会话历史实时推送 */
            },
            onFocus: (
                fn: (loc: { source: string; env: string; session_id: string }) => void,
            ): (() => void) => {
                session_focus_listeners.add(fn);
                return () => {
                    session_focus_listeners.delete(fn);
                };
            },
        },
        buildInfo: {
            get: () =>
                Promise.resolve({
                    version: "web",
                    branch: "web",
                    commit: "web",
                    subject: "web",
                }),
        },
        // t252: web 无独立窗口，窗口控制 no-op（四面板共享 UI 组件调用，web 静默）。
        window: {
            minimize: () => undefined,
            maximize: () => undefined,
            close: () => undefined,
        },
    };
    return api;
}

export function install_web_usageboard(): void {
    document.documentElement.setAttribute("data-web", "1");
    (window as unknown as { usageboard: UsageboardApi }).usageboard = create_web_usageboard();
}
