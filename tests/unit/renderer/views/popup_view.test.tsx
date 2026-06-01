import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PopupView } from "../../../../src/renderer/views/PopupView";
import type { ConnectorInfo } from "../../../../src/shared/types/ipc";

vi.mock("../../../../src/renderer/lib/theme", () => ({
    useTheme: () => undefined,
}));

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
const usage_log = vi.fn<(payload: { level: string; module: string; message: string }) => void>();

describe("PopupView", () => {
    beforeEach(() => {
        vi.clearAllMocks();
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
                get: vi.fn(),
                save: vi.fn(),
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
});
