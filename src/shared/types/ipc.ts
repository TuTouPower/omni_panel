import type { UsageItem, PluginChart, UsageProvider, UsageSource } from "../schemas/plugin-output";
import type { PluginMetadata } from "../schemas/plugin-metadata";
import type { AppConfiguration } from "./config";
export type { AppConfiguration } from "./config";

export const IPC_CHANNELS = {
    PLUGIN_LIST: "plugin:list",
    PLUGIN_GET_STATE: "plugin:getState",
    PLUGIN_REFRESH: "plugin:refresh",
    PLUGIN_REFRESH_ALL: "plugin:refreshAll",

    CONFIG_GET: "config:get",
    CONFIG_SAVE: "config:save",
    CONFIG_SAVE_SECRETS: "config:saveSecrets",
    CONFIG_DUPLICATE: "config:duplicate",
    CONFIG_EXPORT: "config:export",
    CONFIG_IMPORT: "config:import",

    EVENT_STATE_CHANGE: "event:stateChange",
    EVENT_THEME_CHANGE: "event:themeChange",

    THEME_SET: "theme:set",

    LOG_RENDERER: "log:renderer",

    /** Popup renderer reports measured content height for window auto-sizing. */
    POPUP_REPORT_CONTENT_HEIGHT: "popup:reportContentHeight",

    SETTINGS_OPEN: "settings:open",
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
    TRAY_QUIT: "tray:quit",
    TRAY_HIDE: "tray:hide",
    TRAY_PAUSE_STATE: "tray:pauseState",
    TRAY_AUTOSTART_STATE: "tray:autostartState",

    /** E2E only — triggers the system tray click handler programmatically. */
    TEST_TRAY_CLICK: "test:tray-click",
} as const;

export interface PopupContentHeightReport {
    /** Measured visible content height in CSS pixels. */
    content_height: number;
    /** Measured height when all collapsible cards are collapsed. */
    collapsed_min_height: number;
}

export type PluginSnapshotDTO =
    | { status: "idle" }
    | { status: "loading" }
    | {
          status: "ready";
          items: readonly UsageItem[];
          updatedAt: string;
          badge?: string;
          chart?: PluginChart;
      }
    | {
          status: "failed";
          error: string;
          updatedAt?: string;
          items?: readonly UsageItem[];
      };

export type ConnectorSnapshotDTO = PluginSnapshotDTO;

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

export type RendererLogLevel = "debug" | "info" | "warn" | "error";

export interface RendererLogPayload {
    level: RendererLogLevel;
    module: string;
    message: string;
}

export type IpcResult<T> =
    | { readonly ok: true; readonly data: T }
    | { readonly ok: false; readonly error: IpcError };

export type RendererPlatform = "darwin" | "win32" | "linux";

export interface UsageboardApi {
    /** Host platform exposed to the renderer for platform-aware UI (e.g. titlebar drag). */
    platform: RendererPlatform;
    plugin: {
        list(): Promise<PluginInfo[]>;
        getState(instanceId: string): Promise<PluginSnapshotDTO>;
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
        duplicate(instanceId: string): Promise<void>;
        export(): Promise<{ saved: boolean }>;
        import(): Promise<{ imported: boolean }>;
    };
    event: {
        onStateChange(callback: (instanceId: string, state: PluginSnapshotDTO) => void): () => void;
        onThemeChange(callback: (isDark: boolean) => void): () => void;
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
        /** Open or focus the settings window. */
        open(): void;
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
        quit(): void;
        hide(): void;
        on_pause_state(callback: (paused: boolean) => void): () => void;
        on_autostart_state(callback: (enabled: boolean) => void): () => void;
    };
    log(payload: RendererLogPayload): void;
}
