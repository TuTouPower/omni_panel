import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ProviderUsageGroup } from "../../../../src/renderer/lib/provider-usage";
import { use_popup_derived } from "../../../../src/renderer/hooks/use_popup_derived";

const { mock_groups } = vi.hoisted(() => {
    function make_account(id: string): ProviderUsageGroup["accounts"][number] {
        return {
            id,
            sourceInstanceId: "src-1",
            accountId: id,
            accountLabel: id,
            status: "normal",
            updatedAt: "",
            observedAt: 0,
            stale: false,
            periods: [],
        };
    }
    const groups: ProviderUsageGroup[] = [
        {
            provider: "claude",
            label: "Claude",
            accountCount: 2,
            status: "normal",
            updatedAt: "",
            observedAt: 0,
            stale: false,
            periods: [],
            accounts: [make_account("a1"), make_account("a2")],
        },
        {
            provider: "codex",
            label: "Codex",
            accountCount: 1,
            status: "normal",
            updatedAt: "",
            observedAt: 0,
            stale: false,
            periods: [],
            accounts: [make_account("c1")],
        },
    ];
    return { mock_groups: groups };
});

vi.mock("../../../../src/renderer/lib/provider-usage", async (importOriginal) => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- importOriginal is `any`; cast to a spreadable shape for the partial override
    const actual = (await importOriginal()) as Record<string, unknown>;
    return {
        ...actual,
        build_provider_usage_groups: () => mock_groups,
    };
});

function render_derived(overrides: Partial<Parameters<typeof use_popup_derived>[0]> = {}) {
    return renderHook(() =>
        use_popup_derived({
            plugins: [],
            account_overrides: undefined,
            account_labels: undefined,
            upcoming_reset_threshold_percent: null,
            provider_order: [],
            active_tab: "overview",
            account_orders: {},
            ...overrides,
        }),
    );
}

describe("use_popup_derived", () => {
    it("visibleProviders follows PROVIDER_ORDER when no persisted order", () => {
        const { result } = render_derived();
        // claude before codex per PROVIDER_ORDER
        expect(result.current.visibleProviders).toEqual(["claude", "codex"]);
        // no provider_order → orderedProviders equals visibleProviders
        expect(result.current.orderedProviders).toEqual(["claude", "codex"]);
    });

    it("orderedProviders applies persisted provider_order first", () => {
        const { result } = render_derived({ provider_order: ["codex", "claude"] });
        expect(result.current.orderedProviders).toEqual(["codex", "claude"]);
    });

    it("orderedProviders appends unknown visible providers after persisted ones", () => {
        // persisted only has codex; claude is visible but not in persisted → appended
        const { result } = render_derived({ provider_order: ["codex"] });
        expect(result.current.orderedProviders).toEqual(["codex", "claude"]);
    });

    it("activeGroup is undefined on overview tab", () => {
        const { result } = render_derived({ active_tab: "overview" });
        expect(result.current.activeGroup).toBeUndefined();
        expect(result.current.orderedActiveGroup).toBeUndefined();
    });

    it("activeGroup resolves to the active tab's group", () => {
        const { result } = render_derived({ active_tab: "claude" });
        expect(result.current.activeGroup?.provider).toBe("claude");
        // no account_orders → orderedActiveGroup equals activeGroup
        expect(result.current.orderedActiveGroup).toBe(result.current.activeGroup);
    });

    it("orderedActiveGroup reorders accounts by account_orders", () => {
        const { result } = render_derived({
            active_tab: "claude",
            account_orders: { claude: ["a2", "a1"] },
        });
        const ordered = result.current.orderedActiveGroup;
        expect(ordered?.accounts.map((a) => a.id)).toEqual(["a2", "a1"]);
    });

    it("orderedActiveGroup appends accounts missing from order", () => {
        // order only lists a2; a1 missing → appended after
        const { result } = render_derived({
            active_tab: "claude",
            account_orders: { claude: ["a2"] },
        });
        expect(result.current.orderedActiveGroup?.accounts.map((a) => a.id)).toEqual(["a2", "a1"]);
    });

    it("upcomingItems is empty when threshold is null", () => {
        const { result } = render_derived({ upcoming_reset_threshold_percent: null });
        expect(result.current.upcomingItems).toEqual([]);
    });
});
