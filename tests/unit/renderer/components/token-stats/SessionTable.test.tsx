import { describe, it, expect } from "vitest";
import { agentDisplayLabel } from "../../../../../src/renderer/lib/token-stats/chart-data";
import { sortSessionRows } from "../../../../../src/renderer/components/token-stats/SessionTable";

function row(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        session_id: "s1",
        title: "t",
        slug: null,
        directory: "/a",
        agent: "claude-code",
        version: null,
        sub: false,
        models: ["m"],
        calls: 1,
        tokens: 1,
        cacheRate: 0,
        lastTs: 0,
        ...overrides,
    };
}

describe("SessionTable", () => {
    describe("agentDisplayLabel (t448 AC-001)", () => {
        it("codex 显示 Codex，不再兜底 OpenCode", () => {
            expect(agentDisplayLabel("codex")).toBe("Codex");
        });

        it("既有 agent 文案不变", () => {
            expect(agentDisplayLabel("claude-code")).toBe("Claude Code");
            expect(agentDisplayLabel("kimi-code")).toBe("Kimi Code");
            expect(agentDisplayLabel("grok")).toBe("Grok");
            expect(agentDisplayLabel("opencode")).toBe("OpenCode");
        });
    });

    describe("sortSessionRows", () => {
        it("sorts by numeric keys descending by default", () => {
            const rows = [row({ tokens: 10 }), row({ tokens: 30 }), row({ tokens: 20 })];
            const sorted = sortSessionRows(rows, "tokens", -1);
            expect(sorted.map((r) => r.tokens)).toEqual([30, 20, 10]);
        });

        it("reverses direction when dir is 1", () => {
            const rows = [row({ tokens: 10 }), row({ tokens: 30 }), row({ tokens: 20 })];
            const sorted = sortSessionRows(rows, "tokens", 1);
            expect(sorted.map((r) => r.tokens)).toEqual([10, 20, 30]);
        });

        it("sorts string keys alphabetically", () => {
            const rows = [row({ title: "b" }), row({ title: "a" }), row({ title: "c" })];
            const sorted = sortSessionRows(rows, "title", -1);
            expect(sorted.map((r) => r.title)).toEqual(["c", "b", "a"]);
        });
    });
});
