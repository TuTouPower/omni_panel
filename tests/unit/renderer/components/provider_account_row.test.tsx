import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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

    it("does not show account menu when no handlers provided", () => {
        render(<ProviderAccountRow account={make_account()} />);

        expect(screen.queryByLabelText("账号操作")).not.toBeInTheDocument();
    });

    it("shows account menu button when handlers are provided", () => {
        render(
            <ProviderAccountRow
                account={make_account()}
                onEditAccount={vi.fn()}
                onHideOrDeleteAccount={vi.fn()}
                isCpaSource={true}
            />,
        );

        expect(screen.getByLabelText("账号操作")).toBeInTheDocument();
    });

    it("shows edit and hide for CPA source", async () => {
        render(
            <ProviderAccountRow
                account={make_account()}
                onEditAccount={vi.fn()}
                onHideOrDeleteAccount={vi.fn()}
                isCpaSource={true}
            />,
        );

        fireEvent.click(screen.getByLabelText("账号操作"));

        await waitFor(() => {
            expect(screen.getByText("编辑")).toBeInTheDocument();
        });
        expect(screen.getByText("隐藏")).toBeInTheDocument();
    });

    it("shows edit and delete for direct source", async () => {
        const [base_period] = make_account().periods;
        if (!base_period) throw new Error("missing base period");
        const direct_account = make_account({
            id: "deepseek:deepseek-account",
            sourceInstanceId: "deepseek",
            periods: [
                {
                    ...base_period,
                    source: "api_key",
                    sourceInstanceId: "deepseek",
                },
            ],
        });

        render(
            <ProviderAccountRow
                account={direct_account}
                onEditAccount={vi.fn()}
                onHideOrDeleteAccount={vi.fn()}
                isCpaSource={false}
            />,
        );

        fireEvent.click(screen.getByLabelText("账号操作"));

        await waitFor(() => {
            expect(screen.getByText("删除")).toBeInTheDocument();
        });
    });

    it("calls onEditAccount when edit is clicked", async () => {
        const on_edit = vi.fn();
        const account = make_account();

        render(
            <ProviderAccountRow
                account={account}
                onEditAccount={on_edit}
                onHideOrDeleteAccount={vi.fn()}
                isCpaSource={true}
            />,
        );

        fireEvent.click(screen.getByLabelText("账号操作"));

        await waitFor(() => {
            expect(screen.getByText("编辑")).toBeInTheDocument();
        });
        fireEvent.click(screen.getByText("编辑"));

        expect(on_edit).toHaveBeenCalledWith(account);
    });

    it("calls onHideOrDeleteAccount when hide/delete is clicked", async () => {
        const on_hide = vi.fn();
        const account = make_account();

        render(
            <ProviderAccountRow
                account={account}
                onEditAccount={vi.fn()}
                onHideOrDeleteAccount={on_hide}
                isCpaSource={true}
            />,
        );

        fireEvent.click(screen.getByLabelText("账号操作"));

        await waitFor(() => {
            expect(screen.getByText("隐藏")).toBeInTheDocument();
        });
        fireEvent.click(screen.getByText("隐藏"));

        expect(on_hide).toHaveBeenCalledWith(account);
    });

    it("clicking menu does not trigger collapse toggle", () => {
        const on_toggle = vi.fn();

        render(
            <ProviderAccountRow
                account={make_account()}
                collapsed={false}
                onToggleCollapsed={on_toggle}
                onEditAccount={vi.fn()}
                onHideOrDeleteAccount={vi.fn()}
                isCpaSource={true}
            />,
        );

        fireEvent.click(screen.getByLabelText("账号操作"));

        expect(on_toggle).not.toHaveBeenCalled();
    });
});
