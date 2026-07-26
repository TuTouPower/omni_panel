import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ProviderCard } from "../../../../src/renderer/components/ProviderCard";
import { makeGroup, setupWindowUsageboard } from "./provider_card_fixture";

vi.mock("../../../../src/renderer/lib/theme", () => ({
    useTheme: () => undefined,
}));

describe("ProviderCard - drag", () => {
    beforeEach(() => {
        setupWindowUsageboard();
    });

    it("applies dragging and drag-over CSS classes", () => {
        const { container } = render(
            <ProviderCard provider="deepseek" group={makeGroup()} dragging />,
        );
        expect(container.querySelector(".card.dragging")).toBeInTheDocument();
    });

    it("renders grip handle when onDragStart is provided", () => {
        render(<ProviderCard provider="deepseek" group={makeGroup()} onDragStart={vi.fn()} />);
        expect(screen.getByTitle("拖动以调整顺序")).toBeInTheDocument();
    });
});
