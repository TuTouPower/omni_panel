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

    // p143: STATE_BASE 的灰色 text-[var(--color-on-surface-variant)] 后声明胜出，
    // 覆盖裸拼接的 text-[var(--color-error)]（t274 回归）。err 分支最终色必须是 error。
    it("AC-001: failed provider state text resolves to --color-error, not the STATE_BASE grey", () => {
        render(
            <ProviderCard
                provider="deepseek"
                connectorError={{ displayName: "DeepSeek", error: "网络超时", instanceIds: [] }}
            />,
        );
        const err = screen.getByTestId("card-state");
        expect(err).toHaveAttribute("data-variant", "err");
        const cls = err.getAttribute("class") ?? "";
        // error 类必须在最终类中生效
        expect(cls).toMatch(/text-\[var\(--color-error\)\]/);
        // STATE_BASE 灰色类不得残留（否则 tailwind-merge 后仍可能被后声明覆盖）
        expect(cls).not.toMatch(/text-\[var\(--color-on-surface-variant\)\]/);
    });

    // p143: 同机制，ProviderCardErrorBanner（缓存数据上方横幅）err 分支同样被灰覆盖。
    it("AC-002: error banner text resolves to --color-error, not the STATE_BASE grey", () => {
        render(
            <ProviderCard
                provider="deepseek"
                group={makeGroup()}
                connectorError={{ displayName: "DeepSeek", error: "网络超时", instanceIds: [] }}
            />,
        );
        const banner = screen.getByText(/采集失败：/);
        const err = banner.closest("[data-testid='card-state']");
        expect(err).not.toBeNull();
        expect(err).toHaveAttribute("data-variant", "err");
        const cls = (err as HTMLElement).getAttribute("class") ?? "";
        expect(cls).toMatch(/text-\[var\(--color-error\)\]/);
        expect(cls).not.toMatch(/text-\[var\(--color-on-surface-variant\)\]/);
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
