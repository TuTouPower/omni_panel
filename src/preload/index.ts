import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/types/ipc";
import type {
    UsageboardApi,
    PluginSnapshotDTO,
    RendererLogPayload,
    RendererPlatform,
} from "../shared/types/ipc";
import "./usageboard-api";

function is_ipc_result(
    val: unknown,
): val is { ok: boolean; data?: unknown; error?: { code: string; message: string } } {
    if (typeof val !== "object" || val === null) return false;
    const obj = val as Record<string, unknown>;
    return typeof obj["ok"] === "boolean";
}

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
    const raw: unknown = await ipcRenderer.invoke(channel, ...args);
    if (!is_ipc_result(raw)) {
        throw new Error("Invalid IPC response");
    }
    if (!raw.ok) {
        const err = raw.error ?? { code: "UNKNOWN", message: "Unknown error" };
        throw new Error(`[${err.code}] ${err.message}`);
    }
    return raw.data as T;
}

type UnwrapPromise<T> = T extends Promise<infer U> ? U : never;

const renderer_platform: RendererPlatform =
    process.platform === "darwin" ? "darwin" : process.platform === "win32" ? "win32" : "linux";

// Shared plugin methods (all windows need read access)
const plugin_methods = {
    list: () =>
        invoke<UnwrapPromise<ReturnType<UsageboardApi["plugin"]["list"]>>>(
            IPC_CHANNELS.PLUGIN_LIST,
        ),
    getState: (instanceId: string) =>
        invoke<PluginSnapshotDTO>(IPC_CHANNELS.PLUGIN_GET_STATE, instanceId),
    refresh: (instanceId: string) =>
        invoke<UnwrapPromise<ReturnType<UsageboardApi["plugin"]["refresh"]>>>(
            IPC_CHANNELS.PLUGIN_REFRESH,
            instanceId,
        ),
    refreshAll: () =>
        invoke<UnwrapPromise<ReturnType<UsageboardApi["plugin"]["refreshAll"]>>>(
            IPC_CHANNELS.PLUGIN_REFRESH_ALL,
        ),
};

// Read-only config (popup, tray)
const config_readonly = {
    get: () =>
        invoke<UnwrapPromise<ReturnType<UsageboardApi["config"]["get"]>>>(IPC_CHANNELS.CONFIG_GET),
};

// Full config (settings only)
const config_full = {
    ...config_readonly,
    save: (config: unknown) =>
        invoke<UnwrapPromise<ReturnType<UsageboardApi["config"]["save"]>>>(
            IPC_CHANNELS.CONFIG_SAVE,
            config,
        ),
    saveSecrets: (payload: unknown) =>
        invoke<UnwrapPromise<ReturnType<UsageboardApi["config"]["saveSecrets"]>>>(
            IPC_CHANNELS.CONFIG_SAVE_SECRETS,
            payload,
        ),
    duplicate: (instanceId: string) =>
        invoke<UnwrapPromise<ReturnType<UsageboardApi["config"]["duplicate"]>>>(
            IPC_CHANNELS.CONFIG_DUPLICATE,
            instanceId,
        ),
    export: () =>
        invoke<UnwrapPromise<ReturnType<UsageboardApi["config"]["export"]>>>(
            IPC_CHANNELS.CONFIG_EXPORT,
        ),
    import: () =>
        invoke<UnwrapPromise<ReturnType<UsageboardApi["config"]["import"]>>>(
            IPC_CHANNELS.CONFIG_IMPORT,
        ),
};

const event_methods = {
    onStateChange: (callback: (instanceId: string, state: PluginSnapshotDTO) => void) => {
        const handler = (_e: unknown, instanceId: string, state: PluginSnapshotDTO) => {
            callback(instanceId, state);
        };
        ipcRenderer.on(IPC_CHANNELS.EVENT_STATE_CHANGE, handler);
        return () => ipcRenderer.removeListener(IPC_CHANNELS.EVENT_STATE_CHANGE, handler);
    },
    onThemeChange: (callback: (isDark: boolean) => void) => {
        const handler = (_e: unknown, isDark: boolean) => {
            callback(isDark);
        };
        ipcRenderer.on(IPC_CHANNELS.EVENT_THEME_CHANGE, handler);
        return () => ipcRenderer.removeListener(IPC_CHANNELS.EVENT_THEME_CHANGE, handler);
    },
};

const popup_methods = {
    report_content_height: (report: { content_height: number; collapsed_min_height: number }) => {
        void ipcRenderer.invoke(IPC_CHANNELS.POPUP_REPORT_CONTENT_HEIGHT, report);
    },
};

const main_panel_methods = {
    hide: () => {
        void ipcRenderer.invoke(IPC_CHANNELS.MAIN_PANEL_HIDE);
    },
    get_mode: () =>
        ipcRenderer.invoke(IPC_CHANNELS.MAIN_PANEL_GET_MODE) as Promise<"popup" | "floating">,
};

const theme_methods = {
    set: (mode: "light" | "dark" | "system") => {
        void ipcRenderer.invoke(IPC_CHANNELS.THEME_SET, mode);
    },
};

const settings_methods = {
    open: () => {
        void ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_OPEN);
    },
    minimize: () => {
        ipcRenderer.send(IPC_CHANNELS.SETTINGS_MINIMIZE);
    },
    maximize: () => {
        ipcRenderer.send(IPC_CHANNELS.SETTINGS_MAXIMIZE);
    },
    close: () => {
        ipcRenderer.send(IPC_CHANNELS.SETTINGS_CLOSE);
    },
};

const tray_methods = {
    open_panel: () => void ipcRenderer.invoke(IPC_CHANNELS.TRAY_OPEN_PANEL),
    refresh_all: () => void ipcRenderer.invoke(IPC_CHANNELS.TRAY_REFRESH_ALL),
    toggle_pause: () => void ipcRenderer.invoke(IPC_CHANNELS.TRAY_TOGGLE_PAUSE),
    toggle_autostart: () => void ipcRenderer.invoke(IPC_CHANNELS.TRAY_TOGGLE_AUTOSTART),
    open_settings: () => void ipcRenderer.invoke(IPC_CHANNELS.TRAY_OPEN_SETTINGS),
    check_update: () => void ipcRenderer.invoke(IPC_CHANNELS.TRAY_CHECK_UPDATE),
    quit: () => void ipcRenderer.invoke(IPC_CHANNELS.TRAY_QUIT),
    hide: () => void ipcRenderer.invoke(IPC_CHANNELS.TRAY_HIDE),
    report_menu_size: (report: { width: number; height: number }) => {
        void ipcRenderer.invoke(IPC_CHANNELS.TRAY_REPORT_MENU_SIZE, report);
    },
    on_pause_state: (callback: (paused: boolean) => void) => {
        const handler = (_e: unknown, paused: boolean) => {
            callback(paused);
        };
        ipcRenderer.on(IPC_CHANNELS.TRAY_PAUSE_STATE, handler);
        return () => ipcRenderer.removeListener(IPC_CHANNELS.TRAY_PAUSE_STATE, handler);
    },
    on_autostart_state: (callback: (enabled: boolean) => void) => {
        const handler = (_e: unknown, enabled: boolean) => {
            callback(enabled);
        };
        ipcRenderer.on(IPC_CHANNELS.TRAY_AUTOSTART_STATE, handler);
        return () => ipcRenderer.removeListener(IPC_CHANNELS.TRAY_AUTOSTART_STATE, handler);
    },
};

const log_method = (payload: RendererLogPayload) => {
    const sanitized: RendererLogPayload = {
        level: payload.level,
        module: sanitizeLogField(payload.module, 128),
        message: sanitizeLogField(payload.message, 4096),
    };
    void ipcRenderer.invoke(IPC_CHANNELS.LOG_RENDERER, sanitized);
};

// Route-based API restriction: each window only gets the capabilities it needs.
const current_route = window.location.hash.slice(1) || "popup";

// Build route-specific API: each window only gets capabilities it needs
const api: UsageboardApi = (() => {
    switch (current_route) {
        case "settings":
            return {
                platform: renderer_platform,
                plugin: plugin_methods,
                config: config_full,
                event: event_methods,
                popup: popup_methods,
                main_panel: main_panel_methods,
                theme: theme_methods,
                settings: settings_methods,
                tray: tray_methods,
                log: log_method,
            };
        case "tray":
            return {
                platform: renderer_platform,
                plugin: plugin_methods,
                config: config_readonly,
                event: event_methods,
                popup: popup_methods,
                main_panel: main_panel_methods,
                theme: theme_methods,
                settings: settings_methods,
                tray: tray_methods,
                log: log_method,
            } as unknown as UsageboardApi;
        default: // popup
            return {
                platform: renderer_platform,
                plugin: plugin_methods,
                config: config_readonly,
                event: event_methods,
                popup: popup_methods,
                main_panel: main_panel_methods,
                theme: theme_methods,
                settings: settings_methods,
                tray: tray_methods,
                log: log_method,
            } as unknown as UsageboardApi;
    }
})();

contextBridge.exposeInMainWorld("usageboard", api);

// E2E test helpers — only used by Playwright tests
if (process.env["E2E"] === "1") {
    contextBridge.exposeInMainWorld("__test__", {
        trayClick: () => ipcRenderer.invoke("test:tray-click"),
    });
}

const CONTROL_CHARS_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f]/g;

function sanitizeLogField(value: string, maxLen: number): string {
    const stripped = value.replace(CONTROL_CHARS_RE, "");
    return stripped.length > maxLen ? stripped.slice(0, maxLen) : stripped;
}
