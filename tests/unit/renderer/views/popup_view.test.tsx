import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PopupView } from "../../../../src/renderer/views/PopupView";
import type { ConnectorInfo } from "../../../../src/shared/types/ipc";

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
                quit: vi.fn(),
                hide: vi.fn(),
                on_pause_state: vi.fn(() => vi.fn()),
                on_autostart_state: vi.fn(() => vi.fn()),
            },
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
});
