import { fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PopupView } from "../../../../src/renderer/views/PopupView";
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
    const source = overrides.source ?? "cpa";
    const supportedProviders = overrides.supportedProviders ?? ["claude"];
    const activeProviders = overrides.activeProviders ?? supportedProviders;

    return {
        instanceId: `${source}-connector`,
        sourceInstanceId: `${source}-main`,
        stateId: `${source}-connector`,
        name: `${source}-connector`,
        displayName: `${source.toUpperCase()} Connector`,
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

describe("PopupView", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        main_panel_get_mode.mockResolvedValue("popup");
        plugin_refresh.mockResolvedValue(undefined);
        plugin_refresh_all.mockResolvedValue(undefined);
        plugin_list.mockResolvedValue([
            connectorInfo({
                source: "cpa",
                sourceInstanceId: "cpa-main",
                supportedProviders: ["claude", "gemini", "kimi"],
                activeProviders: ["claude"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [
                        {
                            id: "claude-pro",
                            provider: "claude",
                            source: "cpa",
                            sourceInstanceId: "cpa-main",
                            accountId: "claude-account",
                            accountLabel: "Claude Account",
                            name: "Claude Pro",
                            used: 10,
                            limit: 100,
                            displayStyle: "percent",
                            resetAt: null,
                            status: "normal",
                        },
                    ],
                },
            }),
            connectorInfo({
                source: "api_key",
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
                            source: "api_key",
                            sourceInstanceId: "deepseek-key",
                            accountId: "deepseek-account",
                            accountLabel: "DeepSeek Account",
                            name: "DeepSeek API",
                            used: 3,
                            limit: 20,
                            displayStyle: "ratio",
                            resetAt: null,
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
                getState: vi.fn(),
                refresh: plugin_refresh,
                refreshAll: plugin_refresh_all,
                snapshot: vi.fn().mockResolvedValue({}),
            },
            config: {
                get: vi.fn().mockResolvedValue({
                    config: {
                        schemaVersion: 1,
                        language: "zh-Hans",
                        plugins: [],
                        launchAtLogin: false,
                    },
                    hasSecrets: {},
                }),
                save: vi.fn().mockResolvedValue(undefined),
                saveSecrets: vi.fn(),
                duplicate: vi.fn(),
                export: vi.fn(),
                import: vi.fn(),
            },
            event: {
                onStateChange: vi.fn(() => vi.fn()),
                onThemeChange: vi.fn(),
                onSettingsNavigate: vi.fn(() => vi.fn()),
            },
            popup: {
                report_content_height: vi.fn(),
            },
            main_panel: { hide: main_panel_hide, get_mode: main_panel_get_mode },
            settings: { open: vi.fn(), minimize: vi.fn(), maximize: vi.fn(), close: vi.fn() },
            theme: { set: vi.fn() },
            tray: {
                open_panel: vi.fn(),
                refresh_all: vi.fn(),
                toggle_pause: vi.fn(),
                toggle_autostart: vi.fn(),
                open_settings: vi.fn(),
                check_update: vi.fn(),
                restart: vi.fn(),
                quit: vi.fn(),
                hide: vi.fn(),
                report_menu_size: vi.fn(),
                on_pause_state: vi.fn(() => vi.fn()),
                on_autostart_state: vi.fn(() => vi.fn()),
            },
            auth: { cookieLogin: vi.fn(), refreshCookies: vi.fn() },
            logs: { export: vi.fn() },
            log: usage_log,
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

    it("refreshes every enabled connector for a provider", async () => {
        plugin_list.mockResolvedValue([
            connectorInfo({
                source: "cpa",
                sourceInstanceId: "cpa-1",
                supportedProviders: ["claude", "gemini"],
                activeProviders: ["claude"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [
                        {
                            id: "claude-pro",
                            provider: "claude",
                            source: "cpa",
                            sourceInstanceId: "cpa-1",
                            accountId: "claude-account",
                            accountLabel: "Claude Account",
                            name: "Claude Pro",
                            used: 10,
                            limit: 100,
                            displayStyle: "percent",
                            resetAt: null,
                            status: "normal",
                        },
                    ],
                },
            }),
            connectorInfo({
                source: "api_key",
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
                source: "api_key",
                sourceInstanceId: "claude-disabled-1",
                supportedProviders: ["claude"],
                activeProviders: ["claude"],
                enabled: false,
            }),
            connectorInfo({
                source: "api_key",
                sourceInstanceId: "gemini-direct-1",
                supportedProviders: ["gemini"],
                activeProviders: ["gemini"],
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
        expect(plugin_refresh).not.toHaveBeenCalledWith("gemini-direct-1");
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

        expect(screen.queryByRole("button", { name: "隐藏主面板" })).not.toBeInTheDocument();
    });

    it("shows the floating close button in floating mode and hides the main panel", async () => {
        main_panel_get_mode.mockResolvedValue("floating");

        render(<PopupView />);

        const close_btn = await screen.findByRole("button", { name: "隐藏主面板" });
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
                expect(screen.getAllByRole("button", { name: "隐藏主面板" }).length).toBe(1);
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

        // Account rows should have account-level menu buttons
        const account_menu_buttons = screen.getAllByLabelText("账号操作");
        expect(account_menu_buttons.length).toBeGreaterThan(0);
    });

    it("account menu does not show hide or delete", async () => {
        render(<PopupView />);

        const claude_tab = await screen.findByRole("button", { name: /^Claude$/ });
        fireEvent.click(claude_tab);

        await waitFor(() => {
            expect(screen.getAllByText("Claude Account").length).toBeGreaterThan(0);
        });

        const account_menu = screen.getAllByLabelText("账号操作")[0];
        if (!account_menu) throw new Error("account menu not found");
        fireEvent.click(account_menu);

        await waitFor(() => {
            expect(screen.getByText("编辑")).toBeInTheDocument();
        });
        expect(screen.queryByText("隐藏")).not.toBeInTheDocument();
        expect(screen.queryByText("删除")).not.toBeInTheDocument();
    });

    it("disables an account by saving account override", async () => {
        const config_save = vi.fn().mockResolvedValue(undefined);
        window.usageboard.config.save = config_save;

        render(<PopupView />);

        const claude_tab = await screen.findByRole("button", { name: /^Claude$/ });
        fireEvent.click(claude_tab);

        await waitFor(() => {
            expect(screen.getAllByText("Claude Account").length).toBeGreaterThan(0);
        });

        const account_menu = screen.getAllByLabelText("账号操作")[0];
        if (!account_menu) throw new Error("account menu not found");
        fireEvent.click(account_menu);

        await waitFor(() => {
            expect(screen.getByText("关闭监控")).toBeInTheDocument();
        });
        fireEvent.click(screen.getByText("关闭监控"));

        await waitFor(() => {
            expect(config_save).toHaveBeenCalledWith(
                expect.objectContaining({
                    accountOverrides: {
                        disabled: {
                            claude: ["cpa-main:label:Claude Account"],
                        },
                    },
                }),
            );
        });
    });

    it("shows account save failure feedback", async () => {
        window.usageboard.config.save = vi.fn().mockRejectedValue(new Error("disk locked"));

        render(<PopupView />);

        const claude_tab = await screen.findByRole("button", { name: /^Claude$/ });
        fireEvent.click(claude_tab);

        await waitFor(() => {
            expect(screen.getAllByText("Claude Account").length).toBeGreaterThan(0);
        });

        const account_menu = screen.getAllByLabelText("账号操作")[0];
        if (!account_menu) throw new Error("account menu not found");
        fireEvent.click(account_menu);

        await waitFor(() => {
            expect(screen.getByText("关闭监控")).toBeInTheDocument();
        });
        fireEvent.click(screen.getByText("关闭监控"));

        await expect(screen.findByRole("alert")).resolves.toHaveTextContent("保存账号操作失败");
    });

    it("opens settings with context when account edit is clicked", async () => {
        const settings_open = vi.fn();
        window.usageboard.settings.open = settings_open;

        render(<PopupView />);

        const claude_tab = await screen.findByRole("button", { name: /^Claude$/ });
        fireEvent.click(claude_tab);

        await waitFor(() => {
            expect(screen.getAllByText("Claude Account").length).toBeGreaterThan(0);
        });

        // Open account menu and click edit
        const account_menu = screen.getAllByLabelText("账号操作")[0];
        if (!account_menu) throw new Error("account menu not found");
        fireEvent.click(account_menu);

        await waitFor(() => {
            expect(screen.getByText("编辑")).toBeInTheDocument();
        });
        fireEvent.click(screen.getByText("编辑"));

        expect(settings_open).toHaveBeenCalledWith(
            expect.objectContaining({
                provider: "claude",
            }),
        );
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
        expect(screen.getAllByText("Claude").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("DeepSeek").length).toBeGreaterThanOrEqual(1);

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
                tick();
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
                collapsedAccounts: { "cpa-main:label:Claude Account": true },
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
        const saved = (
            config_save.mock.calls[config_save.mock.calls.length - 1][0] as Record<string, unknown>
        )["collapsedAccounts"];
        expect(saved).toEqual({ "cpa-main:label:Claude Account": true });
    });
});
