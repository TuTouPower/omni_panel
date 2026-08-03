import { vi } from "vitest";
import type { AppConfiguration } from "../../../../src/shared/types/config";

export const save = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
export const saveSecrets = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
export const duplicate = vi
    .fn<(instanceId: string) => Promise<{ instanceId: string }>>()
    .mockResolvedValue({
        instanceId: "deepseek-2",
    });
export const createInstance = vi
    .fn<(manifestId: string) => Promise<{ instanceId: string }>>()
    .mockResolvedValue({
        instanceId: "deepseek-2",
    });
export const grok_login_status = vi.fn().mockResolvedValue({
    has_token: false,
    expires_at: null,
    can_refresh: false,
});

export const base_config: AppConfiguration = {
    schemaVersion: 1,
    language: "zh-Hans",
    launchAtLogin: false,
    plugins: [
        {
            instanceId: "deepseek-1",
            stateId: "deepseek-1",
            name: "deepseek",
            enabled: true,
            executablePath: "plugins/deepseek.ts",
            refreshIntervalSeconds: 300,
            parameterValues: {},
            endpointOverrides: {},
        },
        {
            instanceId: "cpa-1",
            stateId: "cpa-1",
            name: "cpa",
            enabled: true,
            executablePath: "plugins/cpa.ts",
            refreshIntervalSeconds: 300,
            parameterValues: { monitor_claude: "true" },
            endpointOverrides: { default: "http://cpa.example" },
        },
    ],
};

// 装配 window.usageboard 测试桩，等价于原 settings_view.test.tsx 顶部 beforeEach
// 的装配逻辑。current_config 重置由各测试文件 beforeEach 自己完成（TS 禁止对
// import 绑定赋值，故 current_config 保留在各文件内为局部 let，经 get_config
// 传给 config.get 以便 create_instance_and_save 读取最新 config）。
export function install_settings_usageboard(get_config: () => AppConfiguration): void {
    vi.clearAllMocks();
    window.matchMedia = vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    });
    const connectorMock = {
        list: vi.fn().mockResolvedValue([
            {
                instanceId: "deepseek-1",
                sourceInstanceId: "deepseek-1",
                stateId: "deepseek-1",
                name: "deepseek",
                displayName: "DeepSeek",
                enabled: true,
                source: "poll",
                supportedProviders: ["deepseek"],
                activeProviders: ["deepseek"],
                metadata: {
                    parameters: [
                        {
                            name: "API_KEY",
                            label: "API 密钥",
                            type: "secret",
                            required: true,
                        },
                    ],
                    endpoints: {
                        default: null,
                    },
                },
                snapshot: { status: "idle" },
            },
            {
                instanceId: "cpa-1",
                sourceInstanceId: "cpa-1",
                stateId: "cpa-1",
                name: "cpa",
                displayName: "CPA",
                enabled: true,
                source: "gateway",
                supportedProviders: ["claude", "codex", "antigravity", "kimi"],
                activeProviders: ["claude"],
                metadata: {
                    name: "cpa",
                    auth: {
                        method: "cpa_mgmt",
                        secret_name: "cpa_mgmt_key",
                        require_endpoint: true,
                    },
                    parameters: [
                        {
                            name: "cpa_mgmt_key",
                            label: "管理密钥",
                            type: "secret",
                            required: true,
                        },
                        {
                            name: "monitor_claude",
                            label: "Claude",
                            type: "boolean",
                            required: false,
                            defaultValue: "true",
                        },
                        {
                            name: "monitor_codex",
                            label: "Codex",
                            type: "boolean",
                            required: false,
                            defaultValue: "false",
                        },
                        {
                            name: "monitor_antigravity",
                            label: "Antigravity",
                            type: "boolean",
                            required: false,
                            defaultValue: "false",
                        },
                        {
                            name: "monitor_kimi",
                            label: "Kimi",
                            type: "boolean",
                            required: false,
                            defaultValue: "false",
                        },
                    ],
                    endpoints: {
                        default: "http://localhost:8080",
                    },
                },
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-05-31T00:00:00.000Z",
                    items: [
                        {
                            id: "claude-main",
                            provider: "claude",
                            source: "gateway",
                            sourceInstanceId: "cpa-1",
                            accountId: "claude-main",
                            accountLabel: "Claude Account",
                            name: "Claude 额度",
                            used: 10,
                            limit: 100,
                            displayStyle: "percent",
                            status: "normal",
                        },
                    ],
                },
            },
        ]),
        getState: vi.fn(),
        refresh: vi.fn(),
        refreshAll: vi.fn(),
        snapshot: vi.fn(),
        catalog: vi.fn().mockResolvedValue([]),
    };
    window.usageboard = {
        platform: "win32",
        connector: connectorMock,

        plugin: connectorMock,
        config: {
            get: vi
                .fn()
                .mockImplementation(() =>
                    Promise.resolve({ config: get_config(), hasSecrets: {} }),
                ),
            save: vi.fn(),
            getSecrets: vi.fn().mockResolvedValue({ cpa_mgmt_key: "vault-secret-key" }),
            saveSecrets: vi.fn(),
            duplicate: vi.fn(),
            createInstance,
            export: vi.fn(),
            import: vi.fn(),
        },
        event: {
            onStateChange: vi.fn(),
            onThemeChange: vi.fn(),
            onSettingsNavigate: vi.fn(() => vi.fn()),
        },
        popup: {
            report_content_height: vi.fn(),
        },
        main_panel: { hide: vi.fn(), get_mode: vi.fn().mockResolvedValue("popup") },
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
            login_status: grok_login_status,
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
            getStatus: vi.fn().mockResolvedValue({ running: false, last_updated: null }),
            onUpdated: vi.fn(() => vi.fn()),
        },
        trend: { get: vi.fn().mockResolvedValue([]) },
        logs: { export: vi.fn() },
        log: vi.fn(),
        buildInfo: {
            get: vi.fn().mockResolvedValue({
                version: "1.1.0",
                branch: "t030_test",
                commit: "abc1234",
                subject: "feat: do thing",
            }),
        },
    };
}
