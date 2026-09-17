import { describe, expect, it } from "vitest";
import { format_local_iso, get_local_date_string } from "../../../src/shared/lib/local-time";

describe("local-time (t502 AC-001/003/005)", () => {
    it("get_local_date_string 与系统本地日期一致（非 UTC 切分）", () => {
        const now = new Date();
        const expected = `${now.getFullYear().toString().padStart(4, "0")}-${(now.getMonth() + 1).toString().padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")}`;
        expect(get_local_date_string(now)).toBe(expected);
        expect(get_local_date_string()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("format_local_iso 带本地时区偏移而非 Z", () => {
        const date = new Date(2026, 8, 18, 3, 23, 2, 416);
        const out = format_local_iso(date);
        const offset_min = -date.getTimezoneOffset();
        const sign = offset_min >= 0 ? "+" : "-";
        const abs = Math.abs(offset_min);
        const tz = `${sign}${Math.floor(abs / 60)
            .toString()
            .padStart(2, "0")}:${(abs % 60).toString().padStart(2, "0")}`;
        expect(out).toBe(`2026-09-18T03:23:02.416${tz}`);
        expect(out).toMatch(/[+-]\d{2}:\d{2}$/);
        expect(out).not.toMatch(/Z$/);
    });

    it("东西时区偏移与 getTimezoneOffset 自洽", () => {
        const date = new Date(2026, 0, 15, 12, 0, 0, 0);
        const out = format_local_iso(date);
        const offset_min = -date.getTimezoneOffset();
        const sign = offset_min >= 0 ? "+" : "-";
        const abs = Math.abs(offset_min);
        const tz = `${sign}${Math.floor(abs / 60)
            .toString()
            .padStart(2, "0")}:${(abs % 60).toString().padStart(2, "0")}`;
        expect(out.endsWith(tz)).toBe(true);
    });
});
