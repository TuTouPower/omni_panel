import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PopupView } from "../../../../src/renderer/views/PopupView";
import type { AppConfiguration } from "../../../../src/shared/types/config";

vi.mock("../../../../src/renderer/lib/theme", () => ({
    useTheme: () => undefined,
}));

import {
    config_get,
    config_save,
    connectorInfo,
    install_popup_usageboard,
    plugin_list,
} from "./popup_view_test_utils";

/** 500ms 防抖（config-debounce 默认）。 */
const DEBOUNCE_MS = 500;

/** 等待防抖窗口过去（真实 timers）。 */
async function wait_debounce(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS + 100));
}

function claude_plugin() {
    return connectorInfo({
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
    });
}

/**
 * t250：用量面板持久化。
 * - AC1：providerL2Open「概览/N账号」切换写回 + 挂载恢复。
 * - AC2：activeUsageTab 页签切换写回 + 挂载恢复（含 config 无键首次写盘）。
 * - AC4：外部 CONFIG_CHANGED 回显不误写覆盖。
 * - f004：折叠卡片复位 l2Open。
 */
describe("PopupView 持久化 (t250)", () => {
    beforeEach(() => {
        install_popup_usageboard();
        plugin_list.mockResolvedValue([claude_plugin()]);
    });

    it("AC2：config.activeUsageTab 指定页签时挂载后恢复该页签", async () => {
        const cfg: AppConfiguration = {
            schemaVersion: 1,
            language: "zh-Hans",
            plugins: [],
            launchAtLogin: false,
            activeUsageTab: "claude",
        };
        config_get.mockResolvedValue({ config: cfg, hasSecrets: {} });

        render(<PopupView />);
        await waitFor(() => {
            expect(config_get).toHaveBeenCalled();
        });
        // activeTab !== overview 分支显示该 provider 卡片。
        await waitFor(() => {
            expect(screen.getByText("Claude")).toBeInTheDocument();
        });
    });

    it("AC2：config 无 activeUsageTab 时用户切换页签后写回 config", async () => {
        config_save.mockClear();
        render(<PopupView />);
        await screen.findByText("总览");

        // 点 claude 页签（ProviderNav data-tab 按钮）。
        act(() => {
            fireEvent.click(screen.getByRole("button", { name: "Claude" }));
        });
        await wait_debounce();

        // 用户切换触发写回。
        expect(config_save).toHaveBeenCalledWith(
            expect.objectContaining({ activeUsageTab: "claude" }),
        );
    });

    it("AC1：config.providerL2Open 恢复多账号卡片明细 + 切换写回", async () => {
        // 多账号 provider（2 accounts 触发 l2seg）。
        const multi = connectorInfo({
            source: "gateway",
            sourceInstanceId: "multi",
            supportedProviders: ["kimi"],
            activeProviders: ["kimi"],
            snapshot: {
                status: "ready",
                updatedAt: "2026-01-01T12:00:00Z",
                items: [
                    {
                        id: "k1",
                        metric_id: "kimi:a1:tokens",
                        provider: "kimi",
                        source: "gateway",
                        sourceInstanceId: "multi",
                        accountId: "a1",
                        accountLabel: "Account 1",
                        raw_label: "k1",
                        normalized_label: "K1",
                        used: 10,
                        limit: 100,
                        displayStyle: "percent",
                        resetAt: null,
                        observedAt: 1735689600000,
                        stale: false,
                        status: "normal",
                    },
                    {
                        id: "k2",
                        metric_id: "kimi:a2:tokens",
                        provider: "kimi",
                        source: "gateway",
                        sourceInstanceId: "multi",
                        accountId: "a2",
                        accountLabel: "Account 2",
                        raw_label: "k2",
                        normalized_label: "K2",
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
        });
        plugin_list.mockResolvedValue([multi]);
        const cfg: AppConfiguration = {
            schemaVersion: 1,
            language: "zh-Hans",
            plugins: [],
            launchAtLogin: false,
            providerL2Open: { kimi: true },
            expandedProviders: { kimi: true },
        };
        config_get.mockResolvedValue({ config: cfg, hasSecrets: {} });

        render(<PopupView />);
        // 挂载恢复：kimi 卡片显示明细（Account 1/2）。
        await waitFor(() => {
            expect(screen.getByText("Account 1")).toBeInTheDocument();
        });

        // 切回概览 → 写回 providerL2Open.kimi=false。
        config_save.mockClear();
        act(() => {
            fireEvent.click(screen.getByTitle("概览"));
        });
        await wait_debounce();
        expect(config_save).toHaveBeenCalledWith(
            expect.objectContaining({ providerL2Open: { kimi: false } }),
        );
    });

    it("AC4：外部 CONFIG_CHANGED 回显 activeUsageTab 不触发 config.save（不误写）", async () => {
        let on_config_change_cb: ((config: AppConfiguration) => void) | undefined;
        window.usageboard.event.onConfigChange = vi.fn((cb: (config: AppConfiguration) => void) => {
            on_config_change_cb = cb;
            return vi.fn();
        });
        config_save.mockClear();
        render(<PopupView />);
        await screen.findByText("总览");

        const incoming: AppConfiguration = {
            schemaVersion: 1,
            language: "zh-Hans",
            plugins: [],
            launchAtLogin: false,
            activeUsageTab: "claude",
        };
        act(() => {
            on_config_change_cb?.(incoming);
        });
        await wait_debounce();

        // 回显被 prev ref 值相等抑制，即使防抖到期也不写回。
        expect(config_save).not.toHaveBeenCalled();
    });

    it("f004：折叠 provider 卡片复位 l2Open 为概览", async () => {
        // 多账号 provider + providerL2Open 初始 true。
        const multi = connectorInfo({
            source: "gateway",
            sourceInstanceId: "multi",
            supportedProviders: ["kimi"],
            activeProviders: ["kimi"],
            snapshot: {
                status: "ready",
                updatedAt: "2026-01-01T12:00:00Z",
                items: [
                    {
                        id: "k1",
                        metric_id: "kimi:a1:tokens",
                        provider: "kimi",
                        source: "gateway",
                        sourceInstanceId: "multi",
                        accountId: "a1",
                        accountLabel: "Account 1",
                        raw_label: "k1",
                        normalized_label: "K1",
                        used: 10,
                        limit: 100,
                        displayStyle: "percent",
                        resetAt: null,
                        observedAt: 1735689600000,
                        stale: false,
                        status: "normal",
                    },
                    {
                        id: "k2",
                        metric_id: "kimi:a2:tokens",
                        provider: "kimi",
                        source: "gateway",
                        sourceInstanceId: "multi",
                        accountId: "a2",
                        accountLabel: "Account 2",
                        raw_label: "k2",
                        normalized_label: "K2",
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
        });
        plugin_list.mockResolvedValue([multi]);
        const cfg: AppConfiguration = {
            schemaVersion: 1,
            language: "zh-Hans",
            plugins: [],
            launchAtLogin: false,
            providerL2Open: { kimi: true },
            expandedProviders: { kimi: true },
        };
        config_get.mockResolvedValue({ config: cfg, hasSecrets: {} });

        render(<PopupView />);
        await waitFor(() => {
            expect(screen.getByText("Account 1")).toBeInTheDocument();
        });

        // 折叠卡片：点展开按钮（collapse 图标）使 expanded=false。
        config_save.mockClear();
        act(() => {
            fireEvent.click(screen.getByTitle("折叠"));
        });
        await wait_debounce();

        // 折叠后明细隐藏，且写回 providerL2Open.kimi=false。
        expect(screen.queryByText("Account 1")).not.toBeInTheDocument();
        expect(config_save).toHaveBeenCalledWith(
            expect.objectContaining({ providerL2Open: { kimi: false } }),
        );
    });
});
