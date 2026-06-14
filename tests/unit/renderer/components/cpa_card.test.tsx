import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CpaCard } from "../../../../src/renderer/components/CpaCard";

function noop() {
    /* noop */
}

function render_card(overrides: Partial<Parameters<typeof CpaCard>[0]> = {}) {
    const props = {
        instance_id: "cpa-1",
        display_name: "公司 CPA",
        enabled: true,
        status: "ok" as const,
        source_count: 3,
        account_count: 5,
        rows: [
            {
                provider: "claude",
                account_label: "Claude Account",
                status: "ok" as const,
                is_hidden: false,
                is_removed: false,
            },
            {
                provider: "codex",
                account_label: "Codex Account",
                status: "ok" as const,
                is_hidden: true,
                is_removed: false,
            },
            {
                provider: "gemini",
                account_label: "Old Gemini",
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
        ...overrides,
    };
    return { ...render(<CpaCard {...props} />), props };
}

describe("CpaCard", () => {
    it("displays instance display_name instead of fixed 'CPA Manager'", () => {
        render_card();
        expect(screen.getByText("公司 CPA")).toBeInTheDocument();
        expect(screen.queryByText("CPA Manager")).not.toBeInTheDocument();
    });

    it("does not render '数据源' label", () => {
        render_card();
        expect(screen.queryByText("数据源")).not.toBeInTheDocument();
    });

    it("shows '已关闭' for hidden child rows", () => {
        render_card();
        expect(screen.getByText("已关闭")).toBeInTheDocument();
    });

    it("shows '来源已移除' for removed child rows", () => {
        render_card();
        expect(screen.getByText("来源已移除")).toBeInTheDocument();
    });

    it("renders toggle switch for normal cpa-child rows", () => {
        const on_hide = vi.fn();
        render_card({ on_hide });
        // Normal child row should have a toggle switch
        const switches = screen
            .getAllByText("Claude Account")[0]
            .closest(".acc-row")
            ?.querySelectorAll(".sw");
        expect(switches?.length).toBe(1);
    });

    it("renders '清除' button for removed child rows", () => {
        render_card();
        expect(screen.getByText("清除")).toBeInTheDocument();
    });

    it("calls on_hide when toggling a normal child row off", async () => {
        const user = userEvent.setup();
        const on_hide = vi.fn();
        render_card({ on_hide });
        const claude_row = screen.getByText("Claude Account").closest(".acc-row");
        const btn = claude_row?.querySelector(".sw");
        if (!btn) throw new Error("missing toggle");
        await user.click(btn);
        expect(on_hide).toHaveBeenCalled();
    });

    it("calls on_unhide when toggling a hidden child row on", async () => {
        const user = userEvent.setup();
        const on_unhide = vi.fn();
        render_card({ on_unhide });
        const codex_row = screen.getByText("Codex Account").closest(".acc-row");
        const btn = codex_row?.querySelector(".sw");
        if (!btn) throw new Error("missing toggle");
        await user.click(btn);
        expect(on_unhide).toHaveBeenCalled();
    });

    it("renders with second CPA instance name", () => {
        render_card({ display_name: "个人 CPA" });
        expect(screen.getByText("个人 CPA")).toBeInTheDocument();
    });

    it("groups rows by provider with sub-headers", () => {
        render_card({
            rows: [
                {
                    provider: "claude",
                    account_label: "Claude A",
                    status: "ok",
                    is_hidden: false,
                    is_removed: false,
                },
                {
                    provider: "claude",
                    account_label: "Claude B",
                    status: "ok",
                    is_hidden: false,
                    is_removed: false,
                },
                {
                    provider: "codex",
                    account_label: "Codex A",
                    status: "ok",
                    is_hidden: false,
                    is_removed: false,
                },
            ],
        });
        // Each provider group should have a sub-header with count
        expect(screen.getByText("2 个")).toBeInTheDocument();
        expect(screen.getByText("1 个")).toBeInTheDocument();
        // All accounts should still be rendered
        expect(screen.getByText("Claude A")).toBeInTheDocument();
        expect(screen.getByText("Claude B")).toBeInTheDocument();
        expect(screen.getByText("Codex A")).toBeInTheDocument();
    });

    it("renders provider group headers with vendor icon", () => {
        render_card({
            rows: [
                {
                    provider: "claude",
                    account_label: "A",
                    status: "ok",
                    is_hidden: false,
                    is_removed: false,
                },
            ],
        });
        const groups = screen.queryAllByRole("group");
        expect(groups.length).toBeGreaterThanOrEqual(1);
    });
});
