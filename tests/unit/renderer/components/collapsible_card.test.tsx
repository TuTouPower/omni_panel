import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollapsibleCard } from "../../../../src/renderer/components/CollapsibleCard";

describe("CollapsibleCard", () => {
    it("shows header and children when not collapsed", () => {
        render(
            <CollapsibleCard header={<span>My Card</span>} collapsed={false} onToggle={vi.fn()}>
                <div>Card Content</div>
            </CollapsibleCard>,
        );
        expect(screen.getByText("My Card")).toBeInTheDocument();
        expect(screen.getByText("Card Content")).toBeInTheDocument();
    });

    it("hides children when collapsed", () => {
        render(
            <CollapsibleCard header={<span>My Card</span>} collapsed={true} onToggle={vi.fn()}>
                <div>Card Content</div>
            </CollapsibleCard>,
        );
        expect(screen.queryByText("Card Content")).not.toBeInTheDocument();
    });

    it("applies data-collapsed attribute", () => {
        const { container } = render(
            <CollapsibleCard header={<span>Card</span>} collapsed={true} onToggle={vi.fn()} />,
        );
        const card = container.querySelector(".card");
        expect(card).toHaveAttribute("data-collapsed", "true");
    });

    it("calls onToggle when expand button is clicked", async () => {
        const user = userEvent.setup();
        const on_toggle = vi.fn();
        render(
            <CollapsibleCard header={<span>Card</span>} collapsed={true} onToggle={on_toggle}>
                <div>Content</div>
            </CollapsibleCard>,
        );
        await user.click(screen.getByLabelText("展开"));
        expect(on_toggle).toHaveBeenCalled();
    });

    it("shows tools node in header", () => {
        render(
            <CollapsibleCard
                header={<span>Card</span>}
                tools={<button>Action</button>}
                collapsed={false}
                onToggle={vi.fn()}
            />,
        );
        expect(screen.getByText("Action")).toBeInTheDocument();
    });

    it("forwards className to root element", () => {
        const { container } = render(
            <CollapsibleCard
                header={<span>Card</span>}
                className="extra-class"
                collapsed={false}
                onToggle={vi.fn()}
            />,
        );
        const card = container.querySelector(".card");
        expect(card?.classList.contains("extra-class")).toBe(true);
    });

    it("forwards rootProps to root element", () => {
        render(
            <CollapsibleCard
                header={<span>Card</span>}
                collapsed={false}
                onToggle={vi.fn()}
                rootProps={{ "data-testid": "my-card" } as React.HTMLAttributes<HTMLDivElement>}
            />,
        );
        expect(screen.getByTestId("my-card")).toBeInTheDocument();
    });

    it("uses custom toggleLabel for aria-label", () => {
        render(
            <CollapsibleCard
                header={<span>Card</span>}
                collapsed={true}
                onToggle={vi.fn()}
                toggleLabel="打开卡片"
            >
                <div>Content</div>
            </CollapsibleCard>,
        );
        expect(screen.getByLabelText("打开卡片")).toBeInTheDocument();
    });

    it("has correct aria-expanded based on collapsed state", () => {
        render(
            <CollapsibleCard header={<span>Card</span>} collapsed={true} onToggle={vi.fn()}>
                <div>Content</div>
            </CollapsibleCard>,
        );
        const btn = screen.getByLabelText("展开");
        expect(btn).toHaveAttribute("aria-expanded", "false");
    });
});
