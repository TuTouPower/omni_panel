import { describe, expect, it } from "vitest";
import { observations_to_ready_state } from "../../../src/main/core/scheduler/observation-mapping";
import type { Observation } from "../../../src/shared/types/observation";

function obs(overrides: Partial<Observation> = {}): Observation {
    return {
        provider: "firecrawl",
        source_instance_id: "conn-a",
        account_id: "firecrawl",
        account_label: "Firecrawl",
        metric_id: "firecrawl:credits",
        raw_label: "credits",
        normalized_label: "Credits",
        used: 200,
        limit: 1000,
        display_style: "ratio",
        window: "month",
        reset_at: null,
        status: "normal",
        observed_at: 1780000000000,
        source: "poll",
        stale: false,
        last_error: null,
        ...overrides,
    };
}

describe("observations_to_ready_state", () => {
    it("maps observations to ready-state items + updatedAt", () => {
        const { items, updatedAt } = observations_to_ready_state([
            obs({ observed_at: 100 }),
            obs({ metric_id: "firecrawl:tokens", observed_at: 200 }),
        ]);
        expect(items).toHaveLength(2);
        expect(updatedAt).toEqual(new Date(200));
    });

    it("preserves the script-declared source (does not force non-CPA to poll)", () => {
        // Regression: hydrate used to derive source from manifest id, which
        // mislabelled mimo "session" data as "poll". The shared mapper uses
        // obs.source verbatim.
        const { items } = observations_to_ready_state([
            obs({ provider: "mimo", source: "session" }),
        ]);
        expect(items[0]?.source).toBe("session");
    });

    it("passes display_label through", () => {
        const { items } = observations_to_ready_state([obs({ display_label: "我的5h" })]);
        expect(items[0]?.display_label).toBe("我的5h");
    });

    it("drops observations with an invalid provider", () => {
        const { items } = observations_to_ready_state([
            obs({ provider: "not-a-real-vendor" as unknown as Observation["provider"] }),
            obs({ metric_id: "firecrawl:tokens" }),
        ]);
        expect(items).toHaveLength(1);
        expect(items[0]?.metric_id ?? items[0]?.id).toBeDefined();
    });

    it("returns an empty item set for no observations, with a fresh updatedAt", () => {
        const before = Date.now();
        const { items, updatedAt } = observations_to_ready_state([]);
        expect(items).toEqual([]);
        expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before);
    });
});
