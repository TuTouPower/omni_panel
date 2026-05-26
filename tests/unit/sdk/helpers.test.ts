import { describe, it, expect } from "vitest";
import {
    statusFor,
    colorFor,
    colorForPct,
    makeTranslator,
    numeric,
} from "../../../src/plugins/sdk/helpers";

describe("statusFor", () => {
    it("returns critical at 90%", () => {
        expect(statusFor(90, 100)).toBe("critical");
    });
    it("returns warning at 75%", () => {
        expect(statusFor(75, 100)).toBe("warning");
    });
    it("returns normal below 75%", () => {
        expect(statusFor(50, 100)).toBe("normal");
    });
    it("handles zero limit", () => {
        expect(statusFor(0, 0)).toBe("normal");
    });
});

describe("colorFor", () => {
    it("returns red at 90%", () => {
        expect(colorFor(90, 100)).toBe("red");
    });
    it("returns orange at 80%", () => {
        expect(colorFor(80, 100)).toBe("orange");
    });
    it("returns yellow at 60%", () => {
        expect(colorFor(60, 100)).toBe("yellow");
    });
    it("returns blue below 60%", () => {
        expect(colorFor(30, 100)).toBe("blue");
    });
});

describe("colorForPct", () => {
    it("returns red at 90%", () => {
        expect(colorForPct(90)).toBe("red");
    });
    it("returns orange at 80%", () => {
        expect(colorForPct(80)).toBe("orange");
    });
    it("returns yellow at 60%", () => {
        expect(colorForPct(60)).toBe("yellow");
    });
    it("returns blue below 60%", () => {
        expect(colorForPct(30)).toBe("blue");
    });
});

describe("makeTranslator", () => {
    it("merges common translations", () => {
        const t = makeTranslator({});
        expect(t("zh-Hans", "missing_api_key")).toBeTruthy();
    });
    it("supports kwargs interpolation", () => {
        const t = makeTranslator({ msg: { "zh-Hans": "code={code}", en: "code={code}" } });
        expect(t("en", "msg", { code: 500 })).toBe("code=500");
    });
    it("returns key when translation missing", () => {
        const t = makeTranslator({});
        expect(t("en", "unknown_key")).toBe("unknown_key");
    });
});

describe("numeric", () => {
    it("returns number as-is", () => {
        expect(numeric(42)).toBe(42);
    });
    it("parses string number", () => {
        expect(numeric("3.14")).toBeCloseTo(3.14);
    });
    it("returns 0 for NaN", () => {
        expect(numeric("abc")).toBe(0);
    });
    it("returns 0 for null/undefined", () => {
        expect(numeric(null)).toBe(0);
    });
});
