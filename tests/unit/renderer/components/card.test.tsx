import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "../../../../src/renderer/components/Card";

describe("Card", () => {
    it("renders a div with children", () => {
        render(<Card>hello</Card>);
        expect(screen.getByText("hello")).toBeInTheDocument();
    });

    it("merges custom className", () => {
        const { container } = render(<Card className="extra-class">content</Card>);
        const div = container.firstElementChild as HTMLElement;
        expect(div.className).toContain("extra-class");
        // preserves base classes
        expect(div.className).toContain("rounded-");
    });

    it("spreads additional HTML attributes", () => {
        render(<Card data-testid="my-card">test</Card>);
        expect(screen.getByTestId("my-card")).toBeInTheDocument();
    });

    it("renders multiple children", () => {
        render(
            <Card>
                <span>first</span>
                <span>second</span>
            </Card>,
        );
        expect(screen.getByText("first")).toBeInTheDocument();
        expect(screen.getByText("second")).toBeInTheDocument();
    });
});
