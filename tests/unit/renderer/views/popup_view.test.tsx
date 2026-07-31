import { fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PopupView, record_bool_equal } from "../../../../src/renderer/views/PopupView";
import type { ConnectorInfo } from "../../../../src/shared/types/ipc";
import type { AppConfiguration } from "../../../../src/shared/types/config";

vi.mock("../../../../src/renderer/lib/theme", () => ({
    useTheme: () => undefined,
}));

class FakeResizeObserver {
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

function connectorInfo(overrides: Partial<ConnectorInfo> = {}): ConnectorInfo {
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

const plugin_list = vi.fn<() => Promise<ConnectorInfo[]>>();
const plugin_refresh = vi.fn<(instanceId: string) => Promise<void>>().mockResolvedValue(undefined);
const plugin_refresh_all = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
const main_panel_hide = vi.fn<() => void>();
const main_panel_get_mode = vi.fn<() => Promise<"popup" | "floating">>().mockResolvedValue("popup");
const usage_log = vi.fn<(payload: { level: string; module: string; message: string }) => void>();
const config_get = vi.fn();
const config_save = vi.fn<() => Promise<void>>();
const on_config_change = vi.fn((callback: (config: AppConfiguration) => void) => {
    void callback;
    return vi.fn();
});

const base_popup_config: AppConfiguration = {
    schemaVersion: 1,
    language: "zh-Hans",
    plugins: [],
    launchAtLogin: false,
};

describe("PopupView", () => {
    beforeEach(() => {
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
                getStatus: vi.fn().mockResolvedValue({ running: false, last_updated: null }),
                onUpdated: vi.fn(() => vi.fn()),
            },
            trend: { get: vi.fn().mockResolvedValue([]) },
            logs: { export: vi.fn() },
            log: usage_log,
            buildInfo: {
                get: vi.fn().mockResolvedValue({ version: "1.1.0", branch: "dev", commit: "dev" }),
            },
        };
    });
    it("renders provider tabs without a CPA provider tab", async () => {
        render(<PopupView />);

        await waitFor(() => {
            expect(screen.getByRole("button", { name: /总览/ })).toBeInTheDocument();
        });

        expect(screen.getByRole("button", { name: /^Claude$/ })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /^DeepSeek$/ })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /^CPA$/ })).not.toBeInTheDocument();
    });

    it("shows update time in title bar instead of statusbar", async () => {
        render(<PopupView />);

        await waitFor(() => {
            expect(document.querySelector(".tb-time")).not.toBeNull();
        });
        expect(document.querySelector(".tb-time")?.textContent).toBeTruthy();
        expect(document.querySelector(".statusbar")).toBeNull();
    });

    it("refreshes every enabled connector for a provider", async () => {
        plugin_list.mockResolvedValue([
            connectorInfo({
                source: "gateway",
                sourceInstanceId: "cpa-1",
                supportedProviders: ["claude"],
                activeProviders: ["claude"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [
                        {
                            id: "claude-pro",
                            provider: "claude",
                            source: "gateway",
                            sourceInstanceId: "cpa-1",
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
                sourceInstanceId: "claude-direct-1",
                supportedProviders: ["claude"],
                activeProviders: ["claude"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:01:00Z",
                    items: [],
                },
            }),
            connectorInfo({
                source: "poll",
                sourceInstanceId: "claude-disabled-1",
                supportedProviders: ["claude"],
                activeProviders: ["claude"],
                enabled: false,
            }),
            connectorInfo({
                source: "poll",
                sourceInstanceId: "kimi-direct-1",
                supportedProviders: ["kimi"],
                activeProviders: ["kimi"],
            }),
        ]);

        render(<PopupView />);

        const refreshButton = await screen.findByRole("button", { name: /刷新 Claude/ });
        fireEvent.click(refreshButton);

        await waitFor(() => {
            expect(plugin_refresh).toHaveBeenCalledTimes(2);
        });
        expect(plugin_refresh).toHaveBeenCalledWith("cpa-1");
        expect(plugin_refresh).toHaveBeenCalledWith("claude-direct-1");
        expect(plugin_refresh).not.toHaveBeenCalledWith("claude-disabled-1");
        expect(plugin_refresh).not.toHaveBeenCalledWith("kimi-direct-1");
    });

    it("opens settings for re-login when provider auth fails (t157)", async () => {
        plugin_list.mockResolvedValue([
            connectorInfo({
                source: "poll",
                sourceInstanceId: "kimi-direct-1",
                name: "kimi",
                displayName: "Kimi",
                supportedProviders: ["kimi"],
                activeProviders: ["kimi"],
                snapshot: {
                    status: "failed",
                    updatedAt: "2026-01-01T12:00:00Z",
                    error: "401 Unauthorized: token expired",
                    items: [],
                },
            }),
        ]);

        const settings_open = vi.fn();
        const cookie_login = vi.fn();
        window.usageboard.settings.open = settings_open;
        window.usageboard.auth.cookieLogin = cookie_login;

        render(<PopupView />);

        const re_login = await screen.findByText("重新登录");
        fireEvent.click(re_login);

        await waitFor(() => {
            expect(settings_open).toHaveBeenCalledWith({ instanceId: "poll-connector" });
        });
        expect(cookie_login).not.toHaveBeenCalled();
    });

    it("logs provider refresh failures", async () => {
        plugin_refresh.mockRejectedValueOnce(new Error("refresh failed"));

        render(<PopupView />);

        const refreshButton = await screen.findByRole("button", { name: /刷新 Claude/ });
        fireEvent.click(refreshButton);

        await waitFor(() => {
            expect(usage_log).toHaveBeenCalledWith({
                level: "error",
                module: "PopupView",
                message: "刷新 claude 失败: refresh failed",
            });
        });
    });

    it("logs refresh all failures", async () => {
        plugin_refresh_all.mockRejectedValueOnce(new Error("refresh all failed"));

        render(<PopupView />);

        const refreshButton = await screen.findByRole("button", { name: "刷新" });
        fireEvent.click(refreshButton);

        await waitFor(() => {
            expect(usage_log).toHaveBeenCalledWith({
                level: "error",
                module: "PopupView",
                message: "刷新全部失败: refresh all failed",
            });
        });
    });

    it("collapse toggle does not trigger provider refresh", async () => {
        render(<PopupView />);

        // Switch to Claude tab to see collapsible account rows
        const claude_tab = await screen.findByRole("button", { name: /^Claude$/ });
        fireEvent.click(claude_tab);

        const collapse_btn = await screen.findByRole("button", { name: /折叠 Claude Account/ });
        fireEvent.click(collapse_btn);

        // Collapse toggles are purely UI — no refresh should fire
        expect(plugin_refresh).not.toHaveBeenCalled();
        expect(plugin_refresh_all).not.toHaveBeenCalled();
    });

    it("collapse state does not affect aggregated provider data", async () => {
        render(<PopupView />);

        // Switch to Claude tab
        const claude_tab = await screen.findByRole("button", { name: /^Claude$/ });
        fireEvent.click(claude_tab);

        // Collapse an account — the data shown for other accounts stays the same
        const collapse_btn = await screen.findByRole("button", { name: /折叠 Claude Account/ });
        fireEvent.click(collapse_btn);

        // The collapsed card is hidden but other data stays
        await waitFor(() => {
            const expand_btn = screen.queryByRole("button", { name: /展开 Claude Account/ });
            expect(expand_btn).toBeInTheDocument();
        });
    });

    it("does not show the floating close button in popup mode", async () => {
        render(<PopupView />);

        await waitFor(() => {
            expect(main_panel_get_mode).toHaveBeenCalled();
        });

        expect(screen.queryByRole("button", { name: "隐藏用量面板" })).not.toBeInTheDocument();
    });

    it("shows the floating close button in floating mode and hides the main panel", async () => {
        main_panel_get_mode.mockResolvedValue("floating");

        render(<PopupView />);

        const close_btn = await screen.findByRole("button", { name: "隐藏用量面板" });
        fireEvent.click(close_btn);

        expect(main_panel_hide).toHaveBeenCalledTimes(1);
    });

    it("does not expose extra floating close buttons from mirror trees", async () => {
        const original_resize_observer = globalThis.ResizeObserver;
        (globalThis as Record<string, unknown>)["ResizeObserver"] = FakeResizeObserver;
        main_panel_get_mode.mockResolvedValue("floating");

        const view = render(<PopupView />);

        try {
            await waitFor(() => {
                expect(screen.getAllByRole("button", { name: "隐藏用量面板" }).length).toBe(1);
            });
        } finally {
            view.unmount();
            (globalThis as Record<string, unknown>)["ResizeObserver"] = original_resize_observer;
        }
    });

    it("shows account-level menu on account rows", async () => {
        render(<PopupView />);

        // Switch to Claude tab to see accounts
        const claude_tab = await screen.findByRole("button", { name: /^Claude$/ });
        fireEvent.click(claude_tab);

        await waitFor(() => {
            expect(screen.getAllByText("Claude Account").length).toBeGreaterThan(0);
        });

        // Account rows no longer expose account-level edit menu on main panel
        expect(screen.queryByLabelText("账号操作")).not.toBeInTheDocument();
    });

    it("account rows do not show hide, delete, or 关闭监控 menus", async () => {
        // P0-3：删除 accountOverrides.disabled 后，账号子行不再有"关闭监控"
        // 入口。隐藏由 hidden 覆盖，禁用按钮违反不变量 8（越层写破坏性状态）。
        // T8：主面板编辑入口也已移除。
        render(<PopupView />);

        const claude_tab = await screen.findByRole("button", { name: /^Claude$/ });
        fireEvent.click(claude_tab);

        await waitFor(() => {
            expect(screen.getAllByText("Claude Account").length).toBeGreaterThan(0);
        });

        expect(screen.queryByLabelText("账号操作")).not.toBeInTheDocument();
        expect(screen.queryByText("编辑")).not.toBeInTheDocument();
        expect(screen.queryByText("隐藏")).not.toBeInTheDocument();
        expect(screen.queryByText("删除")).not.toBeInTheDocument();
        expect(screen.queryByText("关闭监控")).not.toBeInTheDocument();
    });

    it("does not open settings from account edit on main panel", async () => {
        const settings_open = vi.fn();
        window.usageboard.settings.open = settings_open;

        render(<PopupView />);

        const claude_tab = await screen.findByRole("button", { name: /^Claude$/ });
        fireEvent.click(claude_tab);

        await waitFor(() => {
            expect(screen.getAllByText("Claude Account").length).toBeGreaterThan(0);
        });
        expect(screen.queryByLabelText("账号操作")).not.toBeInTheDocument();
        expect(settings_open).not.toHaveBeenCalled();
    });

    // t158: when a single connector reports 401, clicking "重新登录" on the
    // auth-error banner must open settings for that specific instanceId —
    // not the first connector matching the provider (the legacy bug).
    it("overview re-login banner for a single failed connector opens settings with that instanceId", async () => {
        const settings_open = vi.fn();
        window.usageboard.settings.open = settings_open;

        // Replace the default successful CPA connector with a single failed
        // local Claude connector at instanceId="local-failed-A".
        plugin_list.mockResolvedValue([
            connectorInfo({
                instanceId: "local-failed-A",
                sourceInstanceId: "src-local-failed-A",
                stateId: "local-failed-A",
                name: "claude-local",
                displayName: "Claude Local",
                source: "local",
                supportedProviders: ["claude"],
                activeProviders: ["claude"],
                snapshot: {
                    status: "failed",
                    error: "HTTP 401 invalid_token",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [],
                },
            }),
        ]);

        render(<PopupView />);

        // Auth-error cards stay expanded so the banner is visible immediately.
        await waitFor(() => {
            expect(screen.getByText("凭证失效，请重新登录")).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText("重新登录"));

        await waitFor(() => {
            expect(settings_open).toHaveBeenCalledTimes(1);
        });
        expect(settings_open).toHaveBeenCalledWith({
            instanceId: "local-failed-A",
        });
    });

    // t158: with TWO connectors sharing the same provider where both fail,
    // the overview banner's re-login button routes to the FIRST failed
    // instance (preserves existing UX for users who never needed multi-instance
    // targeting). Per-row re-login buttons handle the rest.
    it("overview banner re-login routes to first failed instance when multiple share provider", async () => {
        const settings_open = vi.fn();
        window.usageboard.settings.open = settings_open;

        plugin_list.mockResolvedValue([
            connectorInfo({
                instanceId: "uuid-old",
                sourceInstanceId: "src-uuid-old",
                stateId: "uuid-old",
                name: "grok-uuid",
                displayName: "Grok Old",
                source: "local",
                supportedProviders: ["grok"],
                activeProviders: ["grok"],
                snapshot: {
                    status: "failed",
                    error: "401 invalid_token",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [],
                },
            }),
            connectorInfo({
                instanceId: "grok-ts-new",
                sourceInstanceId: "src-grok-ts-new",
                stateId: "grok-ts-new",
                name: "grok-new",
                displayName: "Grok New",
                source: "local",
                supportedProviders: ["grok"],
                activeProviders: ["grok"],
                snapshot: {
                    status: "failed",
                    error: "401 invalid_token",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [],
                },
            }),
        ]);

        render(<PopupView />);

        // Auth-error cards stay expanded so the banner is visible immediately.
        await waitFor(() => {
            expect(screen.getByText("凭证失效，请重新登录")).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText("重新登录"));

        await waitFor(() => {
            expect(settings_open).toHaveBeenCalledTimes(1);
        });
        // First failed instance — preserves legacy UX. Per-row buttons cover
        // the second failing account.
        expect(settings_open).toHaveBeenCalledWith({
            instanceId: "uuid-old",
        });
    });

    // t158: per-row re-login must route to the SPECIFIC failing account —
    // not the first connector matching the provider (which is the legacy
    // bug). With two failed GroK accounts, clicking each row's button must
    // open settings for THAT instance.
    it("per-row re-login opens settings for the specific failed account (multi-instance routing)", async () => {
        const settings_open = vi.fn();
        window.usageboard.settings.open = settings_open;

        plugin_list.mockResolvedValue([
            connectorInfo({
                instanceId: "uuid-old",
                sourceInstanceId: "uuid-old",
                stateId: "uuid-old",
                name: "grok-uuid",
                displayName: "Grok Old",
                source: "local",
                supportedProviders: ["grok"],
                activeProviders: ["grok"],
                snapshot: {
                    status: "failed",
                    error: "401 invalid_token",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [],
                },
            }),
            connectorInfo({
                instanceId: "grok-ts-new",
                sourceInstanceId: "grok-ts-new",
                stateId: "grok-ts-new",
                name: "grok-new",
                displayName: "Grok New",
                source: "local",
                supportedProviders: ["grok"],
                activeProviders: ["grok"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [
                        {
                            id: "grok-ok",
                            provider: "grok",
                            source: "local",
                            sourceInstanceId: "grok-ts-new",
                            accountId: "grok-new",
                            accountLabel: "Grok New",
                            raw_label: "monthly",
                            normalized_label: "Monthly",
                            used: 30,
                            limit: 100,
                            displayStyle: "percent",
                            resetAt: null,
                            status: "normal",
                            observedAt: Date.now(),
                            stale: false,
                        },
                    ],
                },
            }),
        ]);

        render(<PopupView />);

        // Click into GroK tab so per-row list is visible.
        const grokTab = await screen.findByRole("button", { name: /^Grok$/ });
        fireEvent.click(grokTab);

        // Failed GroK Old row shows per-row 重新登录 button.
        await waitFor(() => {
            expect(document.querySelectorAll(".row-relogin-btn").length).toBeGreaterThanOrEqual(1);
        });

        const rowButtons = document.querySelectorAll(".row-relogin-btn");
        const rowRelogin = rowButtons[0];
        if (!rowRelogin) throw new Error("no row-level 重新登录 button found");
        fireEvent.click(rowRelogin);

        await waitFor(() => {
            expect(settings_open).toHaveBeenCalledTimes(1);
        });
        // Must route to the failing local connector's instanceId (uuid-old),
        // NOT grok-ts-new (the working one). This proves we no longer collapse
        // by provider.
        expect(settings_open).toHaveBeenCalledWith({
            instanceId: "uuid-old",
        });
    });

    it("does not re-save providerOrder when external CONFIG_CHANGED arrives", async () => {
        // PopupView should NOT call config.save() with providerOrder
        // when the providerOrder was received from another window via CONFIG_CHANGED.
        // If it does, it creates a ping-pong loop between popup and settings windows.

        let on_config_change_cb: ((config: AppConfiguration) => void) | undefined;
        window.usageboard.event.onConfigChange = vi.fn((cb: (config: AppConfiguration) => void) => {
            on_config_change_cb = cb;
            return vi.fn();
        });
        const config_save = vi.fn().mockResolvedValue(undefined);
        window.usageboard.config.save = config_save;

        render(<PopupView />);

        await screen.findByText("总览");

        // Simulate CONFIG_CHANGED from settings window with providerOrder
        expect(on_config_change_cb).toBeDefined();
        const incoming: AppConfiguration = {
            schemaVersion: 1,
            language: "zh-Hans",
            launchAtLogin: false,
            plugins: [],
            providerOrder: ["claude", "deepseek"],
        };

        await act(async () => {
            on_config_change_cb?.(incoming);
            await Promise.resolve();
        });

        // provider_order state should be set but MUST NOT trigger a config.save()
        // with providerOrder (that would bounce back to settings window)
        expect(config_save).not.toHaveBeenCalled();
    });

    it("renders provider cards after CONFIG_CHANGED sync with providerOrder", async () => {
        // Smoking test: when CONFIG_CHANGED arrives with providerOrder,
        // cards must still be visible (no blank screen regression).

        let on_config_change_cb: ((config: AppConfiguration) => void) | undefined;
        window.usageboard.event.onConfigChange = vi.fn((cb: (config: AppConfiguration) => void) => {
            on_config_change_cb = cb;
            return vi.fn();
        });
        const config_save = vi.fn().mockResolvedValue(undefined);
        window.usageboard.config.save = config_save;

        render(<PopupView />);

        // Initial render: cards are visible
        await screen.findByText("总览");
        await waitFor(() => {
            expect(screen.getAllByText("Claude").length).toBeGreaterThanOrEqual(1);
            expect(screen.getAllByText("DeepSeek").length).toBeGreaterThanOrEqual(1);
        });

        // External CONFIG_CHANGED from settings window
        expect(on_config_change_cb).toBeDefined();
        await act(async () => {
            on_config_change_cb?.({
                schemaVersion: 1,
                language: "zh-Hans",
                launchAtLogin: false,
                plugins: [],
                providerOrder: ["deepseek", "claude"],
            });
            await Promise.resolve();
        });

        // Cards must still be visible after CONFIG_CHANGED sync
        expect(screen.getByText("总览")).toBeInTheDocument();
        expect(screen.getAllByText("Claude").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("DeepSeek").length).toBeGreaterThanOrEqual(1);
        // No save must have happened
        expect(config_save).not.toHaveBeenCalled();
    });

    it("status bar relative time updates automatically via useNowTick", async () => {
        vi.useFakeTimers();
        try {
            const start = new Date("2026-01-01T12:05:30Z");
            vi.setSystemTime(start);

            // Capture the useNowTick timer callback to manually invoke it.
            const setInterval_spy = vi.spyOn(globalThis, "setInterval");
            render(<PopupView />);
            const tick = setInterval_spy.mock.calls[0]?.[0];
            setInterval_spy.mockRestore();

            // Flush initial async work and render.
            await act(async () => {
                await vi.advanceTimersByTimeAsync(0);
            });

            // Latest connector updatedAt: "2026-01-01T12:05:00Z" (DeepSeek).
            // At t=12:05:30 → "30 秒前".
            expect(tick).toBeDefined();
            expect(screen.queryAllByText("30 秒前").length).toBeGreaterThan(0);

            // Simulate 30s tick → "1 分钟前"
            vi.setSystemTime(new Date("2026-01-01T12:06:00Z"));
            act(() => {
                if (tick) tick();
            });
            expect(screen.queryAllByText("1 分钟前").length).toBeGreaterThan(0);
        } finally {
            vi.useRealTimers();
        }
    });

    it("shows empty state with add service prompt when no plugins configured", async () => {
        plugin_list.mockResolvedValue([]);
        render(<PopupView />);
        await waitFor(() => {
            expect(screen.getByText("还没有添加任何服务")).toBeInTheDocument();
        });
        const add_btn = screen.getByText("添加服务");
        expect(add_btn).toBeInTheDocument();
    });

    it("loads collapsedAccounts from config on startup", async () => {
        // Verify config with collapsedAccounts is loaded without errors.
        // The save test already proves toggle→config wiring works in both
        // directions. This test just verifies the config field is accepted.
        const config_get = vi.fn().mockResolvedValue({
            config: {
                schemaVersion: 1,
                language: "zh-Hans",
                plugins: [],
                launchAtLogin: false,
                collapsedAccounts: { "cpa-main|label|Claude Account": true },
                expandedProviders: { claude: true },
            },
            hasSecrets: {},
        });
        window.usageboard.config.get = config_get;

        render(<PopupView />);

        await waitFor(() => {
            expect(config_get).toHaveBeenCalled();
        });
        // Component renders without crashing — config field accepted.
        expect(await screen.findByText("总览")).toBeInTheDocument();
    });

    it("preserves collapse state on disk when settings saves without the field", async () => {
        // Regression: if the popup saves collapsedAccounts then settings saves
        // a config that does NOT contain collapsedAccounts (because it never
        // received the popup's CONFIG_CHANGED), the disk must still retain
        // collapsedAccounts from the popup's earlier save.
        const config_save = vi.fn().mockResolvedValue(undefined);
        window.usageboard.config.save = config_save;

        render(<PopupView />);

        const claude_tab = await screen.findByRole("button", { name: /^Claude$/ });
        fireEvent.click(claude_tab);

        await waitFor(() => {
            expect(screen.getAllByText("Claude Account").length).toBeGreaterThan(0);
        });

        // Collapse the account
        const collapse_btn = screen.getByRole("button", { name: /折叠 Claude Account/ });
        fireEvent.click(collapse_btn);

        await waitFor(() => {
            expect(config_save).toHaveBeenCalled();
        });

        // The saved payload MUST always include collapsedAccounts key,
        // even when it's the first toggle (state not yet on disk).
        const last_call = config_save.mock.calls[config_save.mock.calls.length - 1];
        expect(last_call).toBeDefined();
        if (!last_call) return;
        const saved = last_call[0] as Record<string, unknown>;
        expect(saved).toHaveProperty("collapsedAccounts");
        expect(saved).toHaveProperty("expandedProviders");
    });

    it("preserves collapsedAccounts from config after plugin data loads", async () => {
        // Regression: structural_signature changed from "" → real when
        // plugin data arrived, which triggered a full reset of
        // collapsed_accounts, wiping the config-restored state.
        const config_get = vi.fn().mockResolvedValue({
            config: {
                schemaVersion: 1,
                language: "zh-Hans",
                plugins: [],
                launchAtLogin: false,
                collapsedAccounts: { "cpa-main|label|Claude Account": true },
            },
            hasSecrets: {},
        });
        window.usageboard.config.get = config_get;

        render(<PopupView />);

        // Switch to Claude tab to see the account row
        const claude_tab = await screen.findByRole("button", { name: /^Claude$/ });
        fireEvent.click(claude_tab);

        // The account should be collapsed (as restored from config),
        // so we should see an "展开" button, not "折叠"
        await waitFor(() => {
            expect(screen.getByRole("button", { name: /展开 Claude Account/ })).toBeInTheDocument();
        });
    });

    it("preserves collapse state when onStateChange updates data with same accounts", async () => {
        // Regression: per-provider refresh triggered onStateChange which changed
        // structural_signature, causing collapsed_accounts to be wiped.
        let on_state_change_cb: ((instanceId: string, state: unknown) => void) | undefined;
        window.usageboard.event.onStateChange = vi.fn(
            (cb: (instanceId: string, state: unknown) => void) => {
                on_state_change_cb = cb;
                return vi.fn();
            },
        );
        const config_get = vi.fn().mockResolvedValue({
            config: {
                schemaVersion: 1,
                language: "zh-Hans",
                plugins: [],
                launchAtLogin: false,
                collapsedAccounts: { "cpa-main|label|Claude Account": true },
            },
            hasSecrets: {},
        });
        window.usageboard.config.get = config_get;

        render(<PopupView />);

        const claude_tab = await screen.findByRole("button", { name: /^Claude$/ });
        fireEvent.click(claude_tab);

        // Account starts collapsed (from config)
        await waitFor(() => {
            expect(screen.getByRole("button", { name: /展开 Claude Account/ })).toBeInTheDocument();
        });

        // Simulate onStateChange with updated data — same accounts, different usage
        expect(on_state_change_cb).toBeDefined();
        act(() => {
            on_state_change_cb?.("gateway-connector", {
                status: "ready",
                updatedAt: "2026-01-01T12:10:00Z",
                items: [
                    {
                        id: "claude-pro",
                        provider: "claude",
                        source: "gateway",
                        sourceInstanceId: "cpa-main",
                        accountId: "claude-account",
                        accountLabel: "Claude Account",
                        raw_label: "claude-pro",
                        normalized_label: "Claude Pro",
                        used: 50,
                        limit: 100,
                        displayStyle: "percent",
                        resetAt: null,
                        status: "warning",
                    },
                ],
            });
        });

        // Collapse state MUST be preserved — account still collapsed
        await waitFor(() => {
            expect(screen.getByRole("button", { name: /展开 Claude Account/ })).toBeInTheDocument();
        });
        expect(
            screen.queryByRole("button", { name: /折叠 Claude Account/ }),
        ).not.toBeInTheDocument();
    });

    it("prunes collapse state only for accounts removed by onStateChange", async () => {
        // Regression: structural_signature effect used to reset ALL collapse state
        // on any data change. Now it should only prune entries for accounts that
        // no longer exist.
        let on_state_change_cb: ((instanceId: string, state: unknown) => void) | undefined;
        window.usageboard.event.onStateChange = vi.fn(
            (cb: (instanceId: string, state: unknown) => void) => {
                on_state_change_cb = cb;
                return vi.fn();
            },
        );
        plugin_list.mockResolvedValue([
            connectorInfo({
                source: "gateway",
                sourceInstanceId: "cpa-main",
                supportedProviders: ["claude"],
                activeProviders: ["claude"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [
                        {
                            id: "acc-a",
                            provider: "claude",
                            source: "gateway",
                            sourceInstanceId: "cpa-main",
                            accountId: "auth-a",
                            accountLabel: "Account A",
                            raw_label: "5h",
                            normalized_label: "5小时",
                            used: 10,
                            limit: 100,
                            displayStyle: "percent",
                            resetAt: null,
                            observedAt: 1735689600000,
                            stale: false,
                            status: "normal",
                        },
                        {
                            id: "acc-b",
                            provider: "claude",
                            source: "gateway",
                            sourceInstanceId: "cpa-main",
                            accountId: "auth-b",
                            accountLabel: "Account B",
                            raw_label: "5h",
                            normalized_label: "5小时",
                            used: 20,
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
        ]);
        const config_get = vi.fn().mockResolvedValue({
            config: {
                schemaVersion: 1,
                language: "zh-Hans",
                plugins: [],
                launchAtLogin: false,
                collapsedAccounts: {
                    "cpa-main|label|Account A": true,
                    "cpa-main|label|Account B": true,
                },
            },
            hasSecrets: {},
        });
        window.usageboard.config.get = config_get;

        render(<PopupView />);

        const claude_tab = await screen.findByRole("button", { name: /^Claude$/ });
        fireEvent.click(claude_tab);

        // Both accounts start collapsed
        await waitFor(() => {
            expect(screen.getByRole("button", { name: /展开 Account A/ })).toBeInTheDocument();
            expect(screen.getByRole("button", { name: /展开 Account B/ })).toBeInTheDocument();
        });

        // Simulate onStateChange removing Account B
        expect(on_state_change_cb).toBeDefined();
        act(() => {
            on_state_change_cb?.("gateway-connector", {
                status: "ready",
                updatedAt: "2026-01-01T12:10:00Z",
                items: [
                    {
                        id: "acc-a",
                        provider: "claude",
                        source: "gateway",
                        sourceInstanceId: "cpa-main",
                        accountId: "auth-a",
                        accountLabel: "Account A",
                        raw_label: "5h",
                        normalized_label: "5小时",
                        used: 10,
                        limit: 100,
                        displayStyle: "percent",
                        resetAt: null,
                        status: "normal",
                    },
                ],
            });
        });

        // Account A should still be collapsed; Account B gone from DOM
        await waitFor(() => {
            expect(screen.getByRole("button", { name: /展开 Account A/ })).toBeInTheDocument();
            expect(screen.queryByText("Account B")).not.toBeInTheDocument();
        });
    });

    it("loads accountOrders from config on startup", async () => {
        plugin_list.mockResolvedValue([
            connectorInfo({
                source: "gateway",
                sourceInstanceId: "cpa-main",
                supportedProviders: ["claude"],
                activeProviders: ["claude"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [
                        {
                            id: "acc-a",
                            provider: "claude",
                            source: "gateway",
                            sourceInstanceId: "cpa-main",
                            accountId: "auth-a",
                            accountLabel: "Account A",
                            raw_label: "5h",
                            normalized_label: "5小时",
                            used: 10,
                            limit: 100,
                            displayStyle: "percent",
                            resetAt: null,
                            observedAt: 1735689600000,
                            stale: false,
                            status: "normal",
                        },
                        {
                            id: "acc-b",
                            provider: "claude",
                            source: "gateway",
                            sourceInstanceId: "cpa-main",
                            accountId: "auth-b",
                            accountLabel: "Account B",
                            raw_label: "5h",
                            normalized_label: "5小时",
                            used: 20,
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
        ]);
        window.usageboard.config.get = vi.fn().mockResolvedValue({
            config: {
                schemaVersion: 1,
                language: "zh-Hans",
                plugins: [],
                launchAtLogin: false,
                accountOrders: {
                    claude: ["cpa-main|label|Account B", "cpa-main|label|Account A"],
                },
            },
            hasSecrets: {},
        });

        render(<PopupView />);

        const claude_tab = await screen.findByRole("button", { name: /^Claude$/ });
        fireEvent.click(claude_tab);

        const account_b = await screen.findByText("Account B");
        const account_a = screen.getByText("Account A");
        expect(
            account_b.compareDocumentPosition(account_a) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it("saves accountOrders to config when user reorders accounts", async () => {
        plugin_list.mockResolvedValue([
            connectorInfo({
                source: "gateway",
                sourceInstanceId: "cpa-main",
                supportedProviders: ["claude"],
                activeProviders: ["claude"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [
                        {
                            id: "acc-a",
                            provider: "claude",
                            source: "gateway",
                            sourceInstanceId: "cpa-main",
                            accountId: "auth-a",
                            accountLabel: "Account A",
                            raw_label: "5h",
                            normalized_label: "5小时",
                            used: 10,
                            limit: 100,
                            displayStyle: "percent",
                            resetAt: null,
                            observedAt: 1735689600000,
                            stale: false,
                            status: "normal",
                        },
                        {
                            id: "acc-b",
                            provider: "claude",
                            source: "gateway",
                            sourceInstanceId: "cpa-main",
                            accountId: "auth-b",
                            accountLabel: "Account B",
                            raw_label: "5h",
                            normalized_label: "5小时",
                            used: 20,
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
        ]);
        const config_save = vi.fn().mockResolvedValue(undefined);
        window.usageboard.config.save = config_save;

        render(<PopupView />);

        const claude_tab = await screen.findByRole("button", { name: /^Claude$/ });
        fireEvent.click(claude_tab);

        await waitFor(() => {
            expect(screen.getByText("Account A")).toBeInTheDocument();
            expect(screen.getByText("Account B")).toBeInTheDocument();
        });

        const account_a = screen.getByText("Account A").closest(".card");
        const account_b = screen.getByText("Account B").closest(".card");
        if (!account_a || !account_b) throw new Error("account cards not found");

        fireEvent.dragStart(account_b);
        fireEvent.dragEnter(account_a);
        fireEvent.dragEnd(account_b);

        await waitFor(() => {
            expect(config_save).toHaveBeenCalledWith(
                expect.objectContaining({
                    accountOrders: {
                        claude: ["cpa-main|label|Account B", "cpa-main|label|Account A"],
                    },
                }),
            );
        });
    });

    it("saves collapsedAccounts to config when user toggles", async () => {
        const config_save = vi.fn().mockResolvedValue(undefined);
        window.usageboard.config.save = config_save;

        render(<PopupView />);

        const claude_tab = await screen.findByRole("button", { name: /^Claude$/ });
        fireEvent.click(claude_tab);

        await waitFor(() => {
            expect(screen.getAllByText("Claude Account").length).toBeGreaterThan(0);
        });

        // Collapse Claude Account
        const collapse_btn = screen.getByRole("button", { name: /折叠 Claude Account/ });
        fireEvent.click(collapse_btn);

        await waitFor(() => {
            expect(config_save).toHaveBeenCalled();
        });
        const last_call = config_save.mock.calls[config_save.mock.calls.length - 1];
        if (!last_call) return;
        const saved = (last_call[0] as Record<string, unknown>)["collapsedAccounts"];
        expect(saved).toEqual({ "cpa-main|label|Claude Account": true });
    });

    it("scrolls .scroll back to top when an upcoming-reset row is clicked", async () => {
        const future = Date.now() + 3 * 24 * 60 * 60 * 1000;
        plugin_list.mockResolvedValue([
            connectorInfo({
                source: "gateway",
                sourceInstanceId: "cpa-main",
                supportedProviders: ["claude"],
                activeProviders: ["claude"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [
                        {
                            id: "claude-pro",
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
                            resetAt: future,
                            cycleDurationMs: 7 * 24 * 60 * 60 * 1000,
                            observedAt: 1735689600000,
                            stale: false,
                            status: "normal",
                        },
                    ],
                },
            }),
        ]);
        window.usageboard.config.get = vi.fn().mockResolvedValue({
            config: {
                schemaVersion: 1,
                language: "zh-Hans",
                plugins: [],
                launchAtLogin: false,
                upcomingResetThresholdPercent: 100,
                // t043: period 仅当 (provider, accountKey, raw_label) 在 watched 集合才进 upcoming。
                accountOverrides: {
                    upcomingResetWatched: {
                        claude: { "cpa-main|label|Claude Account": ["claude-pro"] },
                    },
                },
            },
            hasSecrets: {},
        });

        const scroll_spy = vi.fn();
        // eslint-disable-next-line @typescript-eslint/unbound-method -- spy 保存原方法引用以便 finally restore
        const original_scroll_to = HTMLElement.prototype.scrollTo;
        HTMLElement.prototype.scrollTo = scroll_spy;
        try {
            render(<PopupView />);

            const expand_button = await screen.findByLabelText("展开即将重置");
            fireEvent.click(expand_button);
            const rows = await screen.findAllByRole("button", { name: /切换到 claude/i });
            expect(rows.length).toBeGreaterThan(0);
            const first_row = rows[0];
            if (!first_row) throw new Error("expected at least one provider row");
            fireEvent.click(first_row);

            await waitFor(() => {
                expect(scroll_spy).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
            });
        } finally {
            HTMLElement.prototype.scrollTo = original_scroll_to;
        }
    });

    it("mounts the upcoming reset card in the overview grid", async () => {
        const future = Date.now() + 3 * 24 * 60 * 60 * 1000;
        plugin_list.mockResolvedValue([
            connectorInfo({
                source: "gateway",
                sourceInstanceId: "cpa-main",
                supportedProviders: ["claude"],
                activeProviders: ["claude"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [
                        {
                            id: "claude-pro",
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
                            resetAt: future,
                            cycleDurationMs: 7 * 24 * 60 * 60 * 1000,
                            observedAt: 1735689600000,
                            stale: false,
                            status: "normal",
                        },
                    ],
                },
            }),
        ]);
        window.usageboard.config.get = vi.fn().mockResolvedValue({
            config: {
                schemaVersion: 1,
                language: "zh-Hans",
                plugins: [],
                launchAtLogin: false,
                upcomingResetThresholdPercent: 100,
            },
            hasSecrets: {},
        });

        render(<PopupView />);

        await screen.findByRole("button", { name: /^Claude$/ });

        const live_grid = document.querySelector(".window:not(.popup-mirror) .overview-grid");
        await waitFor(() => {
            expect(live_grid?.querySelector('[data-card-id="__upcoming_reset__"]')).not.toBeNull();
        });
        expect(live_grid?.querySelector(".upcoming-banner")).toBeNull();
        expect(live_grid?.querySelector(".upcoming-rail")).toBeNull();
        // t105: the reset card is a normal grid child, so the old two-column
        // banner/rail wrapper must be gone entirely.
        expect(document.querySelector(".overview-row")).toBeNull();
    });

    it("preserves upcoming reset card expansion across provider data refresh", async () => {
        // Regression guard (t105 spec): the reserved key __upcoming_reset__ must
        // survive structural pruning when provider data changes. Without the
        // explicit entry in live_providers, expanding the card then refreshing
        // data (changing structural_signature past the prev==="" guard) would
        // drop the expansion and the card would collapse on every refresh.
        let on_state_change_cb: ((instanceId: string, state: unknown) => void) | undefined;
        window.usageboard.event.onStateChange = vi.fn(
            (cb: (instanceId: string, state: unknown) => void) => {
                on_state_change_cb = cb;
                return vi.fn();
            },
        );
        plugin_list.mockResolvedValue([
            connectorInfo({
                source: "gateway",
                sourceInstanceId: "cpa-main",
                supportedProviders: ["claude"],
                activeProviders: ["claude"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [
                        {
                            id: "acc-a",
                            provider: "claude",
                            source: "gateway",
                            sourceInstanceId: "cpa-main",
                            accountId: "auth-a",
                            accountLabel: "Account A",
                            raw_label: "5h",
                            normalized_label: "5小时",
                            used: 10,
                            limit: 100,
                            displayStyle: "percent",
                            resetAt: null,
                            observedAt: 1735689600000,
                            stale: false,
                            status: "normal",
                        },
                        {
                            id: "acc-b",
                            provider: "claude",
                            source: "gateway",
                            sourceInstanceId: "cpa-main",
                            accountId: "auth-b",
                            accountLabel: "Account B",
                            raw_label: "5h",
                            normalized_label: "5小时",
                            used: 20,
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
        ]);
        window.usageboard.config.get = vi.fn().mockResolvedValue({
            config: {
                schemaVersion: 1,
                language: "zh-Hans",
                plugins: [],
                launchAtLogin: false,
                upcomingResetThresholdPercent: 100,
            },
            hasSecrets: {},
        });

        render(<PopupView />);

        const expand_button = await screen.findByLabelText("展开即将重置");
        fireEvent.click(expand_button);
        await waitFor(() => {
            expect(screen.getByLabelText("折叠即将重置")).toBeInTheDocument();
        });

        // Simulate a provider data refresh that changes the account structure
        // (drops Account B). This advances structural_signature past the
        // first-load prev==="" guard into the pruning branch.
        expect(on_state_change_cb).toBeDefined();
        act(() => {
            on_state_change_cb?.("gateway-connector", {
                status: "ready",
                updatedAt: "2026-01-01T12:10:00Z",
                items: [
                    {
                        id: "acc-a",
                        provider: "claude",
                        source: "gateway",
                        sourceInstanceId: "cpa-main",
                        accountId: "auth-a",
                        accountLabel: "Account A",
                        raw_label: "5h",
                        normalized_label: "5小时",
                        used: 12,
                        limit: 100,
                        displayStyle: "percent",
                        resetAt: null,
                        status: "normal",
                    },
                ],
            });
        });

        // The reset card must stay expanded — its reserved key was not pruned.
        await waitFor(() => {
            expect(screen.getByLabelText("折叠即将重置")).toBeInTheDocument();
        });
    });

    it("persists upcoming reset card order and expansion", async () => {
        const config_save = vi.fn().mockResolvedValue(undefined);
        window.usageboard.config.get = vi.fn().mockResolvedValue({
            config: {
                schemaVersion: 1,
                language: "zh-Hans",
                plugins: [],
                launchAtLogin: false,
                upcomingResetThresholdPercent: 100,
                providerOrder: ["__upcoming_reset__", "deepseek", "claude"],
            },
            hasSecrets: {},
        });
        window.usageboard.config.save = config_save;

        render(<PopupView />);

        const collapse_button = await screen.findByLabelText("展开即将重置");
        const live_grid = document.querySelector(".window:not(.popup-mirror) .overview-grid");
        // Every overview card carries data-card-id, and the persisted order
        // drives the DOM order — the reserved card sits first here.
        expect(
            [...(live_grid?.children ?? [])].map((node) => node.getAttribute("data-card-id")),
        ).toEqual(["__upcoming_reset__", "deepseek", "claude"]);

        // t153: mount no longer re-saves already-persisted UI state, so there
        // is no initial save to settle — any save from here is click-driven.
        const calls_before = config_save.mock.calls.length;

        fireEvent.click(collapse_button);

        await waitFor(() => {
            expect(config_save.mock.calls.length).toBeGreaterThan(calls_before);
        });
        const click_call = config_save.mock.calls[calls_before];
        if (!click_call) throw new Error("missing config save after click");
        const saved = click_call[0] as AppConfiguration;
        expect(saved.providerOrder).toEqual(["__upcoming_reset__", "deepseek", "claude"]);
        expect(saved.expandedProviders).toMatchObject({ __upcoming_reset__: true });
    });

    it("t041: threshold null → upcoming reset card not rendered", async () => {
        const future = Date.now() + 3 * 24 * 60 * 60 * 1000;
        plugin_list.mockResolvedValue([
            connectorInfo({
                source: "gateway",
                sourceInstanceId: "cpa-main",
                supportedProviders: ["claude"],
                activeProviders: ["claude"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [
                        {
                            id: "claude-pro",
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
                            resetAt: future,
                            cycleDurationMs: 7 * 24 * 60 * 60 * 1000,
                            observedAt: 1735689600000,
                            stale: false,
                            status: "normal",
                        },
                    ],
                },
            }),
        ]);
        window.usageboard.config.get = vi.fn().mockResolvedValue({
            config: {
                schemaVersion: 1,
                language: "zh-Hans",
                plugins: [],
                launchAtLogin: false,
                upcomingResetThresholdPercent: null,
            },
            hasSecrets: {},
        });

        render(<PopupView />);

        await screen.findByRole("button", { name: /^Claude$/ });

        // Threshold null leaves the provider overview grid unchanged but omits the reset card.
        expect(document.querySelectorAll(".overview-grid").length).toBeGreaterThan(0);
        expect(document.querySelectorAll('[data-card-id="__upcoming_reset__"]')).toHaveLength(0);
        expect(screen.queryByText(/即将重置/)).toBeNull();
    });

    it("does not save config on mount when persisted UI state already exists (t153)", async () => {
        config_get.mockResolvedValue({
            config: {
                ...base_popup_config,
                providerOrder: ["claude", "deepseek"],
                collapsedAccounts: {},
                expandedProviders: { deepseek: true },
            },
            hasSecrets: {},
        });

        render(<PopupView />);

        await waitFor(() => {
            expect(screen.getByRole("button", { name: /总览/ })).toBeInTheDocument();
        });
        // Flush the save queue: any persist effect that fired would have
        // chained config.get → config.save by now.
        await act(async () => {
            await Promise.resolve();
        });

        expect(config_save).not.toHaveBeenCalled();
    });

    it("ignores config broadcasts that change nothing relevant (t153)", async () => {
        let broadcast: ((config: AppConfiguration) => void) | undefined;
        on_config_change.mockImplementation((callback: (config: AppConfiguration) => void) => {
            broadcast = callback;
            return vi.fn();
        });

        render(<PopupView />);

        await waitFor(() => {
            expect(screen.getByRole("button", { name: /总览/ })).toBeInTheDocument();
        });
        const list_calls = plugin_list.mock.calls.length;

        // IPC broadcasts arrive deserialized — a fresh object every time.
        const echo = JSON.parse(JSON.stringify(base_popup_config)) as AppConfiguration;
        act(() => {
            broadcast?.(echo);
        });
        await act(async () => {
            await Promise.resolve();
        });

        expect(plugin_list.mock.calls.length).toBe(list_calls);
        expect(config_save).not.toHaveBeenCalled();
    });

    it("reloads plugins when a broadcast changes plugin structure (t153)", async () => {
        let broadcast: ((config: AppConfiguration) => void) | undefined;
        on_config_change.mockImplementation((callback: (config: AppConfiguration) => void) => {
            broadcast = callback;
            return vi.fn();
        });

        render(<PopupView />);

        await waitFor(() => {
            expect(screen.getByRole("button", { name: /总览/ })).toBeInTheDocument();
        });
        const list_calls = plugin_list.mock.calls.length;

        act(() => {
            broadcast?.({
                ...base_popup_config,
                plugins: [
                    {
                        instanceId: "p1",
                        stateId: "p1",
                        name: "deepseek",
                        enabled: true,
                        executablePath: "connectors/deepseek/connector.ts",
                        refreshIntervalSeconds: 300,
                        parameterValues: {},
                        endpointOverrides: {},
                    },
                ],
            });
        });

        await waitFor(() => {
            expect(plugin_list.mock.calls.length).toBeGreaterThan(list_calls);
        });
    });
});

describe("record_bool_equal", () => {
    it("returns true for identical records", () => {
        expect(record_bool_equal({ a: true, b: false }, { a: true, b: false })).toBe(true);
    });

    it("returns true when key order differs", () => {
        expect(record_bool_equal({ a: true, b: false }, { b: false, a: true })).toBe(true);
    });

    it("returns false when values differ", () => {
        expect(record_bool_equal({ a: true }, { a: false })).toBe(false);
    });

    it("returns false when key counts differ", () => {
        expect(record_bool_equal({ a: true }, { a: true, b: false })).toBe(false);
    });

    it("returns true for empty records", () => {
        expect(record_bool_equal({}, {})).toBe(true);
    });
});
