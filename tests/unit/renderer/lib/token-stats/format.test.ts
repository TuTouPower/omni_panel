import { describe, it, expect } from "vitest";
import {
    fmtInt,
    fmtRelativeTime,
    fmtTime,
    fmtTok,
    shortDir,
    toLocalInput,
} from "../../../../../src/renderer/lib/token-stats/format";

describe("format", () => {
    describe("fmtTok", () => {
        it("formats small numbers as plain integers", () => {
            expect(fmtTok(0)).toBe("0");
            expect(fmtTok(999)).toBe("999");
        });

        it("uses K/M/B suffixes with one decimal", () => {
            expect(fmtTok(1000)).toBe("1.0K");
            expect(fmtTok(1500)).toBe("1.5K");
            expect(fmtTok(999999)).toBe("999.9K");
            expect(fmtTok(1000000)).toBe("1.0M");
            expect(fmtTok(2259000)).toBe("2.2M");
            expect(fmtTok(1000000000)).toBe("1.0B");
            expect(fmtTok(2259000000)).toBe("2.2B");
        });

        it("truncates (not rounds) to one decimal", () => {
            expect(fmtTok(2599)).toBe("2.5K");
        });
    });

    describe("fmtInt", () => {
        it("uses locale separators", () => {
            expect(fmtInt(0)).toBe("0");
            expect(fmtInt(1000)).toBe("1,000");
            expect(fmtInt(1234567)).toBe("1,234,567");
        });
    });

    describe("fmtTime", () => {
        it("labels today and yesterday with time", () => {
            const now = new Date();
            const todayTs = new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate(),
                14,
                5,
            ).getTime();
            const yesterdayTs = new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate() - 1,
                9,
                30,
            ).getTime();
            expect(fmtTime(todayTs)).toMatch(/^今天 14:05$/);
            expect(fmtTime(yesterdayTs)).toMatch(/^昨天 09:30$/);
        });

        it("labels older dates with month/day and time", () => {
            const ts = new Date("2026-07-10T08:30:00").getTime();
            expect(fmtTime(ts)).toMatch(/^7\/10 08:30$/);
        });
    });

    describe("toLocalInput", () => {
        it("returns datetime-local compatible string", () => {
            const ts = new Date("2026-07-10T08:30:00").getTime();
            expect(toLocalInput(ts)).toBe("2026-07-10T08:30");
        });
    });

    describe("fmtRelativeTime", () => {
        it("returns friendly relative labels", () => {
            expect(fmtRelativeTime(0)).toBe("刚刚");
            expect(fmtRelativeTime(30_000)).toBe("刚刚");
            expect(fmtRelativeTime(60_000)).toBe("1 分钟前");
            expect(fmtRelativeTime(59 * 60_000)).toBe("59 分钟前");
            expect(fmtRelativeTime(60 * 60_000)).toBe("1 小时前");
            expect(fmtRelativeTime(23 * 60 * 60_000)).toBe("23 小时前");
            expect(fmtRelativeTime(24 * 60 * 60_000)).toBe("1 天前");
        });
    });

    describe("shortDir", () => {
        it("returns '(unknown)' for null", () => {
            expect(shortDir(null)).toBe("(unknown)");
        });

        it("returns basename for paths", () => {
            expect(shortDir("/home/user/proj")).toBe("proj");
            expect(shortDir("C:\\Users\\dev\\app")).toBe("app");
        });

        it("truncates long basenames", () => {
            expect(shortDir("/a/verylongbasenameoverflow")).toBe("verylongbasenam…");
        });
    });
});
