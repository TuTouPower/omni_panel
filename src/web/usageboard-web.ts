/**
 * Web entry shim that provides `window.usageboard` over the local-api HTTP
 * endpoints. Used only by the web build (browsers reach the desktop app's
 * local-api on 0.0.0.0). Electron builds keep using preload's ipcRenderer
 * bridge. Native-only surfaces (tray, window controls) are no-ops; the
 * renderer hides their buttons in web mode (see is_web flag).
 */
import type { UsageboardApi } from "../shared/types/ipc";

const POLL_MS = 10_000;

async function get_json(path: string): Promise<unknown> {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`GET ${path} failed: ${String(res.status)}`);
    return res.json();
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

export function create_web_usageboard(): UsageboardApi {
    const token_stats_callbacks = new Set<() => void>();
    setInterval(() => {
        for (const cb of token_stats_callbacks) cb();
    }, POLL_MS);

    const api = {
        platform: "win32" as const,
        connector: {
            list: () => get_json("/v1/connectors"),
            getState: (instanceId: string) =>
                get_json(`/v1/connectors/${encodeURIComponent(instanceId)}/state`),
            refresh: (instanceId: string) =>
                post_json(`/v1/connectors/${encodeURIComponent(instanceId)}/refresh`, {}),
            refreshAll: () => post_json("/v1/connectors", {}),
            snapshot: () => Promise.resolve({}),
        },
        plugin: {
            list: () => get_json("/v1/connectors"),
            getState: (instanceId: string) =>
                get_json(`/v1/connectors/${encodeURIComponent(instanceId)}/state`),
            refresh: (instanceId: string) =>
                post_json(`/v1/connectors/${encodeURIComponent(instanceId)}/refresh`, {}),
            refreshAll: () => post_json("/v1/connectors", {}),
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
            export: () => Promise.resolve({ saved: false }),
            import: () => Promise.resolve({ imported: false }),
        },
        event: {
            onStateChange: return_noop,
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
            minimize: noop,
            maximize: noop,
            close: () => {
                window.location.hash = "usage";
            },
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
            login: () => Promise.resolve({ ok: false, error: "not supported on web" }),
            refresh: () => Promise.resolve({ ok: false, error: "not supported on web" }),
        },
        grok: {
            login_start: noop,
            login_poll: () => Promise.resolve({ status: "idle" }),
            login_status: () => Promise.resolve({ connected: false }),
            logout: noop,
            refresh: noop,
        },
        logs: { export: () => Promise.resolve({ saved: false }) },
        log: (payload: unknown) => {
            console.debug("[usageboard]", payload);
        },
        tokenStats: {
            open: () => {
                window.location.hash = "agent";
            },
            getBuckets: () => get_json("/v1/buckets"),
            getSessions: () => get_json("/v1/sessions"),
            getRecords: () => get_json("/v1/records"),
            getStatus: () => get_json("/v1/status"),
            onUpdated: (cb: () => void) => {
                token_stats_callbacks.add(cb);
                return () => {
                    token_stats_callbacks.delete(cb);
                };
            },
        },
        trend: {
            get: (provider: string, accountId: string, metricId: string, days?: number) => {
                const params = new URLSearchParams({
                    provider,
                    accountId,
                    metricId,
                });
                if (days !== undefined) params.set("days", String(days));
                return get_json(`/v1/trend?${params.toString()}`) as Promise<
                    ({ date: string; percent: number } | null)[]
                >;
            },
        },
    };
    return api as unknown as UsageboardApi;
}

export function install_web_usageboard(): void {
    document.documentElement.setAttribute("data-web", "1");
    (window as unknown as { usageboard: UsageboardApi }).usageboard = create_web_usageboard();
}
