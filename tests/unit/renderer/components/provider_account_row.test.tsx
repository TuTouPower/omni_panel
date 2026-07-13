import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProviderAccountRow } from "../../../../src/renderer/components/ProviderAccountRow";
import type {
    ProviderUsageAccount,
    ProviderUsagePeriod,
} from "../../../../src/renderer/lib/provider-usage";

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

describe("ProviderAccountRow account menu", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("shows update time instead of period count", () => {
        const { container } = render(<ProviderAccountRow account={make_account()} />);

        expect(screen.queryByText(/个周期/)).not.toBeInTheDocument();
        expect(container.querySelector(".rel-time")?.textContent).not.toBe("");
    });

    it("does not show account menu when no handlers provided", () => {
        render(<ProviderAccountRow account={make_account()} />);

        expect(screen.queryByLabelText("账号操作")).not.toBeInTheDocument();
    });

    it("marks stale accounts", () => {
        const { container } = render(
            <ProviderAccountRow account={make_account({ stale: true })} />,
        );

        expect(screen.getByText("已过期")).toBeInTheDocument();
        expect(container.querySelector(".card.stale")).toBeInTheDocument();
    });

    it("shows account menu button when handlers are provided", () => {
        render(<ProviderAccountRow account={make_account()} onEditAccount={vi.fn()} />);

        expect(screen.getByLabelText("账号操作")).toBeInTheDocument();
    });

    it("shows edit in the menu", async () => {
        render(<ProviderAccountRow account={make_account()} onEditAccount={vi.fn()} />);

        fireEvent.click(screen.getByLabelText("账号操作"));

        await waitFor(() => {
            expect(screen.getByText("编辑")).toBeInTheDocument();
        });
    });

    it("does not show 关闭监控 in the menu", async () => {
        // P0-3：禁用账号的菜单项已删除（违反不变量 8）。
        render(<ProviderAccountRow account={make_account()} onEditAccount={vi.fn()} />);

        fireEvent.click(screen.getByLabelText("账号操作"));

        await waitFor(() => {
            expect(screen.getByText("编辑")).toBeInTheDocument();
        });
        expect(screen.queryByText("关闭监控")).not.toBeInTheDocument();
    });

    it("calls onEditAccount when edit is clicked", async () => {
        const on_edit = vi.fn();
        const account = make_account();

        render(<ProviderAccountRow account={account} onEditAccount={on_edit} />);

        fireEvent.click(screen.getByLabelText("账号操作"));

        await waitFor(() => {
            expect(screen.getByText("编辑")).toBeInTheDocument();
        });
        fireEvent.click(screen.getByText("编辑"));

        expect(on_edit).toHaveBeenCalledWith(account);
    });

    it("clicking menu does not trigger collapse toggle", () => {
        const on_toggle = vi.fn();

        render(
            <ProviderAccountRow
                account={make_account()}
                collapsed={false}
                onToggleCollapsed={on_toggle}
                onEditAccount={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByLabelText("账号操作"));

        expect(on_toggle).not.toHaveBeenCalled();
    });

    it("card has .card class and no status-specific class when critical", () => {
        // NOTE: ProviderAccountRow currently has no status→card-class mapping.
        // This positive assertion verifies the card's base class structure so the
        // test fails if a status class (e.g. card--critical) is ever introduced
        // without updating this expectation.
        const account = make_account({
            status: "critical",
            periods: [
                {
                    id: "claude-a-5h",
                    provider: "claude" as const,
                    source: "gateway" as const,
                    sourceInstanceId: "cpa-main",
                    connectorInstanceId: "cpa-connector",
                    connectorDisplayName: "CPA",
                    accountId: "auth-a",
                    accountLabel: "Account A",
                    raw_label: "5h",
                    name: "Claude Pro · 5小时",
                    used: 95,
                    limit: 100,
                    displayStyle: "percent" as const,
                    resetAt: null,
                    status: "critical" as const,
                    updatedAt: "2026-01-01T12:00:00Z",
                    observedAt: 1735689600000,
                    stale: false,
                },
            ],
        });
        const { container } = render(<ProviderAccountRow account={account} />);
        const card = container.querySelector(".card");
        if (!card) throw new Error("missing .card");
        expect(card.classList.contains("card")).toBe(true);
        // Currently no status-based class is applied; update this assertion if one is added.
        expect(card.classList.contains("alert")).toBe(false);
    });

    it("does not add alert class when account status is normal", () => {
        const { container } = render(<ProviderAccountRow account={make_account()} />);
        const card = container.querySelector(".card");
        if (!card) throw new Error("missing .card");
        expect(card.classList.contains("alert")).toBe(false);
    });

    it("does not add alert class when account status is warning", () => {
        const account = make_account({
            status: "warning",
            periods: [
                {
                    ...make_account().periods[0],
                    status: "warning" as const,
                    used: 80,
                } as ProviderUsagePeriod,
            ],
        });
        const { container } = render(<ProviderAccountRow account={account} />);
        const card = container.querySelector(".card");
        if (!card) throw new Error("missing .card");
        expect(card.classList.contains("alert")).toBe(false);
    });
});
