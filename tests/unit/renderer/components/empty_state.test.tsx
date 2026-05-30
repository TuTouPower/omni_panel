import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmptyState } from "../../../../src/renderer/components/EmptyState";

describe("EmptyState", () => {
    it("renders default message", () => {
        render(<EmptyState />);
        expect(screen.getByText("暂无数据")).toBeInTheDocument();
    });

    it("renders custom message", () => {
        render(<EmptyState message="没有插件" />);
        expect(screen.getByText("没有插件")).toBeInTheDocument();
    });

    it("hides action button when only action text is provided without onAction", () => {
        render(<EmptyState action="重试" />);
        expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument();
    });

    it("hides action button when only onAction is provided without action text", () => {
        render(<EmptyState onAction={() => undefined} />);
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("renders action button and fires onAction on click", async () => {
        const onAction = vi.fn();
        const user = userEvent.setup();
        render(<EmptyState action="加载" onAction={onAction} />);
        const btn = screen.getByRole("button", { name: "加载" });
        await user.click(btn);
        expect(onAction).toHaveBeenCalledOnce();
    });

    it("supports data-testid prop", () => {
        render(<EmptyState data-testid="empty-box" />);
        expect(screen.getByTestId("empty-box")).toBeInTheDocument();
    });
});
