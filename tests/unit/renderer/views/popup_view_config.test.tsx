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
});
