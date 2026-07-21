import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CpaCard } from "../../../../src/renderer/components/CpaCard";
import type { VendorId } from "../../../../src/renderer/components/Icon";

function noop() {
    /* noop */
}

function render_card(overrides: Partial<Parameters<typeof CpaCard>[0]> = {}) {
    const props = {
        instance_id: "cpa-1",
        display_name: "公司 CPA",
        enabled: true,
        status: "ok" as const,
        rows: [
            {
                provider: "claude" as VendorId,
                account_id: "claude-account",
                account_label: "Claude Account",
                status: "ok" as const,
                is_hidden: false,
                is_removed: false,
            },
            {
                provider: "codex" as VendorId,
                account_id: "codex-account",
                account_label: "Codex Account",
                status: "ok" as const,
                is_hidden: true,
                is_removed: false,
            },
            {
                provider: "glm" as VendorId,
                account_id: "glm-old",
                account_label: "Old GLM",
                status: "ok" as const,
                is_hidden: false,
                is_removed: true,
            },
        ],
        on_toggle: noop,
        on_refresh: noop,
        on_edit: noop,
        on_delete: noop,
        on_hide: noop,
        on_unhide: noop,
        on_clear: noop,
        on_rename: noop,
        ...overrides,
    };
    return { ...render(<CpaCard {...props} />), props };
}

describe("CpaCard", () => {
    it("displays instance display_name instead of fixed 'CPA Manager'", () => {
        render_card();
        expect(screen.getByText(/公司 CPA/)).toBeInTheDocument();
        expect(screen.queryByText("CPA Manager")).not.toBeInTheDocument();
    });

    it("does not render '数据源' label", () => {
        render_card();
        expect(screen.queryByText("数据源")).not.toBeInTheDocument();
    });

    it("renders status only for the CPA parent row", () => {
        const { container } = render_card();
        expect(container.querySelectorAll(".ar-status")).toHaveLength(1);
    });

    it("shows '来源已移除' for removed child rows", () => {
        render_card();
        expect(screen.getByText("来源已移除")).toBeInTheDocument();
    });

    it("renders toggle switch for normal cpa-child rows", () => {
        const on_hide = vi.fn();
        render_card({ on_hide });
        // Normal child row should have a toggle switch
        const child_rows = document.querySelectorAll<HTMLElement>(".acc-row:not(.ds-row)");
        const claude_row = child_rows[0];
        if (!claude_row) throw new Error("missing Claude child row");
        const switches = claude_row.querySelectorAll(".sw");
        expect(switches.length).toBe(1);
    });

    it("renders '清除' button for removed child rows", () => {
        render_card();
        expect(screen.getByText("清除")).toBeInTheDocument();
    });

    it("calls on_hide with account_id when toggling a normal child row off", async () => {
        const user = userEvent.setup();
        const on_hide = vi.fn();
        render_card({ on_hide });
        const claude_row = document.querySelector<HTMLElement>(".acc-row:not(.ds-row)");
        const btn = claude_row?.querySelector(".sw");
        if (!btn) throw new Error("missing toggle");
        await user.click(btn);
        expect(on_hide).toHaveBeenCalledWith({
            provider: "claude",
            account_id: "claude-account",
        });
    });

    it("calls on_unhide with account_id when toggling a hidden child row on", async () => {
        const user = userEvent.setup();
        const on_unhide = vi.fn();
        render_card({ on_unhide });
        const child_rows = document.querySelectorAll<HTMLElement>(".acc-row:not(.ds-row)");
        const codex_row = child_rows[1];
        const btn = codex_row?.querySelector(".sw");
        if (!btn) throw new Error("missing toggle");
        await user.click(btn);
        expect(on_unhide).toHaveBeenCalledWith({
            provider: "codex",
            account_id: "codex-account",
        });
    });

    it("renders with second CPA instance name", () => {
        render_card({ display_name: "个人 CPA" });
        expect(screen.getByText(/个人 CPA/)).toBeInTheDocument();
    });

    it("renders flat AccountRow per unique account with vendor visible", () => {
        render_card({
            rows: [
                {
                    provider: "claude",
                    account_id: "claude-a",
                    account_label: "Claude A",
                    status: "ok",
                    is_hidden: false,
                    is_removed: false,
                },
                {
                    provider: "claude",
                    account_id: "claude-b",
                    account_label: "Claude B",
                    status: "ok",
                    is_hidden: false,
                    is_removed: false,
                },
                {
                    provider: "codex",
                    account_id: "codex-a",
                    account_label: "Codex A",
                    status: "ok",
                    is_hidden: false,
                    is_removed: false,
                },
            ],
        });
        // All accounts should be rendered
        expect(screen.getByText(/Claude A/)).toBeInTheDocument();
        expect(screen.getByText(/Claude B/)).toBeInTheDocument();
        expect(screen.getByText(/Codex A/)).toBeInTheDocument();
        // No disc-head group headers (flat layout)
        expect(screen.queryByText("2 个")).not.toBeInTheDocument();
        expect(screen.queryByText("1 个")).not.toBeInTheDocument();
        // Vendor name visible in each row (show_vendor=true)
        const vendorClaude = screen.getAllByText("Claude");
        expect(vendorClaude.length).toBeGreaterThanOrEqual(2);
        const vendorCodex = screen.getAllByText("Codex");
        expect(vendorCodex.length).toBeGreaterThanOrEqual(1);
    });

    it("does not render fail_count summary", () => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
        render_card({ fail_count: 5 } as any);
        expect(screen.queryByText(/采集失败/)).not.toBeInTheDocument();
    });

    it("aggregates same account_id with multiple metrics into one row", () => {
        render_card({
            rows: [
                {
                    provider: "claude",
                    account_id: "user@example.com",
                    account_label: "user@example.com",
                    status: "ok",
                    is_hidden: false,
                    is_removed: false,
                },
                {
                    provider: "claude",
                    account_id: "user@example.com",
                    account_label: "user@example.com",
                    status: "ok",
                    is_hidden: false,
                    is_removed: false,
                },
            ],
        });
        const labels = screen.getAllByText(/user@example\.com/);
        expect(labels.length).toBe(1);
    });

    it("deduplicates rows with same account_id into single row", () => {
        render_card({
            rows: [
                {
                    provider: "claude",
                    account_id: "user@example.com",
                    account_label: "user@example.com",
                    status: "ok",
                    is_hidden: false,
                    is_removed: false,
                },
                {
                    provider: "claude",
                    account_id: "user@example.com",
                    account_label: "user@example.com",
                    status: "ok",
                    is_hidden: false,
                    is_removed: false,
                },
            ],
        });
        const labels = screen.getAllByText(/user@example\.com/);
        expect(labels.length).toBe(1);
    });

    it("shows separate rows for different account_ids under same provider", () => {
        render_card({
            rows: [
                {
                    provider: "claude",
                    account_id: "alice@example.com",
                    account_label: "alice@example.com",
                    status: "ok",
                    is_hidden: false,
                    is_removed: false,
                },
                {
                    provider: "claude",
                    account_id: "alice@example.com",
                    account_label: "alice@example.com",
                    status: "ok",
                    is_hidden: false,
                    is_removed: false,
                },
                {
                    provider: "claude",
                    account_id: "bob@example.com",
                    account_label: "bob@example.com",
                    status: "ok",
                    is_hidden: false,
                    is_removed: false,
                },
            ],
        });
        expect(screen.getByText(/alice@example\.com/)).toBeInTheDocument();
        expect(screen.getByText(/bob@example\.com/)).toBeInTheDocument();
        // No group headers in flat layout
        expect(screen.queryByText("2 个")).not.toBeInTheDocument();
    });

    it("t041: passes on_toggle_upcoming per child row with target payload", async () => {
        const user = userEvent.setup();
        const on_toggle_upcoming = vi.fn();
        render_card({ on_toggle_upcoming });
        // Claude child row is the first non-ds-row; its bell should fire target.
        const claude_row = document.querySelector<HTMLElement>(".acc-row:not(.ds-row)");
        const bell = claude_row?.querySelector('button[aria-label="是否监控即将重置"]');
        if (!bell) throw new Error("missing upcoming bell on Claude child row");
        await user.click(bell);
        expect(on_toggle_upcoming).toHaveBeenCalledWith({
            provider: "claude",
            account_id: "claude-account",
        });
    });
});
