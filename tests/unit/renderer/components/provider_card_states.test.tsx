import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ProviderCard } from "../../../../src/renderer/components/ProviderCard";
import { makeGroup, setupWindowUsageboard } from "./provider_card_fixture";

vi.mock("../../../../src/renderer/lib/theme", () => ({
    useTheme: () => undefined,
}));

describe("ProviderCard - states", () => {
    beforeEach(() => {
        setupWindowUsageboard();
    });

    it("shows auth error with login action", () => {
        render(
            <ProviderCard
                provider="deepseek"
                connectorError={{
                    displayName: "DeepSeek",
                    error: "unauthorized access",
                    instanceIds: [],
                }}
            />,
        );
        expect(screen.getByText("凭证失效，请重新登录")).toBeInTheDocument();
        expect(screen.getByText("重新登录")).toBeInTheDocument();
    });

    // t158: provider-level re-login button now passes both provider AND the
    // instanceId of the failed connector so multi-instance setups open the
    // failing account (not the first match by provider).
    it("calls onReLogin with (provider, instanceId) when provider-level reconnect clicked", () => {
        const onReLogin = vi.fn();
        render(
            <ProviderCard
                provider="grok"
                connectorError={{
                    displayName: "Grok",
                    error: "401 invalid_token",
                    instanceIds: ["grok-uuid-A"],
                }}
                onReLogin={onReLogin}
            />,
        );
        fireEvent.click(screen.getByText("重新登录"));
        expect(onReLogin).toHaveBeenCalledTimes(1);
        expect(onReLogin).toHaveBeenCalledWith("grok", "grok-uuid-A");
    });

    it("passes first instanceId when multiple failed share provider (overview fallback)", () => {
        const onReLogin = vi.fn();
        render(
            <ProviderCard
                provider="grok"
                connectorError={{
                    displayName: "Grok",
                    error: "HTTP 401 unauthorized token invalid",
                    instanceIds: ["uuid-A", "grok-ts-B"],
                }}
                onReLogin={onReLogin}
            />,
        );
        fireEvent.click(screen.getByText("重新登录"));
        // First instance preferred; per-row re-login covers the rest.
        expect(onReLogin).toHaveBeenCalledWith("grok", "uuid-A");
    });

    it("shows network error with retry action", () => {
        const onRefresh = vi.fn();
        render(
            <ProviderCard
                provider="deepseek"
                connectorError={{ displayName: "DeepSeek", error: "网络超时", instanceIds: [] }}
                onRefresh={onRefresh}
            />,
        );
        expect(screen.getByText("网络超时")).toBeInTheDocument();
        fireEvent.click(screen.getByText("重试"));
        expect(onRefresh).toHaveBeenCalledWith("deepseek");
    });

    it("failed provider card is collapsible even without accounts", () => {
        const onToggleExpand = vi.fn();
        render(
            <ProviderCard
                provider="minimax"
                connectorError={{
                    error: "NETWORK_ERROR",
                    displayName: "MiniMax",
                    instanceIds: [],
                }}
                onToggleExpand={onToggleExpand}
                expanded={false}
            />,
        );
        const toggle = screen.getByLabelText("展开");
        expect(toggle).toBeInTheDocument();
        fireEvent.click(toggle);
        expect(onToggleExpand).toHaveBeenCalledWith("minimax");
    });

    it("failed provider card with accounts is collapsible", () => {
        const onToggleExpand = vi.fn();
        const group = makeGroup({
            provider: "minimax",
            label: "MiniMax",
            status: "critical",
            accounts: [
                {
                    id: "acc-mm",
                    sourceInstanceId: "mm-1",
                    accountId: "acc-mm",
                    accountLabel: "MiniMax Account",
                    status: "critical",
                    updatedAt: "2026-06-02T10:00:00Z",
                    observedAt: 1748858400000,
                    stale: false,
                    periods: [],
                },
            ],
            accountCount: 1,
        });
        render(
            <ProviderCard
                provider="minimax"
                group={group}
                connectorError={{ error: "NETWORK_ERROR", displayName: "MiniMax", instanceIds: [] }}
                onToggleExpand={onToggleExpand}
                expanded={false}
            />,
        );
        const toggle = screen.getByLabelText("展开");
        expect(toggle).toBeInTheDocument();
    });

    it("non-collapsible card renders no collapse chevron", () => {
        // No onToggleExpand → can_collapse false → no dead toggle button.
        render(
            <ProviderCard
                provider="deepseek"
                group={makeGroup()}
                connectorError={{ displayName: "DeepSeek", error: "网络超时", instanceIds: [] }}
            />,
        );
        expect(screen.queryByLabelText("折叠")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("展开")).not.toBeInTheDocument();
    });

    it("has no collapse chevron when a toggle handler exists but the card has no accounts or failure (popup live branch)", () => {
        // The popup always passes onToggleExpand (PopupView live tree); the dead
        // chevron came from hasAccounts/isFailed being false while children still
        // rendered. This pins the real regression branch from popup_window_constraints.
        const onToggleExpand = vi.fn();
        render(
            <ProviderCard
                provider="deepseek"
                group={makeGroup({ accounts: [], accountCount: 0, periods: [] })}
                onToggleExpand={onToggleExpand}
                expanded={false}
            />,
        );
        expect(screen.queryByLabelText("折叠")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("展开")).not.toBeInTheDocument();
    });

    it("shows the error banner alongside cached usage when a connector failed but has data (has_stale_error)", () => {
        render(
            <ProviderCard
                provider="deepseek"
                group={makeGroup()}
                connectorError={{ displayName: "DeepSeek", error: "网络超时", instanceIds: [] }}
            />,
        );
        // stale styling on the card
        expect(document.querySelector(".card.stale")).not.toBeInTheDocument();
        // error banner text
        expect(screen.getByText(/网络超时/)).toBeInTheDocument();
        // cached usage still rendered (not the empty state)
        expect(screen.queryByText(/暂无/)).not.toBeInTheDocument();
        // NOT the auth-failure path (re-login) since data exists
        expect(screen.queryByText(/重新登录/)).not.toBeInTheDocument();
    });
});
