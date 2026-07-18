import { describe, it, expect } from "vitest";
import { filtered } from "../../../../../src/renderer/lib/token-stats/filter";
import type { AgentSessionUsage } from "../../../../../src/shared/types/token-stats";

function record(overrides: Partial<AgentSessionUsage> = {}): AgentSessionUsage {
    return {
        session_id: "s1",
        title: null,
        directory: null,
        slug: null,
        version: null,
        parent_session_id: null,
        message_id: "m1",
        role: "assistant",
        timestamp: 1000,
        model: "claude-sonnet-4",
        input_tokens: 10,
        output_tokens: 5,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        agent: "claude-code",
        ...overrides,
    };
}

describe("filtered", () => {
    it("returns records within the time range", () => {
        const records = [
            record({ timestamp: 500 }),
            record({ timestamp: 1500 }),
            record({ timestamp: 2500 }),
        ];
        expect(filtered(records, { agent: "all", start: 1000, end: 2000 })).toHaveLength(1);
    });

    it("includes boundaries", () => {
        const records = [record({ timestamp: 1000 }), record({ timestamp: 2000 })];
        expect(filtered(records, { agent: "all", start: 1000, end: 2000 })).toHaveLength(2);
    });

    it("filters by agent", () => {
        const records = [
            record({ agent: "claude-code", message_id: "c1" }),
            record({ agent: "opencode", message_id: "o1" }),
        ];
        expect(
            filtered(records, { agent: "claude-code", start: 0, end: 9999 }).map(
                (r) => r.message_id,
            ),
        ).toEqual(["c1"]);
        expect(
            filtered(records, { agent: "opencode", start: 0, end: 9999 }).map((r) => r.message_id),
        ).toEqual(["o1"]);
    });

    it("combines agent and time filters", () => {
        const records = [
            record({ agent: "claude-code", timestamp: 500, message_id: "c-old" }),
            record({ agent: "claude-code", timestamp: 1500, message_id: "c-new" }),
            record({ agent: "opencode", timestamp: 1500, message_id: "o-new" }),
        ];
        const result = filtered(records, { agent: "claude-code", start: 1000, end: 2000 });
        expect(result.map((r) => r.message_id)).toEqual(["c-new"]);
    });
});
