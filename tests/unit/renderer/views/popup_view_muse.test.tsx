import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PopupView } from "../../../../src/renderer/views/PopupView";

vi.mock("../../../../src/renderer/lib/theme", () => ({
    useTheme: () => undefined,
}));

import {
    base_popup_config,
    config_get,
    connectorInfo,
    install_popup_usageboard,
    plugin_list,
    plugin_refresh,
} from "./popup_view_test_utils";

describe("PopupView - Muse AI support", () => {
    beforeEach(() => {
        install_popup_usageboard();
    });

    it("displays Muse AI tab and renders usage bars when expanded", async () => {
        config_get.mockResolvedValue({
            config: {
                ...base_popup_config,
                plugins: [
                    {
                        instanceId: "muse-instance-1",
                        manifestId: "muse",
                        name: "Muse Free",
                        enabled: true,
                        parameters: {},
                    },
                ],
            },
            hasSecrets: {},
        });
        plugin_list.mockResolvedValue([
            connectorInfo({
                instanceId: "muse-instance-1",
                sourceInstanceId: "muse-instance-1",
                source: "session",
                supportedProviders: ["muse"],
                activeProviders: ["muse"],
                displayName: "Muse Free",
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-09-25T07:00:00Z",
                    items: [
                        {
                            id: "muse:weekly",
                            metric_id: "muse:weekly",
                            provider: "muse",
                            source: "session",
                            sourceInstanceId: "muse-instance-1",
                            accountId: "default",
                            accountLabel: "Muse 免费版",
                            raw_label: "weekly",
                            normalized_label: "每周限额",
                            used: 13,
                            limit: 100,
                            displayStyle: "percent",
                            resetAt: 1790757971000,
                            observedAt: 1790291329141,
                            stale: false,
                            status: "normal",
                        },
                        {
                            id: "muse:extra",
                            metric_id: "muse:extra",
                            provider: "muse",
                            source: "session",
                            sourceInstanceId: "muse-instance-1",
                            accountId: "default",
                            accountLabel: "Muse 免费版",
                            raw_label: "extra",
                            normalized_label: "额外额度",
                            used: 0,
                            limit: 100,
                            displayStyle: "percent",
                            resetAt: null,
                            observedAt: 1790291329141,
                            stale: false,
                            status: "normal",
                        },
                    ],
                },
            }),
        ]);

        render(<PopupView />);

        // 1. 验证顶部 Tab 栏出现 "Muse AI"
        const museTab = await screen.findByRole("button", { name: "Muse AI" });
        expect(museTab).toBeInTheDocument();

        // 2. 点击展开 Muse 卡片
        const expandBtn = await screen.findByRole("button", { name: "展开" });
        fireEvent.click(expandBtn);

        // 3. 验证展开后渲染用量条与百分比
        await waitFor(() => {
            expect(screen.getByText("每周限额")).toBeInTheDocument();
            expect(screen.getByText("额外额度")).toBeInTheDocument();
            expect(screen.getByText("13%")).toBeInTheDocument();
            expect(screen.getByText("0%")).toBeInTheDocument();
        });

        // 4. 点击卡片上的刷新按钮，触发刷新
        const refreshBtn = screen.getByRole("button", { name: "刷新 Muse AI" });
        fireEvent.click(refreshBtn);
        expect(plugin_refresh).toHaveBeenCalledWith("muse-instance-1");
    });

    it("surfaces re-login button when Muse session fails with auth error", async () => {
        config_get.mockResolvedValue({
            config: {
                ...base_popup_config,
                plugins: [
                    {
                        instanceId: "muse-instance-1",
                        manifestId: "muse",
                        name: "Muse Free",
                        enabled: true,
                        parameters: {},
                    },
                ],
            },
            hasSecrets: {},
        });
        plugin_list.mockResolvedValue([
            connectorInfo({
                instanceId: "muse-instance-1",
                source: "session",
                supportedProviders: ["muse"],
                activeProviders: ["muse"],
                displayName: "Muse Free",
                snapshot: {
                    status: "failed",
                    updatedAt: "2026-09-25T07:00:00Z",
                    error: "Muse 会话已失效，请重新登录",
                    items: [],
                },
            }),
        ]);

        render(<PopupView />);

        // 验证失败态下卡片显示重新登录按钮
        await waitFor(() => {
            expect(screen.getByRole("button", { name: "重新登录" })).toBeInTheDocument();
        });
    });
});
