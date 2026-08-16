import { describe, expect, it } from "vitest";
import {
    compute_message_offsets,
    compute_visible_window,
    format_compact_datetime,
    format_precise_datetime,
    is_near_bottom,
    last_dir_segment,
    message_counts,
    should_insert_divider,
    summarize,
} from "../../../../../src/renderer/lib/workspace/pane";

/** t237 pane 纯函数单测：时间分隔线、摘要、计数、虚拟窗口计算。t257 加目录末级与精确时间。t407 加紧凑时间。 */

describe("pane helpers (t225/t237)", () => {
    it("should_insert_divider：相邻消息跨度超 10 分钟才插", () => {
        expect(should_insert_divider(0, 9 * 60 * 1000)).toBe(false);
        expect(should_insert_divider(0, 11 * 60 * 1000)).toBe(true);
        expect(should_insert_divider(null, 0)).toBe(false);
        expect(should_insert_divider(0, null)).toBe(false);
    });

    it("summarize：压缩空白并截断", () => {
        expect(summarize("  多行\n\n  文本  ")).toBe("多行 文本");
        expect(summarize("", 10)).toBe("(空)");
        expect(summarize("a".repeat(50), 10)).toBe("aaaaaaaaa…");
    });

    it("message_counts：按 role 统计", () => {
        const messages = [
            { id: "1", role: "user", text: "a", timestamp: 0 },
            { id: "2", role: "assistant", text: "b", timestamp: 0 },
            { id: "3", role: "user", text: "c", timestamp: 0 },
        ] as const;
        expect(message_counts(messages)).toEqual({ user: 2, assistant: 1 });
    });

    it("is_near_bottom：距底小于阈值返回 true", () => {
        expect(is_near_bottom(880, 1000, 100, 120)).toBe(true); // 20
        expect(is_near_bottom(800, 1000, 100, 120)).toBe(true); // 100
        expect(is_near_bottom(770, 1000, 100, 120)).toBe(false); // 130
    });

    describe("compute_message_offsets", () => {
        it("未测量时用估计高度", () => {
            const messages = [{ id: "a" }, { id: "b" }, { id: "c" }];
            expect(compute_message_offsets(messages, new Map(), 80)).toEqual([0, 80, 160, 240]);
        });

        it("已测量高度与估计高度混合", () => {
            const messages = [{ id: "a" }, { id: "b" }, { id: "c" }];
            const heights = new Map([
                ["a", 100],
                ["c", 50],
            ]);
            expect(compute_message_offsets(messages, heights, 80)).toEqual([0, 100, 180, 230]);
        });
    });

    describe("compute_visible_window", () => {
        function msgs(n: number) {
            return Array.from({ length: n }, (_, i) => ({ id: String(i + 1) }));
        }

        it("clientHeight <= 0 时返回完整范围", () => {
            const messages = msgs(10);
            const win = compute_visible_window(messages, 0, 0, new Map(), 80, 100);
            expect(win.start).toBe(0);
            expect(win.end).toBe(10);
            expect(win.top_spacer).toBe(0);
            expect(win.bottom_spacer).toBe(0);
            expect(win.total_height).toBe(800);
        });

        it("空消息返回空窗口", () => {
            const win = compute_visible_window([], 0, 500, new Map(), 80, 100);
            expect(win.start).toBe(0);
            expect(win.end).toBe(0);
            expect(win.total_height).toBe(0);
        });

        it("可视区与缓冲区计算正确", () => {
            // 20 条 * 80 = 1600，clientHeight=300，scrollTop=400，overscan=100
            const messages = msgs(20);
            const win = compute_visible_window(messages, 400, 300, new Map(), 80, 100);
            // viewport = [300, 800]
            // start: offsets[start+1] < 300 → start=3 (offsets[4]=320)
            // end:   offsets[end] < 800 → end=10 (offsets[10]=800 不满足，停于 10)
            expect(win.start).toBe(3);
            expect(win.end).toBe(10);
            expect(win.top_spacer).toBe(240);
            expect(win.bottom_spacer).toBe(800);
            expect(win.total_height).toBe(1600);
        });

        it("使用实际高度计算窗口", () => {
            const messages = msgs(5);
            const heights = new Map([
                ["1", 200],
                ["2", 50],
                ["3", 50],
                ["4", 50],
                ["5", 50],
            ]);
            const win = compute_visible_window(messages, 0, 100, heights, 80, 0);
            // offsets [0,200,250,300,350,400]; viewport [0,100]; start=0, end=1 (offsets[1]=200>=100)
            expect(win.start).toBe(0);
            expect(win.end).toBe(1);
            expect(win.total_height).toBe(400);
            expect(win.bottom_spacer).toBe(200);
        });
    });
});

describe("last_dir_segment (t257)", () => {
    it("POSIX 路径取末级", () => {
        expect(last_dir_segment("/home/user/proj")).toBe("proj");
        expect(last_dir_segment("/proj")).toBe("proj");
    });
    it("Windows 反斜杠路径取末级", () => {
        expect(last_dir_segment("D:\\Kar\\Code\\proj")).toBe("proj");
        expect(last_dir_segment("C:\\proj")).toBe("proj");
    });
    it("尾随斜杠剥离后取末级", () => {
        expect(last_dir_segment("/home/user/proj/")).toBe("proj");
        expect(last_dir_segment("D:\\Kar\\Code\\proj\\")).toBe("proj");
    });
    it("根目录 / 空返回原样", () => {
        expect(last_dir_segment("/")).toBe("/");
        expect(last_dir_segment("")).toBe("");
    });
});

describe("format_precise_datetime (t257)", () => {
    it("格式含年月日时分秒", () => {
        // 2026-08-07 09:08:07 (UTC+8 由本地时区决定；用本地 Date 构造避免时区依赖)。
        const d = new Date(2026, 7, 7, 9, 8, 7);
        expect(format_precise_datetime(d.getTime())).toBe("2026-08-07 09:08:07");
    });
});

describe("format_compact_datetime (t407)", () => {
    // now 固定 2026-08-16，本地构造避免时区依赖。
    const now = new Date(2026, 7, 16, 12, 0, 0).getTime();

    it("当年会话：MMDD HH:mm，不含年份与秒", () => {
        const d = new Date(2026, 7, 17, 23, 25, 59);
        expect(format_compact_datetime(d.getTime(), now)).toBe("0817 23:25");
    });

    it("非当年会话：YYMMDD HH:mm", () => {
        const d = new Date(2025, 7, 17, 23, 25, 0);
        expect(format_compact_datetime(d.getTime(), now)).toBe("250817 23:25");
    });

    it("跨年边界：当年 01-01 省略年，上年 12-31 带 YY", () => {
        const jan1 = new Date(2026, 0, 1, 0, 0, 0);
        const dec31 = new Date(2025, 11, 31, 23, 59, 0);
        expect(format_compact_datetime(jan1.getTime(), now)).toBe("0101 00:00");
        expect(format_compact_datetime(dec31.getTime(), now)).toBe("251231 23:59");
    });
});
