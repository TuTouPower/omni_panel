import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PopupView } from "../../../../src/renderer/views/PopupView";

vi.mock("../../../../src/renderer/lib/theme", () => ({
    useTheme: () => undefined,
}));

import { connectorInfo, install_popup_usageboard, plugin_list } from "./popup_view_test_utils";

describe("PopupView", () => {
    beforeEach(() => {
        install_popup_usageboard();
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
                            metric_id: "grok:grok-new:monthly",
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
});
