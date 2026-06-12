import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "../../../../src/renderer/components/Button";

describe("Button", () => {
    it("renders with default variant and size", () => {
        render(<Button>click me</Button>);
        const btn = screen.getByRole("button", { name: "click me" });
        expect(btn).toBeInTheDocument();
        expect(btn).not.toBeDisabled();
    });

    it("renders ghost variant", () => {
        render(<Button variant="ghost">ghost</Button>);
        const btn = screen.getByRole("button", { name: "ghost" });
        expect(btn).toBeInTheDocument();
        expect(btn.className).toContain("hover:bg-[var(--muted)]");
        expect(btn.className).toContain("hover:text-[var(--foreground)]");
    });

    it("renders outline variant", () => {
        render(<Button variant="outline">outline</Button>);
        const btn = screen.getByRole("button", { name: "outline" });
        expect(btn).toBeInTheDocument();
        expect(btn.className).toContain("border-[var(--border)]");
        expect(btn.className).toContain("bg-transparent");
    });

    it("renders icon size", () => {
        render(<Button size="icon" aria-label="icon-btn" />);
        const btn = screen.getByRole("button", { name: "icon-btn" });
        expect(btn).toBeInTheDocument();
    });

    it("renders disabled state", () => {
        render(<Button disabled>disabled</Button>);
        const btn = screen.getByRole("button", { name: "disabled" });
        expect(btn).toBeDisabled();
    });

    it("calls onClick when clicked", async () => {
        const onClick = vi.fn();
        const user = userEvent.setup();
        render(<Button onClick={onClick}>click</Button>);
        await user.click(screen.getByRole("button", { name: "click" }));
        expect(onClick).toHaveBeenCalledOnce();
    });

    it("merges custom className", () => {
        render(<Button className="custom-class">styled</Button>);
        const btn = screen.getByRole("button", { name: "styled" });
        expect(btn.className).toContain("custom-class");
    });
});
