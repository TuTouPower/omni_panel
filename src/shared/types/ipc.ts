import type { MetricRecord, PluginChart, UsageSource } from "../schemas/plugin-output";
import type { PluginMetadata } from "../schemas/plugin-metadata";
import type { AppConfiguration } from "./config";
import type { GrokLoginResult, KimiLoginResult } from "./oauth";
import type {
    AgentSessionUsage,
    TokenStatsBucket,
    TokenStatsHeatmapCell,
    TokenStatsHeatmapFilters,
    TokenStatsHourBucket,
    TokenStatsHourFilters,
    TokenStatsRecordFilters,
    TokenStatsRollupFilters,
    TokenStatsRollupRow,
    TokenStatsSession,
    TokenStatsDashboardDto,
    TokenStatsDashboardQuery,
    TokenStatsDashboardSessionsDto,
    TokenStatsDashboardSessionsQuery,
} from "./token-stats";

export interface TokenStatsStatus {
    /** Whether the collector utility process is alive. */
    running: boolean;
    /** Latest session upsert time (ms epoch), null when no data yet. */
    last_updated: number | null;
}
export type { AppConfiguration } from "./config";
export type { GrokLoginResult, KimiLoginResult } from "./oauth";

export const IPC_CHANNELS = {
    CONNECTOR_LIST: "connector:list",
    CONNECTOR_GET_STATE: "connector:getState",
    CONNECTOR_REFRESH: "connector:refresh",
    CONNECTOR_REFRESH_ALL: "connector:refreshAll",
    CONNECTOR_SNAPSHOT: "connector:snapshot",
    /** t121: manifest-driven catalog, independent of config.plugins / tombstone. */
    CONNECTOR_CATALOG: "connector:catalog",

    CONFIG_GET: "config:get",
    CONFIG_SAVE: "config:save",
    CONFIG_SAVE_SECRETS: "config:saveSecrets",
    CONFIG_GET_SECRETS: "config:getSecrets",
    CONFIG_DUPLICATE: "config:duplicate",
    /** t121: create a new connector instance directly from a manifest id. */
    CONFIG_CREATE_INSTANCE: "config:createInstance",
    CONFIG_EXPORT: "config:export",
    CONFIG_IMPORT: "config:import",
    CONFIG_CHANGED: "config:changed",

    EVENT_STATE_CHANGE: "event:stateChange",
    EVENT_THEME_CHANGE: "event:themeChange",

    THEME_SET: "theme:set",

    LOG_RENDERER: "log:renderer",
    LOG_EXPORT: "log:export",

    /** Popup renderer reports measured content height for window auto-sizing. */
    POPUP_REPORT_CONTENT_HEIGHT: "popup:reportContentHeight",

    SETTINGS_OPEN: "settings:open",
    SETTINGS_NAVIGATE: "settings:navigate",
    SETTINGS_MINIMIZE: "settings:minimize",
    SETTINGS_MAXIMIZE: "settings:maximize",
    SETTINGS_CLOSE: "settings:close",

    /** Main panel shell actions. */
    MAIN_PANEL_HIDE: "mainPanel:hide",
    MAIN_PANEL_GET_MODE: "mainPanel:getMode",

    /** Tray menu — custom frameless window actions. */
    TRAY_OPEN_PANEL: "tray:openPanel",
    TRAY_REFRESH_ALL: "tray:refreshAll",
    TRAY_TOGGLE_PAUSE: "tray:togglePause",
    TRAY_TOGGLE_AUTOSTART: "tray:toggleAutostart",
    TRAY_OPEN_SETTINGS: "tray:openSettings",
    TRAY_OPEN_WEB: "tray:openWeb",
    TRAY_CHECK_UPDATE: "tray:checkUpdate",
    TRAY_SURVEY: "tray:survey",
    TRAY_SPONSOR: "tray:sponsor",
    TRAY_QUIT: "tray:quit",
    TRAY_RESTART: "tray:restart",
    TRAY_HIDE: "tray:hide",
    TRAY_REPORT_MENU_SIZE: "tray:reportMenuSize",
    TRAY_PAUSE_STATE: "tray:pauseState",
    TRAY_AUTOSTART_STATE: "tray:autostartState",

    /** Settings — open user connectors script directory. */
    SETTINGS_OPEN_CONNECTORS_DIR: "settings:openConnectorsDir",

    AUTH_COOKIE_LOGIN: "auth:cookieLogin",

    SESSION_LOGIN: "session:login",
    SESSION_REFRESH: "session:refresh",

    /** Grok OAuth device-code flow — independent token in OmniPanel vault. */
    GROK_LOGIN_START: "grok:loginStart",
    GROK_LOGIN_POLL: "grok:loginPoll",
    GROK_LOGIN_CANCEL: "grok:loginCancel",
    GROK_LOGIN_STATUS: "grok:loginStatus",
    GROK_LOGOUT: "grok:logout",
    GROK_REFRESH: "grok:refresh",

    /** Kimi OAuth device-code flow — mirrors Grok; token stored in vault. */
    KIMI_LOGIN_START: "kimi:loginStart",
    KIMI_LOGIN_POLL: "kimi:loginPoll",
    KIMI_LOGIN_CANCEL: "kimi:loginCancel",
    KIMI_LOGIN_STATUS: "kimi:loginStatus",
    KIMI_LOGOUT: "kimi:logout",
    KIMI_REFRESH: "kimi:refresh",

    /** Token stats */
    TOKEN_STATS_BUCKETS: "tokenStats:buckets",
    TOKEN_STATS_SESSIONS: "tokenStats:sessions",
    TOKEN_STATS_RECORDS: "tokenStats:records",
    TOKEN_STATS_HEATMAP: "tokenStats:heatmap",
    TOKEN_STATS_HOUR_BUCKETS: "tokenStats:hourBuckets",
    TOKEN_STATS_ROLLUP: "tokenStats:rollup",
    TOKEN_STATS_DASHBOARD: "tokenStats:dashboard",
    TOKEN_STATS_DASHBOARD_SESSIONS: "tokenStats:dashboardSessions",
    TOKEN_STATS_STATUS: "tokenStats:status",
    TOKEN_STATS_UPDATED: "tokenStats:updated",
    TOKEN_STATS_OPEN: "tokenStats:open",

    /** t210: 会话历史 IPC 通道组（决策 15）。 */
    SESSION_HISTORY_OPEN: "sessionHistory:open",
    SESSION_HISTORY_SUBSCRIBE: "sessionHistory:subscribe",
    SESSION_HISTORY_UNSUBSCRIBE: "sessionHistory:unsubscribe",
    SESSION_HISTORY_QUERY: "sessionHistory:query",
    SESSION_HISTORY_RECENT: "sessionHistory:recent",
    /** t239: 批量内容搜索，一次调用返回全部候选会话的命中键集合。 */
    SESSION_HISTORY_SEARCH_CONTENT: "sessionHistory:searchContent",
    /** t239: 批量首条用户消息摘要，返回 loc key → 摘要文本。 */
    SESSION_HISTORY_SUMMARIES: "sessionHistory:summaries",
    /** 推送事件：watcher 检测到变化 → renderer。 */
    SESSION_HISTORY_MESSAGES_UPDATED: "sessionHistory:messagesUpdated",
    /** OPEN 聚焦已开窗口时，把目标会话定位发到 renderer。 */
    SESSION_HISTORY_FOCUS: "sessionHistory:focus",

    /** E2E only — triggers the system tray click handler programmatically. */
    TEST_TRAY_CLICK: "test:tray-click",

    /** Sparkline trend:近 N 天某 metric 的走势(默认 7 天)。 */
    TREND_GET: "trend:get",
    /**
     * t196 AC5: 一次取回某账号全部指标周期的 trend 序列。
     * 载荷 `{ provider, account_id, source_instance_id, periods: Array<{ metric_id, days? }> }`，
     * 返回 `Array<{ metric_id, series }>`；替代 N 个并行 TREND_GET invoke。
     * t214: source_instance_id 隔离多账号（account_id 塌成同值时）。
     */
    TREND_GET_BULK: "trend:getBulk",

    /** Build info:打包来源 branch + commit SHA，供设置页关于段显示。 */
    APP_BUILD_INFO: "app:buildInfo",
} as const;

export interface PopupContentHeightReport {
    /** Measured visible content height in CSS pixels. */
    content_height: number;
    /** Measured height when all collapsible cards are collapsed. */
    collapsed_min_height: number;
}

export interface TrayMenuSizeReport {
    width: number;
    height: number;
}

export type ConnectorSnapshotDTO =
    | { status: "idle" }
    | {
          status: "loading";
          updatedAt?: string;
          items?: readonly MetricRecord[];
          badge?: string;
          chart?: PluginChart;
      }
    | {
          status: "ready";
          items: readonly MetricRecord[];
          updatedAt: string;
          badge?: string;
          chart?: PluginChart;
      }
    | {
          status: "failed";
          error: string;
          updatedAt?: string;
          items?: readonly MetricRecord[];
          badge?: string;
          chart?: PluginChart;
      };

export interface ConnectorInfo {
    instanceId: string;
    sourceInstanceId: string;
    stateId: string;
    name: string;
    displayName: string;
    enabled: boolean;
    source: UsageSource;
    supportedProviders: readonly string[];
    activeProviders: readonly string[];
    metadata: PluginMetadata | null;
    snapshot: ConnectorSnapshotDTO;
}

/**
 * t121: manifest-driven catalog entry. Independent of config.plugins and the
 * removedConnectorIds tombstone — every discovered connector manifest appears
 * here regardless of whether a live instance exists, so the add-account dialog
 * can resolve the auth form for a vendor even after the user deleted all its
 * instances.
 *
 * `metadata` mirrors {@link ConnectorInfo.metadata} so existing auth-resolution
 * helpers (resolve_auth_method / resolve_auth_descriptor) work unchanged.
 */
export interface ConnectorCatalogEntry {
    manifest_id: string;
    source: UsageSource;
    supported_providers: readonly string[];
    metadata: PluginMetadata;
}

// Historical IPC channel names still say plugin, but renderer treats these as connectors.
export type PluginInfo = ConnectorInfo;

export interface ConfigSaveSecretsPayload {
    instanceId: string;
    secrets: Record<string, string>;
}

export interface ConfigExportData {
    readonly formatVersion: 1;
    readonly exportedAt: string;
    readonly appVersion: string;
    readonly config: AppConfiguration;
    readonly secrets: Record<string, string>;
}

export interface IpcError {
    code: string;
    message: string;
}

export interface SessionLoginRequest {
    readonly instance_id?: string;
    readonly provider: string;
    readonly login_url: string;
    readonly cookie_names: readonly string[];
}

export interface SessionLoginResult {
    readonly saved: boolean;
    readonly cookie?: string;
}

export interface GrokDeviceCodeStart {
    readonly device_code: string;
    readonly user_code: string;
    readonly verification_uri: string;
    readonly verification_uri_complete: string | null;
    readonly expires_in: number;
    readonly interval: number;
}

export interface GrokLoginStatus {
    readonly has_token: boolean;
    readonly expires_at: string | null;
    readonly can_refresh: boolean;
}

export interface GrokRefreshResult {
    readonly success: boolean;
    readonly error?: string;
}

/**
 * Kimi OAuth mirrors Grok's device-code shape: same device-code start/login
 * status/refresh result contracts. Distinct type names keep the IPC surface
 * self-documenting and allow future divergence.
 */
export type KimiDeviceCodeStart = GrokDeviceCodeStart;
export type KimiLoginStatus = GrokLoginStatus;
export type KimiRefreshResult = GrokRefreshResult;

/** 单个走势点:UTC 日期 + 已用百分比(0–100)。 */
export interface TrendPoint {
    readonly date: string;
    readonly percent: number;
}

/**
 * 账号展开区 sparkline 查询接口。
 *
 * - `get(provider, accountId, metricId, sourceInstanceId, days?)` 返回
 *   `days`（默认 7）窗口内的 `({date, percent} | null)[]`，升序，长度
 *   ≤ max_points（t208 固定桶数、不强制 null 填充；点数不足时按实际）。
 * - 每 metric 一条 sparkline,不跨 metric 合并。
 * - 走 IPC 白名单;renderer 不直连 SQLite。
 */
export interface TrendApi {
    get(
        provider: string,
        accountId: string,
        metricId: string,
        sourceInstanceId: string,
        days?: number,
    ): Promise<(TrendPoint | null)[]>;
    /** t196 AC5: 单 IPC 取回多周期 trend 序列。 */
    getBulk(payload: TrendBulkRequest): Promise<TrendBulkResponse>;
}

export interface TrendPeriodRequest {
    /** SQL 查询键 = observation 的 metric_id（connector 完整键，非 raw_label，t207/d014）。 */
    readonly metric_id: string;
    readonly days?: number;
}

export interface TrendBulkRequest {
    readonly provider: string;
    readonly account_id: string;
    /** t214: 多账号隔离维度（account_id 塌成同值时按实例区分）。 */
    readonly source_instance_id: string;
    readonly periods: readonly TrendPeriodRequest[];
}

export interface TrendBulkSeries {
    readonly metric_id: string;
    readonly series: (TrendPoint | null)[];
}

export interface TrendBulkResponse {
    readonly series: readonly TrendBulkSeries[];
}

export type RendererLogLevel = "debug" | "info" | "warn" | "error";

export interface RendererLogPayload {
    level: RendererLogLevel;
    module: string;
    message: string;
    meta?: unknown;
}

/** 会话历史定位三元组（与 SessionLoc 一致，IPC 边界使用宽松 string 形态）。 */
export interface SessionHistoryLoc {
    readonly source: string;
    readonly env: string;
    readonly session_id: string;
}

/** 推到 renderer 的增量消息事件载荷。 */
export interface SessionHistoryMessagesUpdatedPayload extends SessionHistoryLoc {
    readonly messages: readonly HistoryMessageLike[];
}

/** preload→main 的 sessionHistory API 面（route 受限）。 */
export interface SessionHistoryApi {
    open(source: string, env: string, session_id: string): Promise<void>;
    subscribe(source: string, env: string, session_id: string): Promise<{ subscribed: boolean }>;
    unsubscribe(
        source: string,
        env: string,
        session_id: string,
    ): Promise<{ unsubscribed: boolean }>;
    query(
        source: string,
        env: string,
        session_id: string,
        options?: { limit?: number; before_cursor?: unknown } | null,
    ): Promise<{
        messages: readonly HistoryMessageLike[];
        next_cursor: unknown;
    }>;
    recent(
        source: string,
        env: string,
        limit: number,
    ): Promise<readonly SessionHistoryRecentItem[]>;
    /** t239: 批量内容搜索，返回命中会话的 loc key 数组。 */
    searchContent(
        locs: readonly SessionHistoryLoc[],
        keyword: string,
    ): Promise<readonly string[]>;
    /** t239: 批量首条用户消息摘要，返回 loc key → 摘要文本。 */
    summaries(locs: readonly SessionHistoryLoc[]): Promise<Readonly<Record<string, string>>>;
    onMessagesUpdated(
        callback: (payload: SessionHistoryMessagesUpdatedPayload) => void,
    ): () => void;
    onFocus(callback: (loc: SessionHistoryLoc) => void): () => void;
}

/** 历史消息的最小形态（renderer 端类型，避免直接 import main 的 HistoryMessage）。 */
export interface HistoryMessageLike {
    readonly id: string;
    readonly role: "user" | "assistant";
    readonly text: string;
    readonly timestamp: number | null;
}

/** t239: 批量内容搜索请求。 */
export interface SessionHistorySearchContentRequest {
    readonly locs: readonly SessionHistoryLoc[];
    readonly keyword: string;
}

/** t239: 批量内容搜索响应：命中的 loc key 集合（source|env|session_id）。 */
export interface SessionHistorySearchContentResponse {
    readonly hits: readonly string[];
}

/** t239: 批量首条用户消息摘要请求。 */
export interface SessionHistorySummariesRequest {
    readonly locs: readonly SessionHistoryLoc[];
}

/** t239: 批量首条用户消息摘要响应：loc key → 首条 user 文本前 80 字符。 */
export interface SessionHistorySummariesResponse {
    readonly summaries: Readonly<Record<string, string>>;
}

export interface SessionHistoryRecentItem {
    readonly source: string;
    readonly env: string;
    readonly session_id: string;
    readonly title: string | null;
    readonly agent: string;
}

export type IpcResult<T> =
    | { readonly ok: true; readonly data: T }
    | { readonly ok: false; readonly error: IpcError };

export type RendererPlatform = "darwin" | "win32" | "linux";

export interface SettingsOpenContext {
    readonly instanceId?: string;
    readonly provider?: string;
    readonly accountId?: string;
}

export interface GrokReadonlyApi {
    login_status(instance_id: string): Promise<GrokLoginStatus>;
}

export interface GrokSettingsApi extends GrokReadonlyApi {
    login_start(): Promise<GrokDeviceCodeStart>;
    login_poll(
        instance_id: string,
        device_code: string,
        interval: number,
        expires_at_epoch_ms: number,
    ): Promise<GrokLoginResult>;
    login_cancel(instance_id: string): Promise<void>;
    logout(instance_id: string): Promise<{ logged_out: boolean }>;
    refresh(instance_id: string): Promise<GrokRefreshResult>;
}

export interface KimiReadonlyApi {
    login_status(instance_id: string): Promise<KimiLoginStatus>;
}

export interface KimiSettingsApi extends KimiReadonlyApi {
    login_start(): Promise<KimiDeviceCodeStart>;
    login_poll(
        instance_id: string,
        device_code: string,
        interval: number,
        expires_at_epoch_ms: number,
    ): Promise<KimiLoginResult>;
    login_cancel(instance_id: string): Promise<void>;
    logout(instance_id: string): Promise<{ logged_out: boolean }>;
    refresh(instance_id: string): Promise<KimiRefreshResult>;
}

export interface UsageboardApi {
    /** Host platform exposed to the renderer for platform-aware UI (e.g. titlebar drag). */
    platform: RendererPlatform;
    connector: {
        list(): Promise<ConnectorInfo[]>;
        catalog(): Promise<ConnectorCatalogEntry[]>;
        getState(instanceId: string): Promise<ConnectorSnapshotDTO>;
        refresh(instanceId: string): Promise<void>;
        refreshAll(): Promise<void>;
        snapshot(): Promise<Record<string, ConnectorSnapshotDTO>>;
    };
    /** @deprecated Use connector instead */
    plugin: {
        list(): Promise<ConnectorInfo[]>;
        getState(instanceId: string): Promise<ConnectorSnapshotDTO>;
        refresh(instanceId: string): Promise<void>;
        refreshAll(): Promise<void>;
    };
    config: {
        get(): Promise<{
            config: AppConfiguration;
            hasSecrets: Record<string, Record<string, boolean>>;
        }>;
        save(config: AppConfiguration): Promise<void>;
        saveSecrets(payload: ConfigSaveSecretsPayload): Promise<void>;
        /** Load vault plaintext for settings edit forms (settings window only). */
        getSecrets(instanceId: string): Promise<Record<string, string>>;
        duplicate(instanceId: string): Promise<{ instanceId: string }>;
        /** t121: create a new instance directly from a manifest id (clears tombstone). */
        createInstance(manifestId: string): Promise<{ instanceId: string }>;
        export(): Promise<{ saved: boolean }>;
        import(): Promise<{ imported: boolean }>;
    };
    event: {
        onStateChange(
            callback: (instanceId: string, state: ConnectorSnapshotDTO) => void,
        ): () => void;
        onConfigChange?(callback: (config: AppConfiguration) => void): () => void;
        onThemeChange(callback: (isDark: boolean) => void): () => void;
        onSettingsNavigate(callback: (context: SettingsOpenContext) => void): () => void;
    };
    popup: {
        /**
         * Renderer reports the measured content height (and the all-collapsed
         * minimum height) so the main process can lock the BrowserWindow size.
         */
        report_content_height(report: PopupContentHeightReport): void;
    };
    main_panel: {
        hide(): void;
        get_mode(): Promise<"popup" | "floating">;
    };
    theme: {
        /** Tell the main process to apply the given theme mode. */
        set(mode: "light" | "dark" | "system"): void;
    };
    settings: {
        /** Open or focus the settings window, optionally with account context for navigation. */
        open(context?: SettingsOpenContext): void;
        /** Minimize the settings window. */
        minimize(): void;
        /** Toggle maximize/restore on the settings window. */
        maximize(): void;
        /** Close the settings window. */
        close(): void;
        /** Open the user connectors script directory in the OS file explorer. */
        openConnectorsDir(): void;
    };
    tray: {
        open_panel(): void;
        refresh_all(): void;
        toggle_pause(): void;
        toggle_autostart(): void;
        open_settings(): void;
        /** Open the web UI in the system browser (intranet). */
        open_web(): void;
        check_update(): void;
        survey(): void;
        sponsor(): void;
        restart(): void;
        quit(): void;
        hide(): void;
        report_menu_size(report: TrayMenuSizeReport): void;
        on_pause_state(callback: (paused: boolean) => void): () => void;
        on_autostart_state(callback: (enabled: boolean) => void): () => void;
    };
    auth: {
        cookieLogin(instanceId: string): Promise<{ saved: boolean }>;
    };
    session: {
        login(request: SessionLoginRequest): Promise<SessionLoginResult>;
        refresh(request: SessionLoginRequest): Promise<SessionLoginResult>;
    };
    grok: GrokReadonlyApi | GrokSettingsApi;
    kimi: KimiReadonlyApi | KimiSettingsApi;
    logs: {
        export(): Promise<{ saved: boolean }>;
    };
    log(payload: RendererLogPayload): void;
    tokenStats: {
        open(): void;
        getBuckets(filters?: {
            source?: string;
            env?: string;
            from_date?: string;
            to_date?: string;
        }): Promise<TokenStatsBucket[]>;
        getSessions(filters?: {
            source?: string;
            env?: string;
            search?: string;
            limit?: number;
            offset?: number;
        }): Promise<TokenStatsSession[]>;
        getRecords(filters?: TokenStatsRecordFilters): Promise<AgentSessionUsage[]>;
        getHeatmap(filters?: TokenStatsHeatmapFilters): Promise<TokenStatsHeatmapCell[]>;
        getHourBuckets(filters?: TokenStatsHourFilters): Promise<TokenStatsHourBucket[]>;
        getRangeRollup(filters?: TokenStatsRollupFilters): Promise<TokenStatsRollupRow[]>;
        getDashboard(query: TokenStatsDashboardQuery): Promise<TokenStatsDashboardDto>;
        /** Bounded session page for dashboard pagination (t200); never recomputes
         *  the summary/chart/heatmap regions. */
        getDashboardSessions(
            query: TokenStatsDashboardSessionsQuery,
        ): Promise<TokenStatsDashboardSessionsDto>;
        getStatus(): Promise<TokenStatsStatus>;
        /** Fires on each committed token-stats batch; carries the monotonic data
         *  version so renderer caches can drop stale payloads (t192). */
        onUpdated(callback: (dataVersion: number) => void): () => void;
    };
    trend: TrendApi;
    sessionHistory: SessionHistoryApi;
    buildInfo: {
        get(): Promise<{ version: string; branch: string; commit: string; subject: string }>;
    };
}
