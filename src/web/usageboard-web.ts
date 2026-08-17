/**
 * Web entry shim that provides `window.usageboard` over the local-api HTTP
 * endpoints. Used only by the web build (browsers reach the desktop app's
 * local-api on 0.0.0.0). Electron builds keep using preload's ipcRenderer
 * bridge. Native-only surfaces (tray, window controls) are no-ops; the
 * renderer hides their buttons in web mode (see is_web flag).
 *
 * Theme/accent (t274) are real in web mode too: there is no main-process
 * nativeTheme, so the bridge applies the theme locally (data-theme + chart
 * palette notify) and broadcasts theme/config changes to the same
 * onThemeChange/onConfigChange subscribers the desktop preload serves.
 */
import type {
    UsageboardApi,
    CookieLoginResult,
    CookieLoginStatus,
    GrokDeviceCodeStart,
    GrokLoginResult,
    GrokLoginStatus,
    GrokRefreshResult,
    GrokSettingsApi,
    ConfigExportOptions,
    ConnectorSnapshotDTO,
    HistoryMessageLike,
    RendererLogPayload,
    SessionHistoryLoc,
    SessionHistoryMessagesUpdatedPayload,
    SessionHistorySearchContentRequest,
    SessionHistorySearchContentResponse,
} from "../shared/types/ipc";
import type { AppConfiguration } from "../shared/types/config";
import type {
    TokenStatsHeatmapFilters,
    TokenStatsHourFilters,
    TokenStatsRollupFilters,
    TokenStatsDashboardQuery,
    TokenStatsDashboardSessionsQuery,
    TokenStatsSession,
    TokenStatsSessionFilters,
} from "../shared/types/token-stats";
import { notify_chart_palette_change } from "../renderer/lib/echarts_token_resolver";

const POLL_MS = 10_000;

function response_error_message(value: unknown): string | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const record = value as Record<string, unknown>;
    if (typeof record["message"] === "string" && record["message"]) return record["message"];
    if (typeof record["error"] === "string" && record["error"]) return record["error"];
    const nested_error = record["error"];
    if (typeof nested_error === "object" && nested_error !== null) {
        const nested_message = (nested_error as Record<string, unknown>)["message"];
        if (typeof nested_message === "string" && nested_message) return nested_message;
    }
    return undefined;
}

async function throw_http_error(res: Response, method: string, path: string): Promise<never> {
    let detail: string | undefined;
    try {
        detail = response_error_message(await res.json());
    } catch {
        detail = undefined;
    }
    throw new Error(`${method} ${path} failed: ${detail ?? String(res.status)}`);
}

async function get_json<T>(path: string): Promise<T> {
    const res = await fetch(path);
    if (!res.ok) await throw_http_error(res, "GET", path);
    return res.json() as Promise<T>;
}

async function post_json(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
    const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        ...(signal !== undefined ? { signal } : {}),
    });
    if (!res.ok) await throw_http_error(res, "POST", path);
    return res.json();
}

const noop = (): void => undefined;
const return_noop = (): (() => void) => noop;

type WebOAuthNamespace = "grok" | "kimi";

function create_web_oauth_api(namespace: WebOAuthNamespace): GrokSettingsApi {
    const base = `/v1/auth/${namespace}`;
    return {
        login_start: () => post_json(`${base}/loginStart`, {}) as Promise<GrokDeviceCodeStart>,
        login_poll: (
            instance_id: string,
            device_code: string,
            interval: number,
            expires_at_epoch_ms: number,
        ) =>
            post_json(`${base}/loginPoll`, {
                instance_id,
                device_code,
                interval,
                expires_at_epoch_ms,
            }) as Promise<GrokLoginResult>,
        login_cancel: async (instance_id: string) => {
            await post_json(`${base}/loginCancel`, { instance_id });
        },
        login_status: (instance_id: string) =>
            get_json<GrokLoginStatus>(
                `${base}/loginStatus?instanceId=${encodeURIComponent(instance_id)}`,
            ),
        logout: (instance_id: string) =>
            post_json(`${base}/logout`, { instance_id }) as Promise<{ logged_out: boolean }>,
        refresh: (instance_id: string) =>
            post_json(`${base}/refresh`, { instance_id }) as Promise<GrokRefreshResult>,
    };
}

/**
 * t274: web 端无主进程 nativeTheme，本地应用 data-theme 并同步图表调色板，
 * 与 renderer/lib/theme.ts 的 apply_theme 同语义（幂等：同值不重复写入）。
 */
function apply_theme_dom(is_dark: boolean): void {
    const root = document.documentElement;
    const next_theme = is_dark ? "dark" : "light";
    if (root.getAttribute("data-theme") === next_theme) return;
    root.setAttribute("data-theme", next_theme);
    notify_chart_palette_change();
}

function download_blob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function download_json_file(data: unknown, filename: string): void {
    download_blob(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
        filename,
    );
}

export function create_web_usageboard(): UsageboardApi {
    const token_stats_callbacks = new Set<(dataVersion: number) => void>();
    // t228: web 端无窗口广播，sessionHistory.open 直接分发给 onFocus 订阅者，
    // 对齐 Electron 主进程 open_or_focus 的广播语义，让「打开会话」能装工作台槽位。
    const session_focus_listeners = new Set<
        (loc: { source: string; env: string; session_id: string }) => void
    >();
    // t274: web 无主进程广播，theme/config 变更由 bridge 本地分发，
    // 对齐桌面 CONFIG_CHANGED / EVENT_THEME_CHANGE 广播语义。
    const config_change_callbacks = new Set<(config: AppConfiguration) => void>();
    const theme_change_callbacks = new Set<(isDark: boolean) => void>();
    setInterval(() => {
        // Web build has no push channel for committed data versions; polled
        // dashboards carry their own data_version, so events pass 0 (no-op
        // for version-based staleness, still triggers a refresh request).
        for (const cb of token_stats_callbacks) cb(0);
    }, POLL_MS);

    // t414: 每页一条共享 SSE（connectionId）。state/config/theme 与会话
    // messagesUpdated 复用同一 EventSource，避免每会话一条长连接占满
    // Chrome HTTP/1.1 同 origin 6 连接上限（p187）。同 loc 重复 subscribe 幂等。
    // `registered` 标记首次订阅 POST 成功；共享连接 open/重连时按仍打开的会话重挂。
    interface WebSessionSubEntry {
        readonly subscriber_id: string;
        readonly source: string;
        readonly env: string;
        readonly session_id: string;
        registered: boolean;
    }
    const session_message_callbacks = new Set<
        (payload: SessionHistoryMessagesUpdatedPayload) => void
    >();
    const web_session_subs = new Map<string, WebSessionSubEntry>();
    let web_session_sub_seq = 0;
    // 页级连接 id 须跨 tab 唯一：服务端 sse_connections 以 id 为键，重复会互相覆盖（AC-006）。
    const page_connection_id = `web-conn-${crypto.randomUUID()}`;

    function session_sub_key(source: string, env: string, session_id: string): string {
        return `${source}|${env}|${session_id}`;
    }

    function post_session_subscribe(key: string, sub: WebSessionSubEntry): void {
        void post_json("/v1/sessionHistory/subscribe", {
            source: sub.source,
            env: sub.env,
            session_id: sub.session_id,
            subscriber_id: sub.subscriber_id,
            connection_id: page_connection_id,
        })
            .then(() => {
                sub.registered = true;
            })
            .catch(() => {
                if (!sub.registered) {
                    // 初始登记失败：只清本会话条目，共享 EventSource 继续服务
                    // state/config/theme 与其它会话（renderer 轮询兜底）。
                    if (web_session_subs.get(key) === sub) {
                        web_session_subs.delete(key);
                    }
                }
                // 重连重挂失败：renderer 5s 轮询兜底，下次 open 再试。
            });
    }

    function unsubscribe_loc(key: string): void {
        const sub = web_session_subs.get(key);
        if (!sub) return;
        web_session_subs.delete(key);
        // 共享连接不得因单会话 unsubscribe 关闭（AC-004/007）。
        void post_json("/v1/sessionHistory/unsubscribe", {
            subscriber_id: sub.subscriber_id,
        }).catch(() => {
            // 服务端在 SSE close 时已兜底注销，忽略注销失败。
        });
    }

    // SSE push channel — mirrors the desktop IPC EVENT_STATE_CHANGE broadcast.
    // local-api streams runtimeStore state changes over GET /v1/events; this
    // relays them to renderer subscribers (use_plugins) so the web panel
    // refreshes without polling. t414: 同一条也承载 messagesUpdated。
    const state_change_cbs = new Set<(instanceId: string, state: ConnectorSnapshotDTO) => void>();
    let events_source: EventSource | null = null;
    function ensure_events(): void {
        if (events_source || typeof EventSource === "undefined") return;
        events_source = new EventSource(
            `/v1/events?connectionId=${encodeURIComponent(page_connection_id)}`,
        );
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
        events_source.addEventListener("messagesUpdated", (ev: MessageEvent) => {
            try {
                const payload = JSON.parse(
                    ev.data as string,
                ) as SessionHistoryMessagesUpdatedPayload;
                const key = session_sub_key(payload.source, payload.env, payload.session_id);
                // 本页已 unsubscribe 的 loc 不再投递（AC-004）。
                if (!web_session_subs.has(key)) return;
                for (const cb of session_message_callbacks) cb(payload);
            } catch {
                /* ignore malformed SSE frame */
            }
        });
        // 初始 open 与断线重连 open：把仍打开的会话重挂到本连接（AC-005）。
        events_source.addEventListener("open", () => {
            for (const [key, sub] of web_session_subs) {
                post_session_subscribe(key, sub);
            }
        });
    }
    let config_event_registered = false;
    let theme_event_registered = false;
    function ensure_config_event(): void {
        ensure_events();
        const source = events_source;
        if (config_event_registered || !source) return;
        config_event_registered = true;
        source.addEventListener("config", (ev: MessageEvent) => {
            try {
                const config = JSON.parse(ev.data as string) as AppConfiguration;
                for (const cb of config_change_callbacks) cb(config);
            } catch {
                /* ignore malformed SSE frame */
            }
        });
    }
    function ensure_theme_event(): void {
        ensure_events();
        const source = events_source;
        if (theme_event_registered || !source) return;
        theme_event_registered = true;
        source.addEventListener("theme", (ev: MessageEvent) => {
            try {
                const is_dark = JSON.parse(ev.data as string) as boolean;
                if (typeof is_dark !== "boolean") return;
                apply_theme_dom(is_dark);
                for (const cb of theme_change_callbacks) cb(is_dark);
            } catch {
                /* ignore malformed SSE frame */
            }
        });
    }

    // t369 AC-004: web 面板平台从真实宿主推导（原硬编码 win32，Linux 用户显示 Windows）。
    // 排除 iOS（iPhone/iPad UA 含 "Mac OS X"）——桌面三平台映射。
    const web_platform = (() => {
        const ua = navigator.userAgent;
        if (/iPhone|iPad|iPod/i.test(ua)) return "linux";
        if (/Mac/i.test(ua)) return "darwin";
        if (/Win/i.test(ua)) return "win32";
        return "linux";
    })();

    const api: UsageboardApi = {
        platform: web_platform,
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
                // t274: web 无主进程广播；POST 成功后本地通知订阅者，
                // 对齐桌面 handleConfigSave → CONFIG_CHANGED 广播，accent/主题跨组件即时同步。
                await post_json("/v1/config", config);
                for (const cb of config_change_callbacks) cb(config as AppConfiguration);
            },
            getSecrets: (instanceId: string) =>
                get_json(`/v1/secrets?instanceId=${encodeURIComponent(instanceId)}`),
            saveSecrets: async (payload: unknown) => {
                await post_json("/v1/secrets", payload);
            },
            duplicate: (instanceId: string) =>
                post_json("/v1/config/duplicate", { instanceId }) as Promise<{
                    instanceId: string;
                }>,
            createInstance: (manifestId: string) =>
                post_json("/v1/config/createInstance", { manifestId }) as Promise<{
                    instanceId: string;
                }>,
            export: async (options?: ConfigExportOptions) => {
                const include_secrets = options?.includeSecrets === true;
                const path = `/v1/config/export?includeSecrets=${String(include_secrets)}`;
                const response = await fetch(path, { method: "GET" });
                if (!response.ok) await throw_http_error(response, "GET", path);
                const data: unknown = await response.json();
                download_json_file(
                    data,
                    `omni-panel-config-${new Date().toISOString().slice(0, 10)}.json`,
                );
                return { saved: true };
            },
            import: async () => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = "application/json,.json";
                const file = await new Promise<File | null>((resolve) => {
                    let settled = false;
                    const settle = (value: File | null): void => {
                        if (settled) return;
                        settled = true;
                        input.onchange = null;
                        input.oncancel = null;
                        resolve(value);
                    };
                    input.onchange = () => {
                        settle(input.files?.[0] ?? null);
                    };
                    input.oncancel = () => {
                        settle(null);
                    };
                    input.click();
                });
                if (!file) return { imported: false };
                let raw: unknown;
                try {
                    raw = JSON.parse(await file.text()) as unknown;
                } catch {
                    throw new Error("导入文件 JSON 无效");
                }
                return (await post_json("/v1/config/import", raw)) as {
                    imported: boolean;
                };
            },
        },
        event: {
            onStateChange: (cb: (instanceId: string, state: ConnectorSnapshotDTO) => void) => {
                ensure_events();
                state_change_cbs.add(cb);
                return () => {
                    state_change_cbs.delete(cb);
                };
            },
            onConfigChange: (cb: (config: AppConfiguration) => void) => {
                ensure_config_event();
                config_change_callbacks.add(cb);
                return () => {
                    config_change_callbacks.delete(cb);
                };
            },
            onThemeChange: (cb: (isDark: boolean) => void) => {
                ensure_theme_event();
                theme_change_callbacks.add(cb);
                return () => {
                    theme_change_callbacks.delete(cb);
                };
            },
            onSettingsNavigate: return_noop,
        },
        popup: { report_content_height: noop },
        main_panel: { hide: noop, get_mode: () => Promise.resolve("popup" as const) },
        theme: {
            // t274: web 端本地应用主题（无主进程 nativeTheme）。system 走
            // matchMedia 解析；data-theme 实际变更后通知 onThemeChange 订阅者，
            // 与桌面 nativeTheme "updated" 的「仅有效变更才广播」语义一致。
            set: (mode: "light" | "dark" | "system") => {
                const dark =
                    mode === "system"
                        ? window.matchMedia("(prefers-color-scheme: dark)").matches
                        : mode === "dark";
                const root = document.documentElement;
                if (root.getAttribute("data-theme") === (dark ? "dark" : "light")) return;
                apply_theme_dom(dark);
                for (const cb of theme_change_callbacks) cb(dark);
            },
        },
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
        auth: {
            cookieLogin: (instanceId: string) =>
                post_json("/v1/auth/cookieLogin", { instanceId }) as Promise<CookieLoginResult>,
            cookieLoginStatus: (instanceId: string) =>
                get_json<CookieLoginStatus>(
                    `/v1/auth/cookieLogin/status?instanceId=${encodeURIComponent(instanceId)}`,
                ),
        },
        session: {
            login: (request: Parameters<UsageboardApi["session"]["login"]>[0]) =>
                post_json("/v1/session/login", request) as Promise<
                    ReturnType<UsageboardApi["session"]["login"]> extends Promise<infer T>
                        ? T
                        : never
                >,
            refresh: (request: Parameters<UsageboardApi["session"]["refresh"]>[0]) =>
                post_json("/v1/session/refresh", request) as Promise<
                    ReturnType<UsageboardApi["session"]["refresh"]> extends Promise<infer T>
                        ? T
                        : never
                >,
        },
        grok: create_web_oauth_api("grok"),
        kimi: create_web_oauth_api("kimi"),
        logs: {
            export: async () => {
                const res = await fetch("/v1/logs/export");
                if (!res.ok) {
                    await throw_http_error(res, "GET", "/v1/logs/export");
                }
                const blob = await res.blob();
                const date = new Date().toISOString().slice(0, 10);
                download_blob(blob, `omni-panel-log-${date}.log`);
                return { saved: true };
            },
        },
        log: (payload: RendererLogPayload) => {
            console.debug("[usageboard]", payload);
            // t325: fire-and-forget POST 到 local-api 落盘；失败静默，不阻塞 renderer。
            void post_json("/v1/logs/renderer", payload).catch(() => {
                // 日志 POST 非关键路径：网络错误/端点下线均静默。
            });
        },
        tokenStats: {
            open: () => {
                window.location.hash = "agent";
            },
            // t434: web 无 collector，forceCollect 为 no-op（返回 null 契约）。
            forceCollect: () => Promise.resolve(null),
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
                // t263: 跨面板打开会话时会话面板按路由懒挂载，onFocus 同步分发先于
                // 订阅者注册，目标丢失。把 loc 编码进 URL search，会话面板挂载后经
                // initial_loc()（workspace-view-helpers）读取定位——与桌面 route_query
                // 同机制。空 loc（纯面板互跳）不写，避免污染初始位置。
                if (source && env && session_id) {
                    const url = new URL(window.location.href);
                    url.searchParams.set("loc", JSON.stringify({ source, env, session_id }));
                    window.history.replaceState(null, "", url);
                }
                // t259: web 端 Session 面板互跳 = 浏览器内切到 session 路由
                // （t252 遗留 minor：只分发 onFocus 不切 hash，Session 入口失效）。
                window.location.hash = "session";
                return Promise.resolve();
            },
            subscribe: (source: string, env: string, session_id: string) => {
                const key = session_sub_key(source, env, session_id);
                const existing = web_session_subs.get(key);
                if (existing) return Promise.resolve({ subscribed: true });
                const subscriber_id = `web-${String(++web_session_sub_seq)}`;
                // t414: 复用页级共享 EventSource，不再每会话 new EventSource。
                const sub_entry: WebSessionSubEntry = {
                    subscriber_id,
                    source,
                    env,
                    session_id,
                    registered: false,
                };
                web_session_subs.set(key, sub_entry);
                ensure_events();
                // 连接已 OPEN 时 open 不会再触发，立即登记；CONNECTING 等 open 统一发。
                if (events_source?.readyState === EventSource.OPEN) {
                    post_session_subscribe(key, sub_entry);
                }
                // 注册异步完成；返回即视为已接受（失败由 renderer 忽略 + 轮询兜底）。
                return Promise.resolve({ subscribed: true });
            },
            unsubscribe: (source: string, env: string, session_id: string) => {
                unsubscribe_loc(session_sub_key(source, env, session_id));
                return Promise.resolve({ unsubscribed: true });
            },
            // t228/t237: web 端经 local-api mock 读会话消息（fixture 按 session_id 索引）。
            query: async (
                source: string,
                env: string,
                session_id: string,
                options?: { limit?: number; before_cursor?: unknown } | null,
            ) => {
                const params = new URLSearchParams({ id: session_id });
                // t263: 透传 source/env，服务端据此 resolve_session_file 定位源文件；
                // 缺 source/env 服务端直接返回 400（t259 曾全量枚举反查，t263 移除）。
                if (source) params.set("source", source);
                if (env) params.set("env", env);
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
                request_or_locs: SessionHistorySearchContentRequest | readonly SessionHistoryLoc[],
                keyword_or_signal?: string | AbortSignal,
                signal?: AbortSignal,
            ) => {
                // t259: 从 stub 空实现改为真调用本地 API（t248 批量内容搜索契约）。
                // t263: signal 透传 fetch，渲染层取消信号可中止 HTTP 请求。接口重载
                // 第二参在 legacy 形态为 keyword、现代形态为 AbortSignal，须按形态区分。
                const is_legacy = !("filters" in request_or_locs);
                const abort_signal: AbortSignal | undefined = is_legacy
                    ? signal
                    : (keyword_or_signal as AbortSignal | undefined);
                const keyword_str =
                    is_legacy && typeof keyword_or_signal === "string" ? keyword_or_signal : "";
                const body = is_legacy
                    ? {
                          locs: request_or_locs,
                          keyword: keyword_str,
                      }
                    : request_or_locs;
                return post_json(
                    "/v1/sessionHistory/searchContent",
                    body,
                    abort_signal,
                ) as Promise<SessionHistorySearchContentResponse>;
            },
            summaries: async (locs: readonly SessionHistoryLoc[]) => {
                // t259: 从 stub 空实现改为真调用本地 API（t239 批量摘要契约）。
                const data = (await post_json("/v1/sessionHistory/summaries", {
                    locs,
                })) as { summaries: Record<string, string> };
                return data.summaries;
            },
            onMessagesUpdated: (
                callback: (payload: SessionHistoryMessagesUpdatedPayload) => void,
            ) => {
                session_message_callbacks.add(callback);
                return () => {
                    session_message_callbacks.delete(callback);
                };
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
