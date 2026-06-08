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
        periods: [
            {
                id: "claude-a-5h",
                provider: "claude",
                source: "cpa",
                sourceInstanceId: "cpa-main",
                connectorInstanceId: "cpa-connector",
                connectorDisplayName: "CPA",
                accountId: "auth-a",
                accountLabel: "Account A",
                name: "Claude Pro · 5小时",
                used: 10,
                limit: 100,
                displayStyle: "percent",
                status: "normal",
                updatedAt: "2026-01-01T12:00:00Z",
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

    it("shows account menu button when handlers are provided", () => {
        render(
            <ProviderAccountRow
                account={make_account()}
                onEditAccount={vi.fn()}
                onDisableAccount={vi.fn()}
            />,
        );

        expect(screen.getByLabelText("账号操作")).toBeInTheDocument();
    });

    it("shows edit and disable in the menu", async () => {
        render(
            <ProviderAccountRow
                account={make_account()}
                onEditAccount={vi.fn()}
                onDisableAccount={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByLabelText("账号操作"));

        await waitFor(() => {
            expect(screen.getByText("编辑")).toBeInTheDocument();
        });
        expect(screen.getByText("关闭监控")).toBeInTheDocument();
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

    it("calls onDisableAccount when disable is clicked", async () => {
        const on_disable = vi.fn();
        const account = make_account();

        render(
            <ProviderAccountRow
                account={account}
                onEditAccount={vi.fn()}
                onDisableAccount={on_disable}
            />,
        );

        fireEvent.click(screen.getByLabelText("账号操作"));

        await waitFor(() => {
            expect(screen.getByText("关闭监控")).toBeInTheDocument();
        });
        fireEvent.click(screen.getByText("关闭监控"));

        expect(on_disable).toHaveBeenCalledWith(account);
    });

    it("clicking menu does not trigger collapse toggle", () => {
        const on_toggle = vi.fn();

        render(
            <ProviderAccountRow
                account={make_account()}
                collapsed={false}
                onToggleCollapsed={on_toggle}
                onEditAccount={vi.fn()}
                onDisableAccount={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByLabelText("账号操作"));

        expect(on_toggle).not.toHaveBeenCalled();
    });

    it("does not add alert class when account status is critical", () => {
        const account = make_account({
            status: "critical",
            periods: [
                {
                    id: "claude-a-5h",
                    provider: "claude" as const,
                    source: "cpa" as const,
                    sourceInstanceId: "cpa-main",
                    connectorInstanceId: "cpa-connector",
                    connectorDisplayName: "CPA",
                    accountId: "auth-a",
                    accountLabel: "Account A",
                    name: "Claude Pro · 5小时",
                    used: 95,
                    limit: 100,
                    displayStyle: "percent" as const,
                    status: "critical" as const,
                    updatedAt: "2026-01-01T12:00:00Z",
                },
            ],
        });
        const { container } = render(<ProviderAccountRow account={account} />);
        const card = container.querySelector(".card");
        if (!card) throw new Error("missing .card");
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
