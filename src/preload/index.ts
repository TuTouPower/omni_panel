import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/types/ipc";
import { create_renderer_log_throttle } from "./log-throttle";
import { select_grok_api } from "./route_api";
import type {
    UsageboardApi,
    ConnectorSnapshotDTO,
    RendererLogPayload,
    RendererPlatform,
    SessionLoginRequest,
    GrokDeviceCodeStart,
    GrokLoginStatus,
    GrokRefreshResult,
    GrokReadonlyApi,
    GrokSettingsApi,
} from "../shared/types/ipc";
import type { AppConfiguration } from "../shared/types/config";
import type { TokenStatsRecordFilters } from "../shared/types/token-stats";
import "./usageboard-api";

// Apply theme synchronously before first paint to avoid white flash.
// theme.ts applies it later via async IPC; this closes the first-frame gap.
try {
    const theme_value = new URL(window.location.href).searchParams.get("ou_theme");
    const theme = theme_value === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.backgroundColor = theme === "dark" ? "#181b22" : "#ffffff";
} catch {
    // documentElement not ready; theme.ts will fix up
}

function is_ipc_result(
    val: unknown,
): val is { ok: boolean; data?: unknown; error?: { code: string; message: string } } {
    if (typeof val !== "object" || val === null) return false;
    const obj = val as Record<string, unknown>;
    if (typeof obj["ok"] !== "boolean") return false;
    if (!obj["ok"] && obj["error"]) {
        if (typeof obj["error"] !== "object") return false;
        const err = obj["error"] as Record<string, unknown>;
        if (typeof err["code"] !== "string") return false;
        if (typeof err["message"] !== "string") return false;
    }
    return true;
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

// Shared connector methods (all windows need read access)
const connector_methods = {
    list: () =>
        invoke<UnwrapPromise<ReturnType<UsageboardApi["connector"]["list"]>>>(
            IPC_CHANNELS.CONNECTOR_LIST,
        ),
    getState: (instanceId: string) =>
        invoke<ConnectorSnapshotDTO>(IPC_CHANNELS.CONNECTOR_GET_STATE, instanceId),
    refresh: (instanceId: string) =>
        invoke<UnwrapPromise<ReturnType<UsageboardApi["connector"]["refresh"]>>>(
            IPC_CHANNELS.CONNECTOR_REFRESH,
            instanceId,
        ),
    refreshAll: () =>
        invoke<UnwrapPromise<ReturnType<UsageboardApi["connector"]["refreshAll"]>>>(
            IPC_CHANNELS.CONNECTOR_REFRESH_ALL,
        ),
    snapshot: () =>
        invoke<UnwrapPromise<ReturnType<UsageboardApi["connector"]["snapshot"]>>>(
            IPC_CHANNELS.CONNECTOR_SNAPSHOT,
        ),
};

const token_stats_methods = {
    open: () => void ipcRenderer.invoke(IPC_CHANNELS.TOKEN_STATS_OPEN),
    getBuckets: (filters?: {
        source?: string;
        env?: string;
        from_date?: string;
        to_date?: string;
    }) =>
        invoke<UnwrapPromise<ReturnType<UsageboardApi["tokenStats"]["getBuckets"]>>>(
            IPC_CHANNELS.TOKEN_STATS_BUCKETS,
            filters,
        ),
    getSessions: (filters?: {
        source?: string;
        env?: string;
        search?: string;
        limit?: number;
        offset?: number;
    }) =>
        invoke<UnwrapPromise<ReturnType<UsageboardApi["tokenStats"]["getSessions"]>>>(
            IPC_CHANNELS.TOKEN_STATS_SESSIONS,
            filters,
        ),
    getRecords: (filters?: TokenStatsRecordFilters) =>
        invoke<UnwrapPromise<ReturnType<UsageboardApi["tokenStats"]["getRecords"]>>>(
            IPC_CHANNELS.TOKEN_STATS_RECORDS,
            filters,
        ),
    getStatus: () =>
        invoke<UnwrapPromise<ReturnType<UsageboardApi["tokenStats"]["getStatus"]>>>(
            IPC_CHANNELS.TOKEN_STATS_STATUS,
        ),
    onUpdated: (callback: () => void) => {
        const listener = () => {
            callback();
        };
        ipcRenderer.on(IPC_CHANNELS.TOKEN_STATS_UPDATED, listener);
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.TOKEN_STATS_UPDATED, listener);
        };
    },
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
    getSecrets: (instanceId: string) =>
        invoke<Record<string, string>>(IPC_CHANNELS.CONFIG_GET_SECRETS, { instanceId }),
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

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- T is needed for callback type inference
function subscribe<T extends unknown[]>(
    channel: string,
    callback: (...args: T) => void,
): () => void {
    const handler = (_e: unknown, ...args: T) => {
        callback(...args);
    };
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
}

const event_methods = {
    onStateChange: (callback: (instanceId: string, state: ConnectorSnapshotDTO) => void) =>
        subscribe<[string, ConnectorSnapshotDTO]>(IPC_CHANNELS.EVENT_STATE_CHANGE, callback),
    onConfigChange: (callback: (config: AppConfiguration) => void) =>
        subscribe<[AppConfiguration]>(IPC_CHANNELS.CONFIG_CHANGED, callback),
    onThemeChange: (callback: (isDark: boolean) => void) =>
        subscribe<[boolean]>(IPC_CHANNELS.EVENT_THEME_CHANGE, callback),
    onSettingsNavigate: (
        callback: (context: { instanceId?: string; provider?: string; accountId?: string }) => void,
    ) =>
        subscribe<[{ instanceId?: string; provider?: string; accountId?: string }]>(
            IPC_CHANNELS.SETTINGS_NAVIGATE,
            callback,
        ),
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
    open: (context?: { instanceId?: string; provider?: string; accountId?: string }) => {
        void ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_OPEN, context);
    },
    minimize: () => {
        void ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_MINIMIZE);
    },
    maximize: () => {
        void ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_MAXIMIZE);
    },
    close: () => {
        void ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_CLOSE);
    },
};

const tray_methods = {
    open_panel: () => void ipcRenderer.invoke(IPC_CHANNELS.TRAY_OPEN_PANEL),
    refresh_all: () => void ipcRenderer.invoke(IPC_CHANNELS.TRAY_REFRESH_ALL),
    toggle_pause: () => void ipcRenderer.invoke(IPC_CHANNELS.TRAY_TOGGLE_PAUSE),
    toggle_autostart: () => void ipcRenderer.invoke(IPC_CHANNELS.TRAY_TOGGLE_AUTOSTART),
    open_settings: () => void ipcRenderer.invoke(IPC_CHANNELS.TRAY_OPEN_SETTINGS),
    open_web: () => void ipcRenderer.invoke(IPC_CHANNELS.TRAY_OPEN_WEB),
    check_update: () => void ipcRenderer.invoke(IPC_CHANNELS.TRAY_CHECK_UPDATE),
    survey: () => void ipcRenderer.invoke(IPC_CHANNELS.TRAY_SURVEY),
    sponsor: () => void ipcRenderer.invoke(IPC_CHANNELS.TRAY_SPONSOR),
    restart: () => void ipcRenderer.invoke(IPC_CHANNELS.TRAY_RESTART),
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

const auth_methods = {
    cookieLogin: (instanceId: string) =>
        invoke<{ saved: boolean }>(IPC_CHANNELS.AUTH_COOKIE_LOGIN, instanceId),
};

const session_methods = {
    login: (request: SessionLoginRequest) =>
        invoke<{ saved: boolean }>(IPC_CHANNELS.SESSION_LOGIN, request),
    refresh: (request: SessionLoginRequest) =>
        invoke<{ saved: boolean }>(IPC_CHANNELS.SESSION_REFRESH, request),
};

const grok_readonly_methods: GrokReadonlyApi = {
    login_status: (instance_id: string) =>
        invoke<GrokLoginStatus>(IPC_CHANNELS.GROK_LOGIN_STATUS, instance_id),
};

const grok_methods: GrokSettingsApi = {
    login_start: () => invoke<GrokDeviceCodeStart>(IPC_CHANNELS.GROK_LOGIN_START),
    login_poll: (
        instance_id: string,
        device_code: string,
        interval: number,
        expires_at_epoch_ms: number,
    ) =>
        invoke<{ saved: boolean }>(
            IPC_CHANNELS.GROK_LOGIN_POLL,
            instance_id,
            device_code,
            interval,
            expires_at_epoch_ms,
        ),
    login_status: (instance_id: string) =>
        invoke<GrokLoginStatus>(IPC_CHANNELS.GROK_LOGIN_STATUS, instance_id),
    logout: (instance_id: string) =>
        invoke<{ logged_out: boolean }>(IPC_CHANNELS.GROK_LOGOUT, instance_id),
    refresh: (instance_id: string) =>
        invoke<GrokRefreshResult>(IPC_CHANNELS.GROK_REFRESH, instance_id),
};

const renderer_log_throttle = create_renderer_log_throttle({ limit: 100, window_ms: 1000 });

function send_renderer_log(payload: RendererLogPayload): void {
    const sanitized: RendererLogPayload = {
        level: payload.level,
        module: sanitize_log_field(payload.module, 128),
        message: sanitize_log_field(payload.message, 4096),
    };
    if (import.meta.env.DEV) {
        sanitized.meta = payload.meta;
    }
    void ipcRenderer.invoke(IPC_CHANNELS.LOG_RENDERER, sanitized);
}

const log_method = (payload: RendererLogPayload) => {
    const now_ms = Date.now();
    const notice = renderer_log_throttle.flush_notice(now_ms);
    if (notice) {
        send_renderer_log({
            level: "warn",
            module: "preload:log-throttle",
            message: "renderer logs throttled",
            meta: notice,
        });
    }
    if (!renderer_log_throttle.accept(now_ms).accepted) return;
    send_renderer_log(payload);
};

const logs_methods = {
    export: () => invoke<{ saved: boolean }>(IPC_CHANNELS.LOG_EXPORT),
};

// Route-based API restriction: each window only gets the capabilities it needs.
const current_route = window.location.hash.slice(1) || "usage";
const route_grok_api = select_grok_api(current_route, grok_readonly_methods, grok_methods);

// Build route-specific API: each window only gets capabilities it needs
const api: UsageboardApi = (() => {
    switch (current_route) {
        case "setting":
            return {
                platform: renderer_platform,
                connector: connector_methods,
                plugin: connector_methods,
                config: config_full,
                event: event_methods,
                popup: popup_methods,
                main_panel: main_panel_methods,
                theme: theme_methods,
                settings: settings_methods,
                tray: tray_methods,
                auth: auth_methods,
                session: session_methods,
                grok: route_grok_api,
                logs: logs_methods,
                log: log_method,
                tokenStats: token_stats_methods,
            };
        case "tray":
            return {
                platform: renderer_platform,
                connector: connector_methods,
                plugin: connector_methods,
                // Tray: read-only config — write methods are present but no-op stubs
                // so the UsageboardApi type is satisfied without exposing write capability.
                config: {
                    ...config_readonly,
                    save: async () => {
                        /* no-op: popup/tray cannot save config */
                    },
                    saveSecrets: async () => {
                        /* no-op: popup/tray cannot save secrets */
                    },
                    getSecrets: () => Promise.resolve({}),
                    duplicate: () => Promise.resolve({ instanceId: "" }),
                    export: () => Promise.resolve({ saved: false }),
                    import: () => Promise.resolve({ imported: false }),
                },
                event: event_methods,
                popup: popup_methods,
                main_panel: main_panel_methods,
                theme: theme_methods,
                settings: settings_methods,
                tray: tray_methods,
                auth: auth_methods,
                session: session_methods,
                grok: route_grok_api,
                logs: logs_methods,
                log: log_method,
                tokenStats: token_stats_methods,
            };
        default: // popup
            return {
                platform: renderer_platform,
                connector: connector_methods,
                plugin: connector_methods,
                config: {
                    ...config_readonly,
                    save: config_full.save,
                    saveSecrets: async () => {
                        /* no-op: popup/tray cannot save secrets */
                    },
                    getSecrets: () => Promise.resolve({}),
                    duplicate: () => Promise.resolve({ instanceId: "" }),
                    export: () => Promise.resolve({ saved: false }),
                    import: () => Promise.resolve({ imported: false }),
                },
                event: event_methods,
                popup: popup_methods,
                main_panel: main_panel_methods,
                theme: theme_methods,
                settings: settings_methods,
                tray: tray_methods,
                auth: auth_methods,
                session: session_methods,
                grok: route_grok_api,
                logs: logs_methods,
                log: log_method,
                tokenStats: token_stats_methods,
            };
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

function sanitize_log_field(value: string, maxLen: number): string {
    const stripped = value.replace(CONTROL_CHARS_RE, "");
    return stripped.length > maxLen ? stripped.slice(0, maxLen) : stripped;
}
