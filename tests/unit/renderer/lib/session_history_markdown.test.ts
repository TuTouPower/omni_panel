import { describe, expect, it } from "vitest";
import {
    agent_friendly,
    agent_slug,
    build_copy_markdown,
    format_date,
    format_time_full,
    format_time_short,
    type CopySection,
} from "../../../../src/renderer/lib/session-history/markdown";

/**
 * t211 会话历史复制 Markdown 生成器与格式化纯函数。
 * 锚定决策 9/Q9 的复制输出格式：分节、`---` 隔离、角色粗体、时间升序。
 */

describe("agent 显示名", () => {
    it("四端映射到友好名", () => {
        expect(agent_friendly("claude_code")).toBe("Claude");
        expect(agent_friendly("opencode")).toBe("OpenCode");
        expect(agent_friendly("kimi_code")).toBe("Kimi");
        expect(agent_friendly("grok")).toBe("Grok");
    });

    it("未知 source 原样返回", () => {
        expect(agent_friendly("weird_source")).toBe("weird_source");
    });

    it("slug：下划线转连字符", () => {
        expect(agent_slug("claude_code")).toBe("claude-code");
        expect(agent_slug("opencode")).toBe("opencode");
    });
});

describe("时间格式化", () => {
    // 2026-08-04 10:05:07 UTC+8 对应的 epoch。
    const ts = new Date("2026-08-04T02:05:07.000Z").getTime();

    it("format_date 输出 YYYY-MM-DD", () => {
        expect(format_date(ts)).toBe("2026-08-04");
    });

    it("format_time_short 输出 HH:MM", () => {
        expect(format_time_short(ts)).toBe("10:05");
    });

    it("format_time_full 输出完整", () => {
        expect(format_time_full(ts)).toBe("2026-08-04 10:05:07");
    });
});

describe("build_copy_markdown", () => {
    const sections: CopySection[] = [
        {
            title: "fix login bug",
            source: "claude_code",
            date: "2026-08-04",
            messages: [
                { role: "user", text: "帮我修登录", timestamp: 10 },
                { role: "assistant", text: "好的，先看报错", timestamp: 11 },
            ],
        },
    ];

    it("单节输出：标题 + 用户/Agent 角色 + 消息", () => {
        const md = build_copy_markdown(sections);
        expect(md).toContain("## 会话：fix login bug（claude-code · 2026-08-04）");
        expect(md).toContain("**用户**");
        expect(md).toContain("**Claude**");
        expect(md).toContain("帮我修登录");
        expect(md).toContain("好的，先看报错");
    });

    it("节内消息按时间升序（即使输入乱序）", () => {
        const md = build_copy_markdown([
            {
                title: "fix login bug",
                source: "claude_code",
                date: "2026-08-04",
                messages: [
                    { role: "assistant", text: "后到的", timestamp: 20 },
                    { role: "user", text: "先发的", timestamp: 5 },
                ],
            },
        ]);
        const user_idx = md.indexOf("先发的");
        const asst_idx = md.indexOf("后到的");
        expect(user_idx).toBeGreaterThan(-1);
        expect(asst_idx).toBeGreaterThan(user_idx);
    });

    it("多节按输入顺序输出，节间 --- 隔离", () => {
        const first: CopySection = {
            title: "fix login bug",
            source: "claude_code",
            date: "2026-08-04",
            messages: [{ role: "user", text: "帮我修登录", timestamp: 10 }],
        };
        const md = build_copy_markdown([
            first,
            {
                title: "refactor store",
                source: "opencode",
                date: "2026-08-05",
                messages: [{ role: "user", text: "重构 store", timestamp: 1 }],
            },
        ]);
        const first_idx = md.indexOf("fix login bug");
        const second = md.indexOf("refactor store");
        expect(first_idx).toBeGreaterThan(-1);
        expect(second).toBeGreaterThan(first_idx);
        expect(md).toContain("---");
        // 两节之间恰好一条分隔线。
        expect(md.split("---")).toHaveLength(2);
        expect(md).toContain("## 会话：refactor store（opencode · 2026-08-05）");
    });

    it("timestamp null 的消息排最后（grok 无时间）", () => {
        const md = build_copy_markdown([
            {
                title: "no ts",
                source: "grok",
                date: "2026-08-05",
                messages: [
                    { role: "user", text: "有时间", timestamp: 100 },
                    { role: "assistant", text: "无时间", timestamp: null },
                ],
            },
        ]);
        expect(md.indexOf("无时间")).toBeGreaterThan(md.indexOf("有时间"));
    });

    it("标题为 null 时回退占位标题", () => {
        const md = build_copy_markdown([
            {
                title: "",
                source: "kimi_code",
                date: "2026-08-05",
                messages: [{ role: "user", text: "x", timestamp: 1 }],
            },
        ]);
        expect(md).toContain("## 会话：kimi-code · 2026-08-05（kimi-code · 2026-08-05）");
    });

    it("空节输出空串", () => {
        expect(build_copy_markdown([])).toBe("");
    });
});
