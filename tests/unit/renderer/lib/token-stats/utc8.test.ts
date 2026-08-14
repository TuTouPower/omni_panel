import { describe, expect, it } from "vitest";
import {
    UTC8_OFFSET_MS,
    utc8_day_start,
    utc8_hour_start,
    utc8_next_day,
    utc8_next_hour,
    utc8_date_str,
    utc8_hour,
    utc8_weekday,
} from "../../../../../src/renderer/lib/token-stats/utc8";

// 固定 UTC 参考点：2026-08-13T00:00:00Z = UTC+8 的 08:00。
const TS = Date.UTC(2026, 7, 13, 0, 0, 0);

describe("utc8 helpers（t348）", () => {
    it("utc8_day_start 对齐 UTC+8 日界", () => {
        // 2026-08-12T20:00Z 已是 UTC+8 的 08-13 04:00 → 日界 2026-08-12T16:00Z。
        expect(utc8_day_start(Date.UTC(2026, 7, 12, 20, 0, 0))).toBe(
            Date.UTC(2026, 7, 12, 16, 0, 0),
        );
        // 2026-08-12T16:00Z 恰是 UTC+8 日界。
        expect(utc8_day_start(Date.UTC(2026, 7, 12, 16, 0, 0))).toBe(
            Date.UTC(2026, 7, 12, 16, 0, 0),
        );
    });

    it("utc8_hour_start 对齐 UTC+8 整点", () => {
        expect(utc8_hour_start(Date.UTC(2026, 7, 13, 0, 30, 0))).toBe(
            Date.UTC(2026, 7, 13, 0, 0, 0),
        );
    });

    it("utc8_date_str 按 UTC+8 归日", () => {
        // 2026-08-12T20:00Z → UTC+8 04:00（08-13）。
        expect(utc8_date_str(Date.UTC(2026, 7, 12, 20, 0, 0))).toBe("2026-08-13");
        expect(utc8_date_str(Date.UTC(2026, 7, 12, 16, 0, 0))).toBe("2026-08-13");
        expect(utc8_date_str(Date.UTC(2026, 7, 12, 15, 59, 59))).toBe("2026-08-12");
    });

    it("utc8_hour 按 UTC+8 取小时", () => {
        expect(utc8_hour(Date.UTC(2026, 7, 13, 0, 0, 0))).toBe(8);
        expect(utc8_hour(Date.UTC(2026, 7, 13, 16, 0, 0))).toBe(0);
    });

    it("utc8_weekday 按 UTC+8 取星期", () => {
        // 2026-08-13 是周四（getDay=4）。UTC 00:00 的 UTC+8 是周四 08:00。
        expect(utc8_weekday(TS)).toBe(4);
    });

    it("边界：utc8_next_day/hour 相对 start 递进", () => {
        const day = utc8_day_start(TS);
        expect(utc8_next_day(day)).toBe(day + 86_400_000);
        const hour = utc8_hour_start(TS);
        expect(utc8_next_hour(hour)).toBe(hour + 3_600_000);
    });

    it("UTC8_OFFSET_MS 为 8 小时", () => {
        expect(UTC8_OFFSET_MS).toBe(8 * 60 * 60 * 1000);
    });
});
