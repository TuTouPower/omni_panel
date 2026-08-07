import { vi } from "vitest";
import type { AppConfiguration } from "../../../../src/shared/types/config";

/**
 * 会话历史窗口测试 usageboard mock（t211）。
 * 会话历史 IPC + tokenStats（标题解析 / 最近 6 条）为可控 spy；其余方法 noop。
 */
export function install_history_usageboard(get_config?: () => AppConfiguration) {
    const config = get_config ?? (() => ({ plugins: [] }) as unknown as AppConfiguration);
    const usageboard = {
        platform: "win32",
        connector: { list: vi.fn().mockResolvedValue([]), catalog: vi.fn().mockResolvedValue([]) },
        plugin: { list: vi.fn().mockResolvedValue([]) },
        config: {
            get: vi.fn().mockResolvedValue({ config: config(), hasSecrets: {} }),
            save: vi.fn().mockResolvedValue(undefined),
        },
        event: {
            onStateChange: vi.fn(() => () => undefined),
            onConfigChange: vi.fn(() => () => undefined),
            onThemeChange: vi.fn(() => () => undefined),
            onSettingsNavigate: vi.fn(() => () => undefined),
        },
        popup: { report_content_height: vi.fn() },
        main_panel: { hide: vi.fn(), get_mode: vi.fn().mockResolvedValue("floating") },
        theme: { set: vi.fn() },
        settings: {
            open: vi.fn(),
            minimize: vi.fn(),
            maximize: vi.fn(),
            close: vi.fn(),
            openConnectorsDir: vi.fn(),
        },
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
            on_pause_state: vi.fn(() => () => undefined),
            on_autostart_state: vi.fn(() => () => undefined),
        },
        auth: { cookieLogin: vi.fn() },
        session: { login: vi.fn(), refresh: vi.fn() },
        grok: { login_status: vi.fn() },
        kimi: { login_status: vi.fn() },
        logs: { export: vi.fn() },
        log: vi.fn(),
        tokenStats: {
            open: vi.fn(),
            getBuckets: vi.fn().mockResolvedValue([]),
            getSessions: vi.fn().mockResolvedValue([]),
            getSessionStats: vi.fn().mockResolvedValue({ sessions: 3, agents: 3, tokens: 1125 }),
            getRecords: vi.fn().mockResolvedValue([]),
            getHeatmap: vi.fn().mockResolvedValue([]),
            getHourBuckets: vi.fn().mockResolvedValue([]),
            getRangeRollup: vi.fn().mockResolvedValue([]),
            getDashboard: vi.fn(),
            getDashboardSessions: vi.fn(),
            getStatus: vi.fn().mockResolvedValue({ running: false, last_updated: null }),
            onUpdated: vi.fn(() => () => undefined),
        },
        trend: {
            get: vi.fn().mockResolvedValue([]),
            getBulk: vi.fn().mockResolvedValue({ series: [] }),
        },
        sessionHistory: {
            open: vi.fn().mockResolvedValue(undefined),
            subscribe: vi.fn().mockResolvedValue({ subscribed: true }),
            unsubscribe: vi.fn().mockResolvedValue({ unsubscribed: true }),
            query: vi.fn().mockResolvedValue({ messages: [], next_cursor: null }),
            recent: vi.fn().mockResolvedValue([]),
            searchContent: vi.fn().mockResolvedValue([]),
            summaries: vi.fn().mockResolvedValue({}),
            onMessagesUpdated: vi.fn(() => () => undefined),
            onFocus: vi.fn(() => () => undefined),
        },
        buildInfo: {
            get: vi.fn().mockResolvedValue({
                version: "1.1.0",
                branch: "t211",
                commit: "abc",
                subject: "x",
            }),
        },
    };
    (globalThis as unknown as { usageboard: unknown }).usageboard = usageboard;
    return usageboard;
}

export function reset_history_usageboard(): void {
    delete (globalThis as unknown as { usageboard?: unknown }).usageboard;
}
