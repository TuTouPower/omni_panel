import { describe, expect, it } from "vitest";
import {
    estimate_tokens,
    format_entries,
    type CopyFormat,
} from "../../../../src/renderer/lib/workspace/copy-format";
import type { SelectedItem } from "../../../../src/renderer/lib/workspace/selection-store";

/**
 * t226 托盘复制格式测试。
 * 覆盖：Markdown/纯文本/按会话分组三格式均含角色/agent/会话标题/时间戳；token 估算。
 */

const LOC_A = { source: "claude_code", env: "win", session_id: "a" };
const LOC_B = { source: "opencode", env: "win", session_id: "b" };

function item(
    loc: typeof LOC_A,
    id: string,
    role: "user" | "assistant",
    text: string,
    timestamp: number | null,
    session_title: string,
): SelectedItem {
    return {
        key: `${loc.source}|${loc.env}|${loc.session_id}|${id}`,
        loc,
        message: { id, role, text, timestamp },
        role_index: 1,
        session_title,
    };
}

const ITEMS = [
    item(LOC_A, "m1", "user", "修复登录 bug", 1700000000000, "会话A"),
    item(LOC_A, "m2", "assistant", "已定位根因", 1700000060000, "会话A"),
    item(LOC_B, "m3", "assistant", "重构 store", 1700000100000, "会话B"),
];

describe("estimate_tokens", () => {
    it("按文本长度估算 token 数", () => {
        expect(estimate_tokens("你好世界")).toBe(4);
        expect(estimate_tokens("")).toBe(0);
        expect(estimate_tokens("abcdefgh")).toBe(8);
    });
});

describe("format_entries markdown", () => {
    it("按会话分节，含角色/agent/标题", () => {
        const out = format_entries(ITEMS, "markdown");
        expect(out).toContain("## 会话：会话A");
        expect(out).toContain("## 会话：会话B");
        expect(out).toContain("**用户");
        expect(out).toContain("**Claude");
        expect(out).toContain("**OpenCode");
        expect(out).toContain("修复登录 bug");
        expect(out).toContain("重构 store");
    });

    it("会话节含时间戳信息", () => {
        const out = format_entries(
            [ITEMS[0] ?? item(LOC_A, "x", "user", "", 0, "会话")],
            "markdown",
        );
        // 日期（YYYY-MM-DD）来自消息时间戳
        expect(out).toMatch(/\d{4}-\d{2}-\d{2}/);
    });
});

describe("format_entries plain", () => {
    it("含角色/agent/时间戳与内容，无 markdown 标记", () => {
        const out = format_entries(
            [
                ITEMS[0] ?? item(LOC_A, "x", "user", "", 0, "会话"),
                ITEMS[1] ?? item(LOC_A, "y", "assistant", "", 0, "会话"),
            ],
            "plain",
        );
        expect(out).toContain("用户");
        expect(out).toContain("Claude");
        expect(out).toContain("修复登录 bug");
        expect(out).toContain("已定位根因");
        expect(out).toMatch(/06:13/);
        expect(out).toMatch(/06:14/);
        expect(out).not.toContain("**用户");
    });
});

describe("format_entries grouped", () => {
    it("按会话分组，含角色/agent/时间戳", () => {
        const out = format_entries(ITEMS, "grouped");
        expect(out).toContain("会话A");
        expect(out).toContain("会话B");
        expect(out).toContain("修复登录 bug");
        expect(out).toContain("Claude");
        expect(out).toContain("OpenCode");
        expect(out).toContain("用户");
    });

    it("空列表返回空字符串", () => {
        expect(format_entries([], "markdown")).toBe("");
        expect(format_entries([], "plain")).toBe("");
        expect(format_entries([], "grouped")).toBe("");
    });
});

describe("format_entries format 枚举", () => {
    it("仅支持三种格式", () => {
        const formats: CopyFormat[] = ["markdown", "plain", "grouped"];
        for (const f of formats) {
            expect(typeof format_entries(ITEMS, f)).toBe("string");
        }
    });
});
