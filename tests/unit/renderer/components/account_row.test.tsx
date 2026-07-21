import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountRow } from "../../../../src/renderer/components/AccountRow";
import type { VendorId } from "../../../../src/renderer/components/Icon";

function noop() {
    /* noop */
}

function render_row(overrides: Partial<Parameters<typeof AccountRow>[0]> = {}) {
    const props = {
        mode: "direct" as const,
        provider: "anthropic" as VendorId,
        account_label: "主账号",
        enabled: true,
        status: "ok" as const,
        on_toggle: noop,
        on_refresh: noop,
        on_edit: noop,
        on_delete: noop,
        ...overrides,
    };
    return { ...render(<AccountRow {...props} />), props };
}

describe("AccountRow upcoming-reset bell (t041)", () => {
    it("renders bell button with tooltip and aria-pressed when on_toggle_upcoming provided", () => {
        render_row({ on_toggle_upcoming: noop, upcoming_reset_off: false });
        const bell = screen.getByRole("button", { name: "是否监控即将重置" });
        expect(bell).toBeInTheDocument();
        expect(bell).toHaveAttribute("aria-pressed", "true");
        expect(bell.getAttribute("title")).toBe("是否监控即将重置");
    });

    it("does not render bell button when on_toggle_upcoming is missing", () => {
        render_row();
        expect(screen.queryByRole("button", { name: "是否监控即将重置" })).toBeNull();
    });

    it("reflects upcoming_reset_off=true via aria-pressed=false", () => {
        render_row({ on_toggle_upcoming: noop, upcoming_reset_off: true });
        const bell = screen.getByRole("button", { name: "是否监控即将重置" });
        expect(bell).toHaveAttribute("aria-pressed", "false");
    });

    it("invokes on_toggle_upcoming callback on click", async () => {
        const user = userEvent.setup();
        const on_toggle_upcoming = vi.fn();
        render_row({ on_toggle_upcoming, upcoming_reset_off: false });
        await user.click(screen.getByRole("button", { name: "是否监控即将重置" }));
        expect(on_toggle_upcoming).toHaveBeenCalledTimes(1);
    });
});
