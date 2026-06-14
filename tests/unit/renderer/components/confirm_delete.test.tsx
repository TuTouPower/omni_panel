import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDelete } from "../../../../src/renderer/components/ConfirmDelete";

function renderConfirmDelete(overrides: Partial<React.ComponentProps<typeof ConfirmDelete>> = {}) {
    const props = {
        name: "Test Account",
        onCancel: vi.fn(),
        onConfirm: vi.fn(),
        ...overrides,
    };
    return { ...render(<ConfirmDelete {...props} />), ...props };
}

describe("ConfirmDelete", () => {
    it("renders dialog with account name", () => {
        renderConfirmDelete({ name: "My DeepSeek" });
        expect(screen.getByText("删除账号", { selector: ".ad-title" })).toBeInTheDocument();
        expect(screen.getByText("此操作无法撤销")).toBeInTheDocument();
        expect(screen.getByText("My DeepSeek")).toBeInTheDocument();
        expect(screen.getByText("取消")).toBeInTheDocument();
        expect(screen.getByText("删除账号", { selector: ".ad-btn" })).toBeInTheDocument();
    });

    it("calls onConfirm when clicking confirm button", async () => {
        const user = userEvent.setup();
        const { onConfirm } = renderConfirmDelete();
        await user.click(screen.getByText("删除账号", { selector: ".ad-btn" }));
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it("calls onCancel when clicking cancel button", async () => {
        const user = userEvent.setup();
        const { onCancel } = renderConfirmDelete();
        await user.click(screen.getByText("取消"));
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("calls onCancel when clicking scrim overlay", async () => {
        const user = userEvent.setup();
        const { onCancel } = renderConfirmDelete();
        const scrim = document.querySelector(".acct-dialog-scrim");
        expect(scrim).toBeInTheDocument();
        if (!scrim) return;
        await user.click(scrim);
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("calls onCancel on Escape key", async () => {
        const user = userEvent.setup();
        const { onCancel } = renderConfirmDelete();
        await user.keyboard("{Escape}");
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("does not call onCancel when clicking inside the dialog", async () => {
        const user = userEvent.setup();
        const { onCancel } = renderConfirmDelete();
        await user.click(screen.getByText("此操作无法撤销"));
        expect(onCancel).not.toHaveBeenCalled();
    });

    it("renders custom title and confirmLabel when provided", () => {
        render(
            <ConfirmDelete
                name="Data Source"
                onCancel={vi.fn()}
                onConfirm={vi.fn()}
                title="Remove Source"
                confirmLabel="Remove"
            />,
        );
        expect(screen.getByText("Remove Source")).toBeInTheDocument();
        expect(screen.getByText("Remove", { selector: ".ad-btn" })).toBeInTheDocument();
    });
});
