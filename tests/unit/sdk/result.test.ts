import { describe, it, expect } from "vitest";
import { ok, fail } from "../../../src/plugins/sdk/result";

describe("ok", () => {
    it("returns success output with auto-generated updatedAt", () => {
        const result = ok({ items: [] });
        expect(result.success).toBe(true);
        expect(result.schemaVersion).toBe(2);
        expect(result.updatedAt).toBeTruthy();
        expect(result.items).toEqual([]);
    });

    it("allows updatedAt override", () => {
        const result = ok({ items: [], updatedAt: "2026-01-01T00:00:00Z" });
        expect(result.updatedAt).toBe("2026-01-01T00:00:00Z");
    });
});

describe("fail", () => {
    it("returns failure output", () => {
        const result = fail("AUTH_FAILED", "Invalid key");
        expect(result.success).toBe(false);
        expect(result.error).toEqual({ code: "AUTH_FAILED", message: "Invalid key" });
    });
});
