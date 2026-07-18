import type {
    MetricRecord,
    PluginChart,
    UsageProvider,
    UsageSource,
} from "../schemas/plugin-output";
import type { PluginMetadata } from "../schemas/plugin-metadata";
import type { AppConfiguration } from "./config";
import type { AgentSessionUsage, TokenStatsBucket, TokenStatsSession } from "./token-stats";

export interface TokenStatsStatus {
    /** Whether the collector utility process is alive. */
    running: boolean;
    /** Latest session upsert time (ms epoch), null when no data yet. */
    last_updated: number | null;
}
export type { AppConfiguration } from "./config";

export const IPC_CHANNELS = {
    CONNECTOR_LIST: "connector:list",
    CONNECTOR_GET_STATE: "connector:getState",
    CONNECTOR_REFRESH: "connector:refresh",
    CONNECTOR_REFRESH_ALL: "connector:refreshAll",
    CONNECTOR_SNAPSHOT: "connector:snapshot",

    CONFIG_GET: "config:get",
    CONFIG_SAVE: "config:save",
    CONFIG_SAVE_SECRETS: "config:saveSecrets",
    CONFIG_GET_SECRETS: "config:getSecrets",
    CONFIG_DUPLICATE: "config:duplicate",
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
    TRAY_CHECK_UPDATE: "tray:checkUpdate",
    TRAY_SURVEY: "tray:survey",
    TRAY_SPONSOR: "tray:sponsor",
    TRAY_QUIT: "tray:quit",
    TRAY_RESTART: "tray:restart",
    TRAY_HIDE: "tray:hide",
    TRAY_REPORT_MENU_SIZE: "tray:reportMenuSize",
    TRAY_PAUSE_STATE: "tray:pauseState",
    TRAY_AUTOSTART_STATE: "tray:autostartState",

    AUTH_COOKIE_LOGIN: "auth:cookieLogin",

    SESSION_LOGIN: "session:login",
    SESSION_REFRESH: "session:refresh",

    /** Grok OAuth device-code flow — independent token in OmniUsage vault. */
    GROK_LOGIN_START: "grok:loginStart",
    GROK_LOGIN_POLL: "grok:loginPoll",
    GROK_LOGIN_STATUS: "grok:loginStatus",
    GROK_LOGOUT: "grok:logout",
    GROK_REFRESH: "grok:refresh",

    /** Token stats */
    TOKEN_STATS_BUCKETS: "tokenStats:buckets",
    TOKEN_STATS_SESSIONS: "tokenStats:sessions",
    TOKEN_STATS_RECORDS: "tokenStats:records",
    TOKEN_STATS_STATUS: "tokenStats:status",
    TOKEN_STATS_UPDATED: "tokenStats:updated",
    TOKEN_STATS_OPEN: "tokenStats:open",

    /** E2E only — triggers the system tray click handler programmatically. */
    TEST_TRAY_CLICK: "test:tray-click",
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
    supportedProviders: readonly UsageProvider[];
    activeProviders: readonly UsageProvider[];
    metadata: PluginMetadata | null;
    snapshot: ConnectorSnapshotDTO;
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
    readonly instance_id: string;
    readonly provider: string;
    readonly login_url: string;
    readonly cookie_names: readonly string[];
}

export interface SessionLoginResult {
    readonly saved: boolean;
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

export type RendererLogLevel = "debug" | "info" | "warn" | "error";

export interface RendererLogPayload {
    level: RendererLogLevel;
    module: string;
    message: string;
    meta?: unknown;
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
    ): Promise<{ saved: boolean }>;
    logout(instance_id: string): Promise<{ logged_out: boolean }>;
    refresh(instance_id: string): Promise<GrokRefreshResult>;
}

export interface UsageboardApi {
    /** Host platform exposed to the renderer for platform-aware UI (e.g. titlebar drag). */
    platform: RendererPlatform;
    connector: {
        list(): Promise<ConnectorInfo[]>;
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
    };
    tray: {
        open_panel(): void;
        refresh_all(): void;
        toggle_pause(): void;
        toggle_autostart(): void;
        open_settings(): void;
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
        getRecords(filters?: {
            agent?: "claude-code" | "opencode";
            start?: number;
            end?: number;
        }): Promise<AgentSessionUsage[]>;
        getStatus(): Promise<TokenStatsStatus>;
        onUpdated(callback: () => void): () => void;
    };
}
