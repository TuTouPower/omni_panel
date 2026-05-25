import type { UsageItem, PluginChart } from "../schemas/plugin-output";
import type { PluginMetadata } from "../schemas/plugin-metadata";
import type { AppConfiguration } from "./config";
export type { AppConfiguration } from "./config";

export interface PythonStatus {
    available: boolean;
    command: string;
}

export const IPC_CHANNELS = {
    PLUGIN_LIST: "plugin:list",
    PLUGIN_GET_STATE: "plugin:getState",
    PLUGIN_REFRESH: "plugin:refresh",
    PLUGIN_REFRESH_ALL: "plugin:refreshAll",

    CONFIG_GET: "config:get",
    CONFIG_SAVE: "config:save",
    CONFIG_SAVE_SECRETS: "config:saveSecrets",
    CONFIG_DUPLICATE: "config:duplicate",

    EVENT_STATE_CHANGE: "event:stateChange",
    EVENT_THEME_CHANGE: "event:themeChange",

    SYSTEM_PYTHON_STATUS: "system:pythonStatus",
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

export interface PluginInfo {
    instanceId: string;
    stateId: string;
    name: string;
    enabled: boolean;
    metadata: PluginMetadata | null;
    snapshot: PluginSnapshotDTO;
}

export interface ConfigSaveSecretsPayload {
    instanceId: string;
    secrets: Record<string, string>;
}

export interface IpcError {
    code: string;
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
        get(): Promise<AppConfiguration>;
        save(config: AppConfiguration): Promise<void>;
        saveSecrets(payload: ConfigSaveSecretsPayload): Promise<void>;
        duplicate(instanceId: string): Promise<void>;
    };
    system: {
        getPythonStatus(): Promise<PythonStatus>;
    };
    event: {
        onStateChange(callback: (instanceId: string, state: PluginSnapshotDTO) => void): () => void;
        onThemeChange(callback: (isDark: boolean) => void): () => void;
    };
}
