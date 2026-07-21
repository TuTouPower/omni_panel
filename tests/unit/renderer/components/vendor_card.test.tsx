import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VendorCard } from "../../../../src/renderer/components/VendorCard";
import type { VendorId } from "../../../../src/renderer/components/Icon";

function noop() {
    /* noop */
}

function render_card(overrides: Partial<Parameters<typeof VendorCard>[0]> = {}) {
    const props = {
        provider: "anthropic" as VendorId,
        rows: [
            {
                instance_id: "inst-1",
                account_label: "主账号",
                enabled: true,
                status: "ok" as const,
            },
        ],
        on_toggle: noop,
        on_refresh: noop,
        on_edit: noop,
        on_delete: noop,
        ...overrides,
    };
    return { ...render(<VendorCard {...props} />), props };
}

describe("VendorCard upcoming-reset bell pass-through (t041)", () => {
    it("t041: invokes on_toggle_upcoming with instance_id when bell clicked", async () => {
        const user = userEvent.setup();
        const on_toggle_upcoming = vi.fn();
        render_card({ on_toggle_upcoming });
        await user.click(screen.getByRole("button", { name: "是否监控即将重置" }));
        expect(on_toggle_upcoming).toHaveBeenCalledWith("inst-1");
    });

    it("t041: hides bell on rows where can_toggle_upcoming=false", () => {
        render_card({
            rows: [
                {
                    instance_id: "inst-1",
                    account_label: "主账号",
                    enabled: true,
                    status: "ok" as const,
                    can_toggle_upcoming: false,
                },
            ],
            on_toggle_upcoming: noop,
        });
        expect(screen.queryByRole("button", { name: "是否监控即将重置" })).toBeNull();
    });
});
