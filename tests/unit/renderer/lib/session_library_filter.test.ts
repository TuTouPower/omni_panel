import { describe, expect, it } from "vitest";
import type { TokenStatsSession } from "../../../../src/shared/types/token-stats";
import {
    count_stats,
    filter_sessions,
    match_content,
    sort_sessions,
    type LibrarySort,
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
        env: "win",
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
    const sorts: LibrarySort[] = ["recent", "tokens", "calls", "earliest"];

    it("四种排序生效", () => {
        expect(sort_sessions(SESSIONS, "recent")[0]?.id).toBe("a");
        expect(sort_sessions(SESSIONS, "earliest")[0]?.id).toBe("b");
        // tokens 四维和：a=375, b=375, c=375（默认同值）→ 用不同 input 区分
        const with_tokens = [
            sess("a", "claude_code", { input_tokens: 1000 }),
            sess("b", "opencode", { input_tokens: 300 }),
        ];
        expect(sort_sessions(with_tokens, "tokens")[0]?.id).toBe("a");
        expect(sort_sessions(SESSIONS, "calls")[0]?.id).toBe("c");
        void sorts;
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
