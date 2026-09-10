import { describe, expect, it } from "vitest";
import type { TokenStatsSession } from "../../../../src/shared/types/token-stats";
import {
    count_stats,
    filter_sessions,
    match_content,
    sort_sessions,
    time_filter_range,
    TIME_PRESET_WINDOW_MS,
    type LibrarySortDirection,
    type LibrarySortField,
} from "../../../../src/renderer/lib/session-library/filter";

/**
 * t227 会话库数据层纯函数测试。
 * 覆盖：agent 多选/时间范围交集/元信息搜索/排序/统计/内容匹配。
 */

const T0 = new Date("2026-07-10T08:00:00Z").getTime();

function sess(
    id: string,
    source: TokenStatsSession["source"],
    opts: Partial<TokenStatsSession> = {},
): TokenStatsSession {
    return {
        id,
        source,
        env: "linux",
        model: "model",
        title: `会话 ${id}`,
        directory: `/proj/${id}`,
        input_tokens: 100,
        output_tokens: 200,
        cache_read_tokens: 50,
        cache_write_tokens: 25,
        calls: 3,
        started_at: T0 + 1000,
        ended_at: T0 + 2000,
        ...opts,
    };
}

const SESSIONS = [
    sess("a", "claude_code", { calls: 5, ended_at: T0 + 3000, started_at: T0 + 1000 }),
    sess("b", "opencode", { calls: 2, ended_at: T0 + 1000, started_at: T0 + 100 }),
    sess("c", "grok", { calls: 9, ended_at: T0 + 2000, started_at: T0 + 500 }),
];

describe("filter_sessions (t227)", () => {
    it("agent 多选过滤", () => {
        const r = filter_sessions(SESSIONS, { agents: ["claude_code", "grok"] });
        expect(r.map((s) => s.id).sort()).toEqual(["a", "c"]);
    });

    it("空 agents 不过滤", () => {
        expect(filter_sessions(SESSIONS, { agents: [] })).toHaveLength(3);
    });

    it("时间范围交集：会话活动时间与范围有重叠才纳入", () => {
        // a(1000-3000) 与 c(500-2000) 均与 [1100,1900] 有交集，b(100-1000) 无。
        const r = filter_sessions(SESSIONS, { start_at: T0 + 1100, end_at: T0 + 1900 });
        expect(r.map((s) => s.id).sort()).toEqual(["a", "c"]);
    });

    it("元信息搜索匹配 title/directory/id", () => {
        const r = filter_sessions(SESSIONS, { search: "proj/a" });
        expect(r.map((s) => s.id)).toEqual(["a"]);
        const sc = filter_sessions(SESSIONS, { search: "会话 c" })[0];
        expect(sc?.id).toBe("c");
    });

    it("无过滤返回原样", () => {
        expect(filter_sessions(SESSIONS, {})).toHaveLength(3);
    });

    it("directories 精确匹配（OR），null 目录不命中", () => {
        const r = filter_sessions(SESSIONS, { directories: ["/proj/a", "/proj/c"] });
        expect(r.map((s) => s.id).sort()).toEqual(["a", "c"]);
        // 子串不命中（区别于旧 directory 子串参数）。
        expect(filter_sessions(SESSIONS, { directories: ["/proj/a/x"] })).toHaveLength(0);
        const with_null = sess("n", "grok", { directory: null });
        expect(filter_sessions([with_null], { directories: ["/proj/a"] })).toHaveLength(0);
    });
});

describe("match_content (t227)", () => {
    it("正文包含关键词命中", () => {
        expect(match_content("修复登录 bug 的报错", "登录")).toBe(true);
        expect(match_content("修复登录 bug", "token")).toBe(false);
    });

    it("忽略大小写", () => {
        expect(match_content("Fix Login Bug", "login")).toBe(true);
    });
});

describe("sort_sessions (t227)", () => {
    const fields: LibrarySortField[] = ["ended_at", "tokens", "calls", "title"];
    const directions: LibrarySortDirection[] = ["asc", "desc"];

    it("字段 + 方向排序生效", () => {
        expect(sort_sessions(SESSIONS, "ended_at", "desc")[0]?.id).toBe("a");
        expect(sort_sessions(SESSIONS, "ended_at", "asc")[0]?.id).toBe("b");
        // tokens 四维和：a=375, b=375, c=375（默认同值）→ 用不同 input 区分
        const with_tokens = [
            sess("a", "claude_code", { input_tokens: 1000 }),
            sess("b", "opencode", { input_tokens: 300 }),
        ];
        expect(sort_sessions(with_tokens, "tokens", "desc")[0]?.id).toBe("a");
        expect(sort_sessions(with_tokens, "tokens", "asc")[0]?.id).toBe("b");
        expect(sort_sessions(SESSIONS, "calls", "desc")[0]?.id).toBe("c");
        expect(sort_sessions(SESSIONS, "calls", "asc")[0]?.id).toBe("b");
        void fields;
        void directions;
    });

    it("标题排序：小写比较，空标题最小", () => {
        const titled = [
            sess("a", "claude_code", { title: "Beta" }),
            sess("b", "opencode", { title: "alpha" }),
            sess("c", "grok", { title: "" }),
        ];
        expect(sort_sessions(titled, "title", "asc").map((s) => s.id)).toEqual(["c", "b", "a"]);
        expect(sort_sessions(titled, "title", "desc").map((s) => s.id)).toEqual(["a", "b", "c"]);
    });
});

describe("count_stats (t227)", () => {
    it("统计会话数/agent 数/总 tokens", () => {
        const stats = count_stats(SESSIONS);
        expect(stats.sessions).toBe(3);
        expect(stats.agents).toBe(3);
        expect(stats.tokens).toBe(1125);
    });
});

describe("time_filter_range（时间预设→查询区间）", () => {
    const NOW = new Date("2026-09-09T12:00:00Z").getTime();

    it("all 不限时间", () => {
        expect(time_filter_range("all", null, NOW)).toEqual({});
    });

    it.each([
        ["24h", TIME_PRESET_WINDOW_MS["24h"]],
        ["7d", TIME_PRESET_WINDOW_MS["7d"]],
        ["30d", TIME_PRESET_WINDOW_MS["30d"]],
    ] as const)("预设 %s 以 now 为锚回看固定窗口", (preset, window_ms) => {
        expect(time_filter_range(preset, null, NOW)).toEqual({
            start_at: NOW - window_ms,
        });
    });

    it("custom 用用户所选区间；缺 start 视为不限", () => {
        expect(time_filter_range("custom", { start_at: 100, end_at: 200 }, NOW)).toEqual({
            start_at: 100,
            end_at: 200,
        });
        expect(time_filter_range("custom", { start_at: 100 }, NOW)).toEqual({ start_at: 100 });
        expect(time_filter_range("custom", null, NOW)).toEqual({});
    });
});

describe("filter_sessions 数轴区间（tokens/calls 含边界）", () => {
    // 默认 sess：tokens=375（100+200+50+25），calls=3。
    it("min/max tokens 含边界过滤", () => {
        const a = sess("a", "claude_code", { input_tokens: 1000 }); // 1175
        const b = sess("b", "opencode"); // 375
        expect(
            filter_sessions([a, b], { min_tokens: 375, max_tokens: 375 }).map((s) => s.id),
        ).toEqual(["b"]);
        expect(filter_sessions([a, b], { min_tokens: 376 }).map((s) => s.id)).toEqual(["a"]);
        expect(filter_sessions([a, b], { max_tokens: 374 })).toEqual([]);
    });

    it("min/max calls 含边界过滤", () => {
        const a = sess("a", "claude_code", { calls: 5 });
        const b = sess("b", "opencode", { calls: 3 });
        expect(filter_sessions([a, b], { min_calls: 3, max_calls: 3 }).map((s) => s.id)).toEqual([
            "b",
        ]);
        expect(filter_sessions([a, b], { min_calls: 4 }).map((s) => s.id)).toEqual(["a"]);
        expect(filter_sessions([a, b], { max_calls: 2 })).toEqual([]);
    });

    it("区间与 agents/search 组合", () => {
        const a = sess("a", "claude_code", { input_tokens: 1000, calls: 5 });
        const b = sess("b", "opencode");
        const out = filter_sessions([a, b], {
            agents: ["claude_code"],
            min_tokens: 400,
            min_calls: 4,
        });
        expect(out.map((s) => s.id)).toEqual(["a"]);
    });
});
