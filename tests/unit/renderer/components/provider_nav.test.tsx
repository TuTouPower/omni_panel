import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProviderNav } from "../../../../src/renderer/components/ProviderNav";

describe("ProviderNav", () => {
    const providers = ["codex", "antigravity", "kimi", "tavily", "firecrawl"];

    it("renders tabs in the given order", () => {
        render(
            <ProviderNav
                activeTab="overview"
                visibleProviders={providers}
                orderedProviders={providers}
                onChange={vi.fn()}
            />,
        );

        const buttons = screen.getAllByRole("button");
        // First button is the pinned overview tab.
        const labels = buttons.map((b) => b.textContent);
        expect(labels).toEqual(["总览", "Codex", "Antigravity", "Kimi", "Tavily", "Firecrawl"]);
    });

    it("makes tab icons draggable when drag handlers are provided", () => {
        render(
            <ProviderNav
                activeTab="overview"
                visibleProviders={providers}
                orderedProviders={providers}
                onChange={vi.fn()}
                onDragStart={vi.fn()}
                onDragEnter={vi.fn()}
                onDragOver={vi.fn()}
                onDragEnd={vi.fn()}
            />,
        );

        const tabs = screen.getAllByRole("button").slice(1);
        for (const tab of tabs) {
            const icon = tab.querySelector(".tab-ic");
            expect(icon).toHaveAttribute("draggable", "true");
            expect(tab).not.toHaveAttribute("draggable", "true");
        }
    });

    it("does not make tab labels draggable", () => {
        render(
            <ProviderNav
                activeTab="overview"
                visibleProviders={providers}
                orderedProviders={providers}
                onChange={vi.fn()}
                onDragStart={vi.fn()}
                onDragEnter={vi.fn()}
                onDragOver={vi.fn()}
                onDragEnd={vi.fn()}
            />,
        );

        const tabs = screen.getAllByRole("button").slice(1);
        for (const tab of tabs) {
            const label = tab.querySelector(".tab-lbl");
            expect(label).not.toHaveAttribute("draggable", "true");
        }
    });

    it("calls onDragStart and onDragEnd on the icon during a drag", () => {
        const on_drag_start = vi.fn();
        const on_drag_end = vi.fn();
        render(
            <ProviderNav
                activeTab="overview"
                visibleProviders={providers}
                orderedProviders={providers}
                onChange={vi.fn()}
                onDragStart={on_drag_start}
                onDragEnter={vi.fn()}
                onDragOver={vi.fn()}
                onDragEnd={on_drag_end}
            />,
        );

        const kimi_tab = screen.getByRole("button", { name: /^Kimi$/ });
        const icon = kimi_tab.querySelector(".tab-ic");
        if (icon === null) throw new Error("missing .tab-ic");
        fireEvent.dragStart(icon);
        expect(on_drag_start).toHaveBeenCalledWith("kimi");

        fireEvent.dragEnd(icon);
        expect(on_drag_end).toHaveBeenCalled();
    });

    it("calls onDragOver with provider and clientX", () => {
        const on_drag_over = vi.fn();
        render(
            <ProviderNav
                activeTab="overview"
                visibleProviders={providers}
                orderedProviders={providers}
                onChange={vi.fn()}
                onDragStart={vi.fn()}
                onDragEnter={vi.fn()}
                onDragOver={on_drag_over}
                onDragEnd={vi.fn()}
            />,
        );

        const kimi_tab = screen.getByRole("button", { name: /^Kimi$/ });
        const kimi_icon = kimi_tab.querySelector(".tab-ic");
        if (kimi_icon === null) throw new Error("missing .tab-ic");
        fireEvent.dragStart(kimi_icon);

        const tavily_tab = screen.getByRole("button", { name: /^Tavily$/ });
        const drag_over_event = new MouseEvent("dragover", {
            bubbles: true,
            cancelable: true,
            clientX: 100,
            clientY: 0,
        });
        fireEvent(tavily_tab, drag_over_event);

        const [, client_x, rect] = on_drag_over.mock.calls[0] as [
            string,
            number,
            { left: number; width: number },
        ];
        expect(client_x).toBe(100);
        expect(rect).toHaveProperty("left");
        expect(rect).toHaveProperty("width");
    });

    it("switches tab on click when not dragging", () => {
        const on_change = vi.fn();
        render(
            <ProviderNav
                activeTab="overview"
                visibleProviders={providers}
                orderedProviders={providers}
                onChange={on_change}
                onDragStart={vi.fn()}
                onDragEnter={vi.fn()}
                onDragOver={vi.fn()}
                onDragEnd={vi.fn()}
            />,
        );

        const kimi_tab = screen.getByRole("button", { name: /^Kimi$/ });
        fireEvent.click(kimi_tab);
        expect(on_change).toHaveBeenCalledWith("kimi");
    });

    it("does not switch tab on click after a drag", () => {
        const on_change = vi.fn();
        render(
            <ProviderNav
                activeTab="overview"
                visibleProviders={providers}
                orderedProviders={providers}
                onChange={on_change}
                onDragStart={vi.fn()}
                onDragEnter={vi.fn()}
                onDragOver={vi.fn()}
                onDragEnd={vi.fn()}
            />,
        );

        const kimi_tab = screen.getByRole("button", { name: /^Kimi$/ });
        const kimi_icon = kimi_tab.querySelector(".tab-ic");
        if (kimi_icon === null) throw new Error("missing .tab-ic");
        fireEvent.dragStart(kimi_icon);
        fireEvent.dragEnd(kimi_icon);
        fireEvent.click(kimi_tab);

        expect(on_change).not.toHaveBeenCalled();
    });

    it("applies dragging and drag-over classes for visual feedback", () => {
        render(
            <ProviderNav
                activeTab="overview"
                visibleProviders={providers}
                orderedProviders={providers}
                onChange={vi.fn()}
                onDragStart={vi.fn()}
                onDragEnter={vi.fn()}
                onDragOver={vi.fn()}
                onDragEnd={vi.fn()}
                draggingProvider="kimi"
                overProvider="tavily"
            />,
        );

        const kimi_tab = screen.getByRole("button", { name: /^Kimi$/ });
        const tavily_tab = screen.getByRole("button", { name: /^Tavily$/ });

        expect(kimi_tab.classList.contains("dragging")).toBe(true);
        expect(tavily_tab.classList.contains("drag-over")).toBe(true);
    });
});
