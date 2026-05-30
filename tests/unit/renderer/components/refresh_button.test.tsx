import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RefreshButton } from "../../../../src/renderer/components/RefreshButton";

describe("RefreshButton", () => {
    it("renders a button with refresh aria-label", () => {
        render(<RefreshButton onClick={() => Promise.resolve()} />);
        expect(screen.getByRole("button", { name: "刷新" })).toBeInTheDocument();
    });

    it("calls onClick when clicked", async () => {
        const onClick = vi.fn().mockResolvedValue(undefined);
        const user = userEvent.setup();
        render(<RefreshButton onClick={onClick} />);
        await user.click(screen.getByRole("button", { name: "刷新" }));
        expect(onClick).toHaveBeenCalledOnce();
    });

    it("disables button while request is pending", async () => {
        let resolvePromise: () => void;
        const onClick = vi.fn().mockImplementation(
            () =>
                new Promise<void>((r) => {
                    resolvePromise = r;
                }),
        );
        const user = userEvent.setup();
        render(<RefreshButton onClick={onClick} />);
        const btn = screen.getByRole("button", { name: "刷新" });
        await user.click(btn);
        expect(btn).toBeDisabled();
        // resolve the promise via act
        await act(async () => {
            await Promise.resolve();
            resolvePromise();
        });
        expect(btn).not.toBeDisabled();
    });

    it("ignores clicks while spinning", async () => {
        let resolvePromise: () => void;
        const onClick = vi.fn().mockImplementation(
            () =>
                new Promise<void>((r) => {
                    resolvePromise = r;
                }),
        );
        const user = userEvent.setup();
        render(<RefreshButton onClick={onClick} />);
        const btn = screen.getByRole("button", { name: "刷新" });
        await user.click(btn);
        await user.click(btn);
        expect(onClick).toHaveBeenCalledOnce();
        await act(async () => {
            await Promise.resolve();
            resolvePromise();
        });
    });

    it("applies destructive color class on failure", async () => {
        const onClick = vi.fn().mockRejectedValue(new Error("fail"));
        const user = userEvent.setup();
        const { container } = render(<RefreshButton onClick={onClick} />);
        await user.click(screen.getByRole("button", { name: "刷新" }));
        // wait for the rejection to propagate
        await act(async () => {
            await Promise.resolve();
        });
        const btn = container.querySelector("button");
        expect(btn).not.toBeNull();
        expect(btn?.className).toContain("destructive");
    });
});
