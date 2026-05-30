import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBanner } from "../../../../src/renderer/components/ErrorBanner";

describe("ErrorBanner", () => {
    it("renders the error message", () => {
        render(<ErrorBanner message="连接失败" />);
        expect(screen.getByText("连接失败")).toBeInTheDocument();
    });

    it("renders different messages", () => {
        render(<ErrorBanner message="API 超时" />);
        expect(screen.getByText("API 超时")).toBeInTheDocument();
    });

    it("renders as a div element", () => {
        const { container } = render(<ErrorBanner message="err" />);
        expect(container.firstElementChild?.tagName).toBe("DIV");
    });

    it("contains only the message text", () => {
        const { container } = render(<ErrorBanner message="only text" />);
        expect(container.firstElementChild?.textContent).toBe("only text");
    });
});
