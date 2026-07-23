import { describe, it, expect } from "vitest";
import {
    status_for_pct,
    status_for_ratio,
    status_for_balance,
} from "../../../src/shared/lib/connector-thresholds";

describe("status_for_pct", () => {
    it("threshold boundaries 90/75", () => {
        expect(status_for_pct(90)).toBe("critical");
        expect(status_for_pct(89.9)).toBe("warning");
        expect(status_for_pct(75)).toBe("warning");
        expect(status_for_pct(74.9)).toBe("normal");
        expect(status_for_pct(0)).toBe("normal");
    });
});

describe("status_for_ratio", () => {
    it("threshold boundaries 0.9/0.75 + limit<=0 unknown", () => {
        expect(status_for_ratio(90, 100)).toBe("critical");
        expect(status_for_ratio(75, 100)).toBe("warning");
        expect(status_for_ratio(74, 100)).toBe("normal");
        expect(status_for_ratio(50, 0)).toBe("unknown");
        expect(status_for_ratio(50, -1)).toBe("unknown");
    });
});

describe("status_for_balance", () => {
    it("reversed boundaries 0.1/0.2 + limit<=0 unknown", () => {
        expect(status_for_balance(10, 100)).toBe("critical");
        expect(status_for_balance(20, 100)).toBe("warning");
        expect(status_for_balance(21, 100)).toBe("normal");
        expect(status_for_balance(50, 0)).toBe("unknown");
    });
});
