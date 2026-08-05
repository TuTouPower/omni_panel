import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PopupView } from "../../../../src/renderer/views/PopupView";
import type { AppConfiguration } from "../../../../src/shared/types/config";

vi.mock("../../../../src/renderer/lib/theme", () => ({
    useTheme: () => undefined,
}));

import { connectorInfo, install_popup_usageboard, plugin_list } from "./popup_view_test_utils";

describe("PopupView", () => {
    beforeEach(() => {
        install_popup_usageboard();
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
                            metric_id: "claude:auth-a:5h",
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
                            metric_id: "claude:auth-b:5h",
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
                        metric_id: "claude:auth-a:5h",
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
});
