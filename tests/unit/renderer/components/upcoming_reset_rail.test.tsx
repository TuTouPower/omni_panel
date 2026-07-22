import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { UpcomingResetRail } from "../../../../src/renderer/components/UpcomingResetRail";
import type { UpcomingResetItem } from "../../../../src/renderer/lib/provider-usage";

function make_item(overrides: Partial<UpcomingResetItem> = {}): UpcomingResetItem {
    return {
        provider: "claude",
        accountLabel: "acct1@example.com",
        accountId: "acct1",
        rawLabel: "5h",
        metricLabel: "5 小时",
        resetAt: Date.now() + 3 * 24 * 60 * 60 * 1000,
        percent: 72,
        status: "warning",
        ...overrides,
    };
}

describe("UpcomingResetRail", () => {
    it("renders title and items", () => {
        render(<UpcomingResetRail items={[make_item()]} onSelectProvider={vi.fn()} />);

        expect(screen.getByText("即将重置（7 天内）")).toBeInTheDocument();
        expect(screen.getByText("5 小时")).toBeInTheDocument();
    });

    it("renders empty state when items list is empty", () => {
        render(<UpcomingResetRail items={[]} onSelectProvider={vi.fn()} />);
        expect(screen.getByText(/暂无/)).toBeInTheDocument();
        // list shell should NOT render when empty
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("calls onSelectProvider with provider id when row is clicked", async () => {
        const user = userEvent.setup();
        const on_select = vi.fn();
        render(
            <UpcomingResetRail
                items={[make_item({ provider: "kimi" })]}
                onSelectProvider={on_select}
            />,
        );

        await user.click(screen.getByRole("button"));
        expect(on_select).toHaveBeenCalledWith("kimi");
    });

    it("maps status to dot class correctly", () => {
        const { container } = render(
            <UpcomingResetRail
                items={[
                    make_item({ status: "critical", accountId: "a1" }),
                    make_item({ status: "warning", accountId: "a2" }),
                    make_item({ status: "normal", accountId: "a3" }),
                    make_item({ status: "unknown", accountId: "a4" }),
                ]}
                onSelectProvider={vi.fn()}
            />,
        );

        const dots = container.querySelectorAll(".dot");
        expect(dots).toHaveLength(4);
        expect(dots[0]?.classList.contains("red")).toBe(true);
        expect(dots[1]?.classList.contains("amber")).toBe(true);
        expect(dots[2]?.classList.contains("green")).toBe(true);
        // unknown → bare .dot, no color class
        expect(dots[3]?.classList.contains("red")).toBe(false);
        expect(dots[3]?.classList.contains("amber")).toBe(false);
        expect(dots[3]?.classList.contains("green")).toBe(false);
    });

    it("hides account label when desensitizeRemarks is on", () => {
        render(
            <UpcomingResetRail
                items={[make_item({ accountLabel: "secret@example.com" })]}
                onSelectProvider={vi.fn()}
                desensitizeRemarks
            />,
        );

        expect(screen.queryByText("secret@example.com")).not.toBeInTheDocument();
    });

    it("formats resetAt via format_reset_time (today / MM/DD), not relative_time", () => {
        const reset_at = new Date();
        reset_at.setDate(reset_at.getDate() + 1);
        reset_at.setHours(14, 30, 0, 0);

        render(
            <UpcomingResetRail
                items={[make_item({ resetAt: reset_at.getTime() })]}
                onSelectProvider={vi.fn()}
            />,
        );

        // format_reset_time emits "今天 HH:MM" when same day, else "M/D HH:MM"
        // relative_time would emit "刚刚" for future timestamps — assert never.
        expect(screen.queryByText("刚刚")).not.toBeInTheDocument();
        // Positive assertion: must match either "今天 HH:MM" or "M/D HH:MM".
        expect(
            screen.getByText(/^(今天\s*\d{2}:\d{2}|\d{1,2}\/\d{1,2}\s+\d{2}:\d{2})$/),
        ).toBeInTheDocument();
    });

    it("renders VendorMark with the row's provider id", () => {
        const { container } = render(
            <UpcomingResetRail
                items={[make_item({ provider: "claude" })]}
                onSelectProvider={vi.fn()}
            />,
        );

        // VendorMark renders a .vicon span (img or inline svg inside); assert present.
        expect(container.querySelector(".ur-row .vicon")).not.toBeNull();
    });
});
