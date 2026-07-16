import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProviderAccountRow } from "../../../../src/renderer/components/ProviderAccountRow";
import type { ProviderUsageAccount } from "../../../../src/renderer/lib/provider-usage";

function make_account(overrides: Partial<ProviderUsageAccount> = {}): ProviderUsageAccount {
    return {
        id: "cpa-main:label:Account A",
        sourceInstanceId: "cpa-main",
        accountId: "auth-a",
        accountLabel: "Account A",
        status: "normal",
        updatedAt: "2026-01-01T12:00:00Z",
        observedAt: 1735689600000,
        stale: false,
        periods: [
            {
                id: "claude-a-5h",
                provider: "claude",
                source: "gateway",
                sourceInstanceId: "cpa-main",
                connectorInstanceId: "cpa-connector",
                connectorDisplayName: "CPA",
                accountId: "auth-a",
                accountLabel: "Account A",
                raw_label: "5h",
                name: "Claude Pro · 5小时",
                used: 10,
                limit: 100,
                displayStyle: "percent",
                resetAt: null,
                status: "normal",
                updatedAt: "2026-01-01T12:00:00Z",
                observedAt: 1735689600000,
                stale: false,
            },
        ],
        ...overrides,
    };
}

describe("ProviderAccountRow", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("shows update time instead of period count", () => {
        const { container } = render(<ProviderAccountRow account={make_account()} />);

        expect(screen.queryByText(/个周期/)).not.toBeInTheDocument();
        expect(container.querySelector(".rel-time")?.textContent).not.toBe("");
    });

    it("does not show account menu (edit removed from main panel)", () => {
        render(<ProviderAccountRow account={make_account()} />);

        expect(screen.queryByLabelText("账号操作")).not.toBeInTheDocument();
        expect(screen.queryByText("编辑")).not.toBeInTheDocument();
    });

    it("marks stale accounts", () => {
        const { container } = render(
            <ProviderAccountRow account={make_account({ stale: true })} />,
        );

        expect(screen.getByText("已过期")).toBeInTheDocument();
        expect(container.querySelector(".card.stale")).toBeInTheDocument();
    });

    it("hides account label when desensitizeRemarks is on", () => {
        render(<ProviderAccountRow account={make_account()} desensitizeRemarks />);
        expect(screen.queryByText("Account A")).not.toBeInTheDocument();
    });

    it("card has .card class and no status-specific class when critical", () => {
        const account = make_account({
            status: "critical",
        });
        const { container } = render(<ProviderAccountRow account={account} />);
        expect(container.querySelector(".card")).toBeInTheDocument();
        expect(container.querySelector(".card--critical")).not.toBeInTheDocument();
    });
});
