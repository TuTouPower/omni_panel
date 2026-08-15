import { describe, expect, it } from "vitest";
import { clamp_search_content_range } from "../../../../../src/main/core/session-history/search_content_range";

describe("clamp_search_content_range (t404)", () => {
    it("省略 limit 时从 offset 扫到末尾且 done=true", () => {
        expect(clamp_search_content_range(100)).toEqual({
            offset: 0,
            end: 100,
            scanned: 100,
            total: 100,
            done: true,
            next_offset: 100,
        });
        expect(clamp_search_content_range(100, 40)).toEqual({
            offset: 40,
            end: 100,
            scanned: 100,
            total: 100,
            done: true,
            next_offset: 100,
        });
    });

    it("有 limit 时返回本批区间与 progress 字段", () => {
        expect(clamp_search_content_range(100, 0, 64)).toEqual({
            offset: 0,
            end: 64,
            scanned: 64,
            total: 100,
            done: false,
            next_offset: 64,
        });
        expect(clamp_search_content_range(100, 64, 64)).toEqual({
            offset: 64,
            end: 100,
            scanned: 100,
            total: 100,
            done: true,
            next_offset: 100,
        });
    });

    it("offset 越界或非法时钳制到 [0, total]", () => {
        expect(clamp_search_content_range(10, -5, 3).offset).toBe(0);
        expect(clamp_search_content_range(10, 99, 3)).toEqual({
            offset: 10,
            end: 10,
            scanned: 10,
            total: 10,
            done: true,
            next_offset: 10,
        });
    });

    it("total=0 时 done=true", () => {
        expect(clamp_search_content_range(0, 0, 64).done).toBe(true);
        expect(clamp_search_content_range(0).scanned).toBe(0);
    });
});
