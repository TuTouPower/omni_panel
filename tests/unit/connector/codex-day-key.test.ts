import { describe, expect, it } from "vitest";

/**
 * Unit tests for day_key logic extracted from connectors/codex/connector.ts.
 * The function cannot be imported directly (VM sandbox), so we test the
 * pure logic here to catch month off-by-1 and zero-padding bugs.
 *
 * MUST match the implementation in connectors/codex/connector.ts exactly.
 * If this test breaks after a connector change, update BOTH places.
 */
function day_key(ts_ms: number): string {
    const d = new Date(ts_ms);
    return `${String(d.getUTCFullYear())}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

describe("day_key", () => {
    it("formats January 15 with zero-padded month and day", () => {
        // 2026-01-15T10:00:00Z
        const ts = Date.UTC(2026, 0, 15, 10, 0, 0);
        expect(day_key(ts)).toBe("2026-01-15");
    });

    it("formats November 3 with zero-padded day", () => {
        // 2026-11-03T10:00:00Z
        const ts = Date.UTC(2026, 10, 3, 10, 0, 0);
        expect(day_key(ts)).toBe("2026-11-03");
    });

    it("formats December 31 correctly", () => {
        // 2026-12-31T23:59:59Z
        const ts = Date.UTC(2026, 11, 31, 23, 59, 59);
        expect(day_key(ts)).toBe("2026-12-31");
    });
});
