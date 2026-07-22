import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useState } from "react";
import type { UsageProvider } from "../../../../src/shared/schemas/plugin-output";
import type { ProviderUsageGroup } from "../../../../src/renderer/lib/provider-usage";
import { use_dnd_handlers } from "../../../../src/renderer/hooks/use_dnd_handlers";

function make_account(id: string) {
    return {
        id,
        sourceInstanceId: "src-1",
        accountId: id,
        accountLabel: id,
        status: "normal" as const,
        updatedAt: "",
        observedAt: 0,
        stale: false,
        periods: [],
    };
}

const mock_group: ProviderUsageGroup = {
    provider: "claude",
    label: "Claude",
    accountCount: 3,
    status: "normal",
    updatedAt: "",
    observedAt: 0,
    stale: false,
    periods: [],
    accounts: [make_account("a1"), make_account("a2"), make_account("a3")],
};

function render_dnd(
    ordered_providers: UsageProvider[],
    active_group: ProviderUsageGroup | undefined,
    active_tab: UsageProvider | "overview",
    initial_orders: Record<string, string[]> = {},
) {
    return renderHook(() => {
        const [provider_order, set_provider_order] = useState<UsageProvider[]>(ordered_providers);
        const [account_orders, set_account_orders] =
            useState<Record<string, string[]>>(initial_orders);
        const handlers = use_dnd_handlers({
            orderedProviders: ordered_providers,
            activeGroup: active_group,
            activeTab: active_tab,
            set_provider_order,
            set_account_orders,
        });
        return { provider_order, account_orders, handlers };
    });
}

describe("use_dnd_handlers", () => {
    it("initial drag state is null", () => {
        const { result } = render_dnd(["claude", "codex"], undefined, "overview");
        expect(result.current.handlers.drag_id).toBeNull();
        expect(result.current.handlers.over_id).toBeNull();
        expect(result.current.handlers.account_drag_id).toBeNull();
        expect(result.current.handlers.account_over_id).toBeNull();
    });

    it("handle_drag_start sets drag_id and rect", () => {
        const { result } = render_dnd(["claude", "codex"], undefined, "overview");
        const rect = { top: 0, left: 0, height: 10, width: 10 } as DOMRect;
        act(() => {
            result.current.handlers.handle_drag_start("claude", rect);
        });
        expect(result.current.handlers.drag_id).toBe("claude");
    });

    it("handle_drag_enter sets over_id for different provider", () => {
        const { result } = render_dnd(["claude", "codex"], undefined, "overview");
        act(() => {
            result.current.handlers.handle_drag_start("claude");
        });
        act(() => {
            result.current.handlers.handle_drag_enter("codex");
        });
        expect(result.current.handlers.over_id).toBe("codex");
    });

    it("handle_drag_enter ignores same provider", () => {
        const { result } = render_dnd(["claude", "codex"], undefined, "overview");
        act(() => {
            result.current.handlers.handle_drag_start("claude");
        });
        act(() => {
            result.current.handlers.handle_drag_enter("claude");
        });
        expect(result.current.handlers.over_id).toBeNull();
    });

    it("handle_drag_end clears drag state", () => {
        const { result } = render_dnd(["claude", "codex"], undefined, "overview");
        act(() => {
            result.current.handlers.handle_drag_start("claude");
        });
        act(() => {
            result.current.handlers.handle_drag_end();
        });
        expect(result.current.handlers.drag_id).toBeNull();
        expect(result.current.handlers.over_id).toBeNull();
    });

    it("handle_drag_over reorders provider on x-axis same-row drag past midpoint", () => {
        // same row (|top diff| < height/2) → axis x; pointer past midpoint → swap
        const { result } = render_dnd(["claude", "codex"], undefined, "overview");
        const drag_rect = { top: 0, left: 0, height: 100, width: 100 } as DOMRect;
        const over_rect = { top: 10, left: 0, height: 100, width: 100 } as DOMRect;
        act(() => {
            result.current.handlers.handle_drag_start("claude", drag_rect);
        });
        act(() => {
            // middle_x = 0 + 100/2 = 50; pointer_x=80 >= 50 → reorder
            result.current.handlers.handle_drag_over("codex", 80, 50, over_rect);
        });
        expect(result.current.provider_order).toEqual(["codex", "claude"]);
        expect(result.current.handlers.over_id).toBe("codex");
    });

    it("handle_drag_over does not reorder on y-axis before midpoint", () => {
        // different row (|0-200|=200 >= height/2=50) → axis y; pointer before mid → null
        const { result } = render_dnd(["claude", "codex"], undefined, "overview");
        const drag_rect = { top: 0, left: 0, height: 100, width: 100 } as DOMRect;
        const over_rect = { top: 200, left: 0, height: 100, width: 100 } as DOMRect;
        act(() => {
            result.current.handlers.handle_drag_start("claude", drag_rect);
        });
        act(() => {
            // middle_y = 200 + 100/2 = 250; pointer_y=210 < 250, from<to → null
            result.current.handlers.handle_drag_over("codex", 50, 210, over_rect);
        });
        expect(result.current.provider_order).toEqual(["claude", "codex"]);
    });

    it("account drag enter reorders accounts in active group", () => {
        const { result } = render_dnd(["claude"], mock_group, "claude");
        // drag a1 onto a3
        act(() => {
            result.current.handlers.handle_account_drag_start("a1");
        });
        act(() => {
            result.current.handlers.handle_account_drag_enter("a3");
        });
        // baseIds = [a1, a2, a3]; move a1 (index 0) to a3 position (index 2)
        // splice(0,1) -> [a2, a3]; splice(2,0,"a1") -> [a2, a3, a1]
        expect(result.current.account_orders).toEqual({ claude: ["a2", "a3", "a1"] });
        expect(result.current.handlers.account_over_id).toBe("a3");
    });

    it("account drag enter without activeGroup only sets over_id", () => {
        const { result } = render_dnd(["claude"], undefined, "overview");
        act(() => {
            result.current.handlers.handle_account_drag_start("a1");
        });
        act(() => {
            result.current.handlers.handle_account_drag_enter("a3");
        });
        expect(result.current.account_orders).toEqual({});
        expect(result.current.handlers.account_over_id).toBe("a3");
    });

    it("account drag end clears account drag state", () => {
        const { result } = render_dnd(["claude"], mock_group, "claude");
        act(() => {
            result.current.handlers.handle_account_drag_start("a1");
        });
        act(() => {
            result.current.handlers.handle_account_drag_end();
        });
        expect(result.current.handlers.account_drag_id).toBeNull();
        expect(result.current.handlers.account_over_id).toBeNull();
    });
});
