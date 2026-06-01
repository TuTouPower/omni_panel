import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CardMenu, type CardMenuItem } from "../../../../src/renderer/components/CardMenu";
import { Icon } from "../../../../src/renderer/components/Icon";

describe("CardMenu", () => {
    const base_items: CardMenuItem[] = [
        { label: "编辑", icon: <Icon name="gear" size={15} />, onClick: vi.fn() },
        { label: "删除", icon: <Icon name="trash" size={15} />, danger: true, onClick: vi.fn() },
    ];

    it("renders nothing when closed", () => {
        const { container } = render(
            <CardMenu
                items={base_items}
                open={false}
                position={{ x: 0, y: 0 }}
                onClose={vi.fn()}
            />,
        );
        expect(container.firstChild).toBeNull();
    });

    it("renders menu items when open", () => {
        render(
            <CardMenu items={base_items} open={true} position={{ x: 0, y: 0 }} onClose={vi.fn()} />,
        );
        expect(screen.getByText("编辑")).toBeInTheDocument();
        expect(screen.getByText("删除")).toBeInTheDocument();
    });

    it("calls item onClick and onClose when an item is clicked", () => {
        const edit_fn = vi.fn();
        const on_close = vi.fn();
        const items: CardMenuItem[] = [
            { label: "编辑", icon: <Icon name="gear" size={15} />, onClick: edit_fn },
        ];
        render(<CardMenu items={items} open={true} position={{ x: 0, y: 0 }} onClose={on_close} />);
        fireEvent.click(screen.getByText("编辑"));
        expect(edit_fn).toHaveBeenCalledTimes(1);
        expect(on_close).toHaveBeenCalledTimes(1);
    });

    it("renders danger item with danger class", () => {
        render(
            <CardMenu items={base_items} open={true} position={{ x: 0, y: 0 }} onClose={vi.fn()} />,
        );
        const del_btn = screen.getByText("删除");
        expect(del_btn.className).toContain("danger");
    });

    it("shows check mark for checked items", () => {
        const items: CardMenuItem[] = [{ label: "选项", onClick: vi.fn(), checked: true }];
        render(<CardMenu items={items} open={true} position={{ x: 0, y: 0 }} onClose={vi.fn()} />);
        expect(screen.getByText("✓")).toBeInTheDocument();
    });

    it("shows meta text when provided", () => {
        const items: CardMenuItem[] = [{ label: "刷新间隔", onClick: vi.fn(), meta: "5 分钟" }];
        render(<CardMenu items={items} open={true} position={{ x: 0, y: 0 }} onClose={vi.fn()} />);
        expect(screen.getByText("5 分钟")).toBeInTheDocument();
    });

    it("closes on Escape key", () => {
        const on_close = vi.fn();
        render(
            <CardMenu
                items={base_items}
                open={true}
                position={{ x: 0, y: 0 }}
                onClose={on_close}
            />,
        );
        fireEvent.keyDown(document, { key: "Escape" });
        expect(on_close).toHaveBeenCalledTimes(1);
    });
});
