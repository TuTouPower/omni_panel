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

    LOG_RENDERER: "log:renderer",

    /** E2E only — triggers the system tray click handler programmatically. */
    TEST_TRAY_CLICK: "test:tray-click",
} as const;

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

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError };

export interface UsageboardApi {
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
    log(payload: RendererLogPayload): void;
}
