import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
    UPCOMING_RESET_CARD_ID,
    UpcomingResetCard,
} from "../../../../src/renderer/components/UpcomingResetCard";
import type { UpcomingResetItem } from "../../../../src/renderer/lib/provider-usage";
import { format_reset_time } from "../../../../src/renderer/lib/utils";

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

describe("UpcomingResetCard", () => {
    it("renders in the overview-card identity with a draggable grip", () => {
        const on_drag_start = vi.fn();
        const on_drag_enter = vi.fn();
        const on_drag_over = vi.fn();
        const on_drag_end = vi.fn();
        const { container } = render(
            <UpcomingResetCard
                items={[make_item()]}
                onSelectProvider={vi.fn()}
                expanded
                onDragStart={on_drag_start}
                onDragEnter={on_drag_enter}
                onDragOver={on_drag_over}
                onDragEnd={on_drag_end}
            />,
        );

        const card = container.querySelector<HTMLElement>(
            `[data-card-id="${UPCOMING_RESET_CARD_ID}"]`,
        );
        expect(card).not.toBeNull();
        expect(screen.getByTitle("拖动以调整顺序")).toBeInTheDocument();

        if (!card) throw new Error("missing upcoming reset card");
        fireEvent.dragStart(card);
        fireEvent.dragEnter(card);
        fireEvent.dragOver(card, { clientX: 20, clientY: 30 });
        fireEvent.dragEnd(card);

        expect(on_drag_start).toHaveBeenCalledTimes(1);
        expect(on_drag_enter).toHaveBeenCalledTimes(1);
        expect(on_drag_over).toHaveBeenCalledTimes(1);
        expect(on_drag_end).toHaveBeenCalledTimes(1);
    });

    it("uses controlled collapse state and invokes the toggle callback", async () => {
        const user = userEvent.setup();
        const on_toggle_expand = vi.fn();
        render(
            <UpcomingResetCard
                items={[make_item()]}
                onSelectProvider={vi.fn()}
                expanded={false}
                onToggleExpand={on_toggle_expand}
            />,
        );

        expect(screen.getByText("即将重置")).toBeInTheDocument();
        expect(screen.getByText("1 项")).toBeInTheDocument();
        expect(screen.queryByText("5 小时")).not.toBeInTheDocument();

        await user.click(screen.getByLabelText("展开即将重置"));
        expect(on_toggle_expand).toHaveBeenCalledTimes(1);
    });

    it("renders the empty-state message without a reset row", () => {
        render(<UpcomingResetCard items={[]} onSelectProvider={vi.fn()} expanded />);

        expect(screen.getByText("0 项")).toBeInTheDocument();
        expect(screen.getByText("未来 7 天内暂无重置")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /切换到/ })).not.toBeInTheDocument();
    });

    it("selects the row provider when expanded and exposes visible row content", async () => {
        const user = userEvent.setup();
        const on_select_provider = vi.fn();
        const item = make_item({ provider: "deepseek" });
        const { container } = render(
            <UpcomingResetCard items={[item]} onSelectProvider={on_select_provider} expanded />,
        );

        const row = screen.getByRole("button", { name: /切换到 deepseek/i });
        expect(row).toBeInTheDocument();
        // UpcomingResetRow renders the provider mark and status dot.
        expect(container.querySelector(".ur-row .vicon")).not.toBeNull();
        expect(container.querySelector('.ur-row .dot[data-status="warning"]')).not.toBeNull();
        // Account label and metric label are both visible.
        expect(screen.getByText(item.accountLabel)).toBeInTheDocument();
        expect(screen.getByText(item.metricLabel)).toBeInTheDocument();

        await user.click(row);
        expect(on_select_provider).toHaveBeenCalledWith("deepseek");
    });

    it("maps status dots to color classes", () => {
        const { container } = render(
            <UpcomingResetCard
                items={[
                    make_item({ status: "critical", accountId: "a1" }),
                    make_item({ status: "warning", accountId: "a2" }),
                    make_item({ status: "normal", accountId: "a3" }),
                    make_item({ status: "unknown", accountId: "a4" }),
                ]}
                onSelectProvider={vi.fn()}
                expanded
            />,
        );

        const dots = container.querySelectorAll(".ur-row .dot");
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
            <UpcomingResetCard
                items={[make_item({ accountLabel: "secret@example.com" })]}
                onSelectProvider={vi.fn()}
                desensitizeRemarks
                expanded
            />,
        );

        expect(screen.queryByText("secret@example.com")).not.toBeInTheDocument();
        expect(screen.getByText("5 小时")).toBeInTheDocument();
    });

    it("formats resetAt via format_reset_time, not relative_time", () => {
        const reset_at = new Date();
        reset_at.setDate(reset_at.getDate() + 1);
        reset_at.setHours(14, 30, 0, 0);

        render(
            <UpcomingResetCard
                items={[make_item({ resetAt: reset_at.getTime() })]}
                onSelectProvider={vi.fn()}
                expanded
            />,
        );

        // relative_time for a future timestamp would emit "刚刚"; assert never.
        expect(screen.queryByText("刚刚")).not.toBeInTheDocument();
        // Positive assertion: the formatted reset time is present.
        expect(screen.getByText(format_reset_time(reset_at.getTime()))).toBeInTheDocument();
    });
});
