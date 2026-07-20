import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { UpcomingResetBanner } from "../../../../src/renderer/components/UpcomingResetBanner";
import type { UpcomingResetItem } from "../../../../src/renderer/lib/provider-usage";

function make_item(overrides: Partial<UpcomingResetItem> = {}): UpcomingResetItem {
    return {
        provider: "claude",
        accountLabel: "acct1@example.com",
        accountId: "acct1",
        metricLabel: "5 小时",
        resetAt: Date.now() + 3 * 24 * 60 * 60 * 1000,
        percent: 72,
        status: "warning",
        ...overrides,
    };
}

describe("UpcomingResetBanner", () => {
    it("renders collapsed header with item count", () => {
        render(
            <UpcomingResetBanner
                items={[make_item(), make_item({ accountId: "a2" })]}
                onSelectProvider={vi.fn()}
            />,
        );

        // header: 即将重置 + count badge "2 项"
        expect(screen.getByText("即将重置")).toBeInTheDocument();
        expect(screen.getByText(/2 项/)).toBeInTheDocument();
    });

    it("expands to show row list on toggle click", async () => {
        const user = userEvent.setup();
        render(<UpcomingResetBanner items={[make_item()]} onSelectProvider={vi.fn()} />);

        // Collapsed initially: row content hidden
        expect(screen.queryByText("5 小时")).not.toBeInTheDocument();

        await user.click(screen.getByLabelText("展开即将重置"));

        expect(screen.getByText("5 小时")).toBeInTheDocument();
    });

    it("renders empty state when items list is empty", () => {
        render(<UpcomingResetBanner items={[]} onSelectProvider={vi.fn()} />);
        expect(screen.getByText(/暂无/)).toBeInTheDocument();
        expect(screen.getByText(/0 项/)).toBeInTheDocument();
        // no row button rendered
        expect(screen.queryByRole("button", { name: /切换到/ })).not.toBeInTheDocument();
    });

    it("invokes onSelectProvider on row click after expanding", async () => {
        const user = userEvent.setup();
        const on_select = vi.fn();
        render(
            <UpcomingResetBanner
                items={[make_item({ provider: "deepseek" })]}
                onSelectProvider={on_select}
            />,
        );

        await user.click(screen.getByLabelText("展开即将重置"));
        await user.click(screen.getByRole("button", { name: /切换到 deepseek/i }));

        expect(on_select).toHaveBeenCalledWith("deepseek");
    });
});
