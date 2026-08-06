import { describe, expect, it } from "vitest";
import {
    is_near_bottom,
    message_counts,
    should_insert_divider,
    summarize,
} from "../../../../src/renderer/lib/workspace/pane";

/**
 * t225 pane 纯函数测试：时间分隔线判定、大纲摘要、消息计数。
 */

describe("should_insert_divider", () => {
    it("时间差超 10 分钟插分隔线", () => {
        expect(should_insert_divider(0, 11 * 60 * 1000)).toBe(true);
        expect(should_insert_divider(0, 10 * 60 * 1000 + 1)).toBe(true);
    });

    it("时间差 ≤ 10 分钟不插", () => {
        expect(should_insert_divider(0, 10 * 60 * 1000)).toBe(false);
        expect(should_insert_divider(1000, 1000 + 5 * 60 * 1000)).toBe(false);
    });

    it("任一时间缺失不插（避免误插分隔线）", () => {
        expect(should_insert_divider(null, 1000)).toBe(false);
        expect(should_insert_divider(0, null)).toBe(false);
        expect(should_insert_divider(null, null)).toBe(false);
    });

    it("时间倒序不插", () => {
        expect(should_insert_divider(1000, 500)).toBe(false);
    });
});

describe("summarize", () => {
    it("截断到 max 并加省略号", () => {
        expect(summarize("一二三四五六", 4)).toBe("一二三…");
        expect(summarize("short", 10)).toBe("short");
    });

    it("压缩空白与换行", () => {
        expect(summarize("a\nb\t c", 10)).toBe("a b c");
        expect(summarize("  你好  世界  ", 10)).toBe("你好 世界");
    });

    it("空文本返回占位", () => {
        expect(summarize("")).toBe("(空)");
        expect(summarize("   ")).toBe("(空)");
    });
});

describe("message_counts", () => {
    it("统计 user/assistant 数量", () => {
        const messages = [
            { id: "1", role: "user" as const, text: "a", timestamp: 1 },
            { id: "2", role: "assistant" as const, text: "b", timestamp: 2 },
            { id: "3", role: "user" as const, text: "c", timestamp: 3 },
        ];
        expect(message_counts(messages)).toEqual({ user: 2, assistant: 1 });
    });

    it("空列表返回零", () => {
        expect(message_counts([])).toEqual({ user: 0, assistant: 0 });
    });
});

describe("is_near_bottom", () => {
    it("距底小于阈值视为在底部", () => {
        expect(is_near_bottom(0, 1000, 900)).toBe(true);
        expect(is_near_bottom(100, 1000, 900)).toBe(true);
        expect(is_near_bottom(119, 1000, 900)).toBe(true);
    });

    it("距底超过阈值视为滚离底部", () => {
        expect(is_near_bottom(200, 2000, 900)).toBe(false);
        expect(is_near_bottom(500, 1600, 400)).toBe(false);
    });

    it("scrollTop 超滚动范围视为在底部（浏览器 clamp）", () => {
        expect(is_near_bottom(500, 1000, 900)).toBe(true);
    });

    it("内容不满一屏时恒为在底部", () => {
        expect(is_near_bottom(0, 300, 900)).toBe(true);
    });
});
