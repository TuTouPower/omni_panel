import { describe, expect, it } from "vitest";

import { format_reset_time, relative_time } from "../../../../src/renderer/lib/utils";

describe("format_reset_time", () => {
    it("returns -- for falsy or invalid input", () => {
        expect(format_reset_time("")).toBe("--");
        expect(format_reset_time(NaN)).toBe("--");
        expect(format_reset_time("invalid-date")).toBe("--");
        expect(format_reset_time(0)).toBe("--");
    });

    it("formats today reset time correctly", () => {
        const now = new Date();
        now.setHours(14, 30, 0, 0);
        expect(format_reset_time(now.getTime())).toBe("今天 14:30");
    });
});

describe("relative_time", () => {
    it("returns empty string for invalid timestamp", () => {
        expect(relative_time("")).toBe("");
        expect(relative_time("invalid")).toBe("");
        expect(relative_time(NaN)).toBe("");
    });
});
