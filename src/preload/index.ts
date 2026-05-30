import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/types/ipc";
import type {
    IpcResult,
    UsageboardApi,
    PluginSnapshotDTO,
    RendererLogPayload,
} from "../shared/types/ipc";
import "./usageboard-api";

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
    const raw: unknown = await ipcRenderer.invoke(channel, ...args);
    const result = raw as IpcResult<T>;
    if (!result.ok) {
        throw new Error(`[${result.error.code}] ${result.error.message}`);
    }
    return result.data;
}

type UnwrapPromise<T> = T extends Promise<infer U> ? U : never;

const api: UsageboardApi = {
    plugin: {
        list: () =>
            invoke<UnwrapPromise<ReturnType<UsageboardApi["plugin"]["list"]>>>(
                IPC_CHANNELS.PLUGIN_LIST,
            ),
        getState: (instanceId) =>
            invoke<PluginSnapshotDTO>(IPC_CHANNELS.PLUGIN_GET_STATE, instanceId),
        refresh: (instanceId) =>
            invoke<UnwrapPromise<ReturnType<UsageboardApi["plugin"]["refresh"]>>>(
                IPC_CHANNELS.PLUGIN_REFRESH,
                instanceId,
            ),
        refreshAll: () =>
            invoke<UnwrapPromise<ReturnType<UsageboardApi["plugin"]["refreshAll"]>>>(
                IPC_CHANNELS.PLUGIN_REFRESH_ALL,
            ),
    },
    config: {
        get: () =>
            invoke<UnwrapPromise<ReturnType<UsageboardApi["config"]["get"]>>>(
                IPC_CHANNELS.CONFIG_GET,
            ),
        save: (config) =>
            invoke<UnwrapPromise<ReturnType<UsageboardApi["config"]["save"]>>>(
                IPC_CHANNELS.CONFIG_SAVE,
                config,
            ),
        saveSecrets: (payload) =>
            invoke<UnwrapPromise<ReturnType<UsageboardApi["config"]["saveSecrets"]>>>(
                IPC_CHANNELS.CONFIG_SAVE_SECRETS,
                payload,
            ),
        duplicate: (instanceId) =>
            invoke<UnwrapPromise<ReturnType<UsageboardApi["config"]["duplicate"]>>>(
                IPC_CHANNELS.CONFIG_DUPLICATE,
                instanceId,
            ),
    },
    event: {
        onStateChange: (callback) => {
            const handler = (_e: unknown, instanceId: string, state: PluginSnapshotDTO) => {
                callback(instanceId, state);
            };
            ipcRenderer.on(IPC_CHANNELS.EVENT_STATE_CHANGE, handler);
            return () => ipcRenderer.removeListener(IPC_CHANNELS.EVENT_STATE_CHANGE, handler);
        },
        onThemeChange: (callback) => {
            const handler = (_e: unknown, isDark: boolean) => {
                callback(isDark);
            };
            ipcRenderer.on(IPC_CHANNELS.EVENT_THEME_CHANGE, handler);
            return () => ipcRenderer.removeListener(IPC_CHANNELS.EVENT_THEME_CHANGE, handler);
        },
    },
    log: (payload: RendererLogPayload) => {
        void ipcRenderer.invoke(IPC_CHANNELS.LOG_RENDERER, payload);
    },
};

contextBridge.exposeInMainWorld("usageboard", api);

// E2E test helpers — only used by Playwright tests
contextBridge.exposeInMainWorld("__test__", {
    trayClick: () => ipcRenderer.invoke("test:tray-click"),
});
