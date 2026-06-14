import { readFileSync } from "node:fs";
import { join } from "node:path";
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

    it("renders MiMo as inline SVG so currentColor can inherit", () => {
        const { container } = render(<VendorMark id="mimo" />);
        const svg = container.querySelector("span.vicon svg");
        const image = container.querySelector("span.vicon img");

        expect(svg).toBeInTheDocument();
        expect(image).not.toBeInTheDocument();
        expect(svg?.getAttribute("fill")).toBe("currentColor");
        expect(svg?.querySelector("title")?.textContent).toBe("XiaomiMiMo");
        expect(svg?.querySelector("rect")).not.toBeInTheDocument();
    });

    it("uses the official XiaomiMiMo logo asset without a fixed orange background", () => {
        const svg = readFileSync(
            join(process.cwd(), "src/renderer/assets/vendor_logos/mimo.svg"),
            "utf8",
        );

        expect(svg).toContain("<title>XiaomiMiMo</title>");
        expect(svg).toContain('fill="currentColor"');
        expect(svg).not.toContain("#ff6900");
        expect(svg).not.toContain("<rect");
    });

    it("applies color via currentColor instead of hardcoded hex", () => {
        const { container } = render(<VendorMark id="cpa" color="red" />);
        const svg = container.querySelector("span.vicon svg");
        expect(svg).toBeTruthy();
        if (!svg) return;
        // SVG should use currentColor, not hardcoded hex colors
        expect(svg.outerHTML).toContain("currentColor");
        expect(svg.outerHTML).not.toContain("#3d7afd");
        expect(svg.outerHTML).not.toContain("#22c55e");
        // Wrapper should apply color via CSS
        const wrapper = container.querySelector("span.vicon");
        expect(wrapper).toBeTruthy();
        if (!wrapper) return;
        expect(wrapper.getAttribute("style")).toContain("color");
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
