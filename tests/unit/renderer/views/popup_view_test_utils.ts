import { vi } from "vitest";
import type { ConnectorInfo } from "../../../../src/shared/types/ipc";
import type { AppConfiguration } from "../../../../src/shared/types/config";

export class FakeResizeObserver {
    observe() {
        return undefined;
    }
    unobserve() {
        return undefined;
    }
    disconnect() {
        return undefined;
    }
}

export function connectorInfo(overrides: Partial<ConnectorInfo> = {}): ConnectorInfo {
    const source = overrides.source ?? "gateway";
    const supportedProviders = overrides.supportedProviders ?? ["claude"];
    const activeProviders = overrides.activeProviders ?? supportedProviders;

    return {
        instanceId: `${source}-connector`,
        sourceInstanceId: `${source}-main`,
        stateId: `${source}-connector`,
        name: `${source}-connector`,
        displayName: `${source}-connector`,
        enabled: true,
        source,
        supportedProviders,
        activeProviders,
        metadata: null,
        snapshot: {
            status: "ready",
            updatedAt: "2026-01-01T00:00:00Z",
            items: [],
        },
        ...overrides,
    };
}

export const base_popup_config: AppConfiguration = {
    schemaVersion: 1,
    language: "zh-Hans",
    plugins: [],
    launchAtLogin: false,
};

export const plugin_list = vi.fn<() => Promise<ConnectorInfo[]>>();
export const plugin_refresh = vi
    .fn<(instanceId: string) => Promise<void>>()
    .mockResolvedValue(undefined);
export const plugin_refresh_all = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
export const main_panel_hide = vi.fn<() => void>();
export const main_panel_get_mode = vi
    .fn<() => Promise<"popup" | "floating">>()
    .mockResolvedValue("popup");
export const usage_log =
    vi.fn<(payload: { level: string; module: string; message: string }) => void>();
export const config_get = vi.fn();
export const config_save = vi.fn<() => Promise<void>>();
export const on_config_change = vi.fn((callback: (config: AppConfiguration) => void) => {
    void callback;
    return vi.fn();
});

export function install_popup_usageboard() {
    vi.clearAllMocks();
    main_panel_get_mode.mockResolvedValue("popup");
    plugin_refresh.mockResolvedValue(undefined);
    plugin_refresh_all.mockResolvedValue(undefined);
    config_get.mockResolvedValue({ config: base_popup_config, hasSecrets: {} });
    config_save.mockResolvedValue(undefined);
    on_config_change.mockImplementation((callback: (config: AppConfiguration) => void) => {
        void callback;
        return vi.fn();
    });
    plugin_list.mockResolvedValue([
        connectorInfo({
            source: "gateway",
            sourceInstanceId: "cpa-main",
            supportedProviders: ["claude", "kimi"],
            activeProviders: ["claude"],
            snapshot: {
                status: "ready",
                updatedAt: "2026-01-01T12:00:00Z",
                items: [
                    {
                        id: "claude-pro",
                        metric_id: "claude:claude-account:claude-pro",
                        provider: "claude",
                        source: "gateway",
                        sourceInstanceId: "cpa-main",
                        accountId: "claude-account",
                        accountLabel: "Claude Account",
                        raw_label: "claude-pro",
                        normalized_label: "Claude Pro",
                        used: 10,
                        limit: 100,
                        displayStyle: "percent",
                        resetAt: null,
                        observedAt: 1735689600000,
                        stale: false,
                        status: "normal",
                    },
                ],
            },
        }),
        connectorInfo({
            source: "poll",
            sourceInstanceId: "deepseek-key",
            name: "deepseek",
            displayName: "DeepSeek API Key",
            supportedProviders: ["deepseek"],
            activeProviders: ["deepseek"],
            snapshot: {
                status: "ready",
                updatedAt: "2026-01-01T12:05:00Z",
                items: [
                    {
                        id: "deepseek-window",
                        metric_id: "deepseek:deepseek-account:deepseek-window",
                        provider: "deepseek",
                        source: "poll",
                        sourceInstanceId: "deepseek-key",
                        accountId: "deepseek-account",
                        accountLabel: "DeepSeek Account",
                        name: "DeepSeek API",
                        raw_label: "deepseek-api",
                        normalized_label: "DeepSeek API",
                        used: 3,
                        limit: 20,
                        displayStyle: "ratio",
                        resetAt: null,
                        observedAt: 1735689600000,
                        stale: false,
                        status: "normal",
                    },
                ],
            },
        }),
    ]);
    window.usageboard = {
        platform: "win32",
        plugin: {
            list: plugin_list,
            getState: vi.fn(),
            refresh: plugin_refresh,
            refreshAll: plugin_refresh_all,
        },
        connector: {
            list: plugin_list,
            catalog: vi.fn().mockResolvedValue([]),
            getState: vi.fn(),
            refresh: plugin_refresh,
            refreshAll: plugin_refresh_all,
            snapshot: vi.fn().mockResolvedValue({}),
        },
        config: {
            get: config_get,
            save: config_save,
            getSecrets: vi.fn().mockResolvedValue({}),
            saveSecrets: vi.fn(),
            duplicate: vi.fn(),
            createInstance: vi.fn().mockResolvedValue({ instanceId: "new" }),
            export: vi.fn(),
            import: vi.fn(),
        },
        event: {
            onStateChange: vi.fn(() => vi.fn()),
            onThemeChange: vi.fn(),
            onSettingsNavigate: vi.fn(() => vi.fn()),
            onConfigChange: on_config_change,
        },
        popup: {
            report_content_height: vi.fn(),
        },
        main_panel: { hide: main_panel_hide, get_mode: main_panel_get_mode },
        settings: {
            open: vi.fn(),
            minimize: vi.fn(),
            maximize: vi.fn(),
            close: vi.fn(),
            openConnectorsDir: vi.fn(),
        },
        theme: { set: vi.fn() },
        tray: {
            open_panel: vi.fn(),
            refresh_all: vi.fn(),
            toggle_pause: vi.fn(),
            toggle_autostart: vi.fn(),
            open_settings: vi.fn(),
            open_web: vi.fn(),
            check_update: vi.fn(),
            survey: vi.fn(),
            sponsor: vi.fn(),
            restart: vi.fn(),
            quit: vi.fn(),
            hide: vi.fn(),
            report_menu_size: vi.fn(),
            on_pause_state: vi.fn(() => vi.fn()),
            on_autostart_state: vi.fn(() => vi.fn()),
        },
        auth: { cookieLogin: vi.fn() },
        session: { login: vi.fn(), refresh: vi.fn() },
        grok: {
            login_start: vi.fn(),
            login_poll: vi.fn(),
            login_status: vi.fn(),
            logout: vi.fn(),
            refresh: vi.fn(),
        },
        kimi: {
            login_start: vi.fn(),
            login_poll: vi.fn(),
            login_cancel: vi.fn(),
            login_status: vi.fn(),
            logout: vi.fn(),
            refresh: vi.fn(),
        },
        tokenStats: {
            open: vi.fn(),
            getBuckets: vi.fn().mockResolvedValue([]),
            getSessions: vi.fn().mockResolvedValue([]),
            getRecords: vi.fn().mockResolvedValue([]),
            getHeatmap: vi.fn().mockResolvedValue([]),
            getHourBuckets: vi.fn().mockResolvedValue([]),
            getRangeRollup: vi.fn().mockResolvedValue([]),
            getDashboard: vi.fn(),
            getDashboardSessions: vi.fn(),
            getStatus: vi.fn().mockResolvedValue({ running: false, last_updated: null }),
            onUpdated: vi.fn(() => vi.fn()),
        },
        trend: {
            get: vi.fn().mockResolvedValue([]),
            getBulk: vi.fn().mockResolvedValue({ series: [] }),
        },
        sessionHistory: {
            open: vi.fn().mockResolvedValue(undefined),
            subscribe: vi.fn().mockResolvedValue({ subscribed: false }),
            unsubscribe: vi.fn().mockResolvedValue({ unsubscribed: false }),
            query: vi.fn().mockResolvedValue({ messages: [], next_cursor: null }),
            recent: vi.fn().mockResolvedValue([]),
            onMessagesUpdated: vi.fn(() => () => undefined),
            onFocus: vi.fn(() => () => undefined),
        },
        logs: { export: vi.fn() },
        log: usage_log,
        buildInfo: {
            get: vi.fn().mockResolvedValue({ version: "1.1.0", branch: "dev", commit: "dev" }),
        },
    };
}
