import { describe, it, expect } from "vitest";
import {
    isFinitePositiveNumber,
    isFinitePositiveNumberWithMax,
    parseSizeReport,
} from "../../../src/main/ipc/size-validation";

describe("isFinitePositiveNumber", () => {
    it("accepts zero", () => {
        expect(isFinitePositiveNumber(0)).toBe(true);
    });
    it("accepts positive numbers", () => {
        expect(isFinitePositiveNumber(42)).toBe(true);
        expect(isFinitePositiveNumber(0.5)).toBe(true);
    });
    it("rejects negative", () => {
        expect(isFinitePositiveNumber(-1)).toBe(false);
    });
    it("rejects Infinity", () => {
        expect(isFinitePositiveNumber(Infinity)).toBe(false);
    });
    it("rejects NaN", () => {
        expect(isFinitePositiveNumber(NaN)).toBe(false);
    });
    it("rejects non-numbers", () => {
        expect(isFinitePositiveNumber("42")).toBe(false);
        expect(isFinitePositiveNumber(null)).toBe(false);
        expect(isFinitePositiveNumber(undefined)).toBe(false);
    });
});

describe("isFinitePositiveNumberWithMax", () => {
    it("accepts values within max", () => {
        expect(isFinitePositiveNumberWithMax(500, 1000)).toBe(true);
    });
    it("accepts value equal to max", () => {
        expect(isFinitePositiveNumberWithMax(1000, 1000)).toBe(true);
    });
    it("rejects values exceeding max", () => {
        expect(isFinitePositiveNumberWithMax(1001, 1000)).toBe(false);
    });
});

describe("parseSizeReport", () => {
    it("parses valid payload with all fields", () => {
        const result = parseSizeReport({ content_height: 400, collapsed_min_height: 100 }, [
            "content_height",
            "collapsed_min_height",
        ]);
        expect(result).toEqual({ content_height: 400, collapsed_min_height: 100 });
    });

    it("returns null for non-object input", () => {
        expect(parseSizeReport(null, ["field"])).toBeNull();
        expect(parseSizeReport("string", ["field"])).toBeNull();
        expect(parseSizeReport(42, ["field"])).toBeNull();
    });

    it("returns null when required field is missing", () => {
        expect(parseSizeReport({ content_height: 400 }, ["content_height", "missing"])).toBeNull();
    });

    it("returns null when field value is not a number", () => {
        expect(parseSizeReport({ content_height: "not-a-number" }, ["content_height"])).toBeNull();
    });

    it("returns null when value exceeds max", () => {
        expect(parseSizeReport({ content_height: 10001 }, ["content_height"], 10000)).toBeNull();
    });

    it("accepts values within max", () => {
        expect(parseSizeReport({ content_height: 9999 }, ["content_height"], 10000)).toEqual({
            content_height: 9999,
        });
    });

    it("accepts value equal to max", () => {
        expect(parseSizeReport({ content_height: 10000 }, ["content_height"], 10000)).toEqual({
            content_height: 10000,
        });
    });

    it("returns null for negative values", () => {
        expect(parseSizeReport({ content_height: -1 }, ["content_height"])).toBeNull();
    });
});
