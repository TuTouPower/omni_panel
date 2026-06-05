import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { relative_time } from "../../../src/renderer/lib/utils";

describe("relative_time", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("returns '刚刚' for timestamps less than 10 seconds ago", () => {
        const now = new Date("2026-01-01T12:00:00Z");
        vi.setSystemTime(now);
        expect(relative_time("2026-01-01T11:59:55Z")).toBe("刚刚");
        expect(relative_time("2026-01-01T12:00:00Z")).toBe("刚刚");
        expect(relative_time("2026-01-01T11:59:51Z")).toBe("刚刚");
    });

    it("returns seconds for < 1 minute", () => {
        const now = new Date("2026-01-01T12:00:00Z");
        vi.setSystemTime(now);
        expect(relative_time("2026-01-01T11:59:50Z")).toBe("10 秒前");
        expect(relative_time("2026-01-01T11:59:30Z")).toBe("30 秒前");
        expect(relative_time("2026-01-01T11:59:01Z")).toBe("59 秒前");
    });

    it("returns minutes for < 1 hour", () => {
        const now = new Date("2026-01-01T12:00:00Z");
        vi.setSystemTime(now);
        expect(relative_time("2026-01-01T11:59:00Z")).toBe("1 分钟前");
        expect(relative_time("2026-01-01T11:30:00Z")).toBe("30 分钟前");
        expect(relative_time("2026-01-01T11:01:00Z")).toBe("59 分钟前");
    });

    it("returns hours for < 1 day", () => {
        const now = new Date("2026-01-01T12:00:00Z");
        vi.setSystemTime(now);
        expect(relative_time("2026-01-01T11:00:00Z")).toBe("1 小时前");
        expect(relative_time("2026-01-01T00:00:00Z")).toBe("12 小时前");
    });

    it("returns days for >= 1 day", () => {
        const now = new Date("2026-01-05T12:00:00Z");
        vi.setSystemTime(now);
        expect(relative_time("2026-01-04T12:00:00Z")).toBe("1 天前");
        expect(relative_time("2026-01-03T12:00:00Z")).toBe("2 天前");
    });

    it("returns '刚刚' for future timestamps", () => {
        const now = new Date("2026-01-01T12:00:00Z");
        vi.setSystemTime(now);
        expect(relative_time("2026-01-01T13:00:00Z")).toBe("刚刚");
    });
});
