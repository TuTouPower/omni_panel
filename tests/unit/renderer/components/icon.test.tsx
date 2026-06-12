import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Icon, VendorMark } from "../../../../src/renderer/components/Icon";

describe("Icon", () => {
    it("renders an SVG element", () => {
        const { container } = render(<Icon name="refresh" />);
        const svg = container.querySelector("svg");
        expect(svg).toBeInTheDocument();
    });

    it("uses default size of 18", () => {
        const { container } = render(<Icon name="gear" />);
        const svg = container.querySelector("svg");
        expect(svg).not.toBeNull();
        expect(svg?.getAttribute("width")).toBe("18");
        expect(svg?.getAttribute("height")).toBe("18");
    });

    it("accepts custom size", () => {
        const { container } = render(<Icon name="close" size={24} />);
        const svg = container.querySelector("svg");
        expect(svg).not.toBeNull();
        expect(svg?.getAttribute("width")).toBe("24");
        expect(svg?.getAttribute("height")).toBe("24");
    });

    it("accepts custom color", () => {
        const { container } = render(<Icon name="check" color="red" />);
        const svg = container.querySelector("svg");
        expect(svg).not.toBeNull();
        expect(svg?.getAttribute("stroke")).toBe("red");
    });

    it("applies custom className", () => {
        const { container } = render(<Icon name="back" className="my-icon" />);
        const svg = container.querySelector("svg");
        expect(svg).not.toBeNull();
        expect(svg?.getAttribute("class")).toContain("my-icon");
    });

    it("renders empty path for unknown icon name", () => {
        const { container } = render(<Icon name="nonexistent" />);
        const svg = container.querySelector("svg");
        expect(svg).not.toBeNull();
        expect(svg?.innerHTML).toBe("");
    });
});

describe("VendorMark", () => {
    it("renders a span with vicon class", () => {
        const { container } = render(<VendorMark id="claude" />);
        const span = container.querySelector("span.vicon");
        expect(span).toBeInTheDocument();
    });

    it("renders an official logo image for known vendor", () => {
        const { container } = render(<VendorMark id="deepseek" />);
        const image = container.querySelector("span.vicon img");
        expect(image).toBeInTheDocument();
        expect(image?.getAttribute("src")).toContain("deepseek");
    });

    it("falls back to overview SVG for unknown vendor", () => {
        const { container } = render(<VendorMark id="unknown-vendor" />);
        const inner = container.querySelector("span.vicon svg");
        expect(inner).toBeInTheDocument();
    });

    it("accepts custom size", () => {
        const { container } = render(<VendorMark id="claude" size={40} />);
        const span = container.querySelector("span.vicon");
        expect(span).not.toBeNull();
        expect(span?.getAttribute("style")).toContain("width: 40px");
        expect(span?.getAttribute("style")).toContain("height: 40px");
    });
});
