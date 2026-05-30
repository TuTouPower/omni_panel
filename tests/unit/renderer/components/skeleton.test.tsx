import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Skeleton } from "../../../../src/renderer/components/Skeleton";

describe("Skeleton", () => {
    it("renders a div element", () => {
        const { container } = render(<Skeleton />);
        const div = container.firstElementChild;
        expect(div).toBeInTheDocument();
        expect(div?.tagName).toBe("DIV");
    });

    it("applies default animate-pulse class", () => {
        const { container } = render(<Skeleton />);
        const div = container.firstElementChild as HTMLElement;
        expect(div.className).toContain("animate-pulse");
    });

    it("merges custom className", () => {
        const { container } = render(<Skeleton className="w-20 h-4" />);
        const div = container.firstElementChild as HTMLElement;
        expect(div.className).toContain("w-20");
        expect(div.className).toContain("h-4");
        expect(div.className).toContain("animate-pulse");
    });

    it("renders empty content", () => {
        const { container } = render(<Skeleton />);
        expect(container.firstElementChild?.textContent).toBe("");
    });
});
