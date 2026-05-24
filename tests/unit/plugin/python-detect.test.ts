import { describe, it, expect } from "vitest";
import { findPython } from "../../../src/main/core/plugin/python-detect";

describe("findPython", () => {
    it("returns a python command string", async () => {
        const result = await findPython();
        expect(typeof result).toBe("string");
        expect(result.length).toBeGreaterThan(0);
    });
});
