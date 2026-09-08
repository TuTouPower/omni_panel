import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * t460：会话库搜索 skill + 使用指南的正文契约断言（不启 LocalAPI）。
 */

const ROOT = join(__dirname, "../..");
const SKILL_PATH = join(ROOT, "skills/session_library_search/SKILL.md");
const GUIDE_PATH = join(ROOT, "docs/guides/session_library_agent_search.md");

function read(path: string): string {
    return readFileSync(path, "utf8");
}

describe("t460 session_library_search skill + guide", () => {
    const skill = read(SKILL_PATH);
    const guide = read(GUIDE_PATH);

    it("AC-001：cli.json 发现 + 127.0.0.1；未运行不得编造", () => {
        expect(skill).toContain("cli.json");
        expect(skill).toContain("127.0.0.1");
        expect(skill).toMatch(/instance not running|实例未运行/i);
        expect(skill).toMatch(/do not invent|不得编造/i);
    });

    it("AC-002：GET /v1/sessions 与筛选参数", () => {
        expect(skill).toContain("GET /v1/sessions");
        for (const param of [
            "title",
            "directory",
            "sources",
            "start_at",
            "end_at",
            "order_by",
            "direction",
            "limit",
            "offset",
        ]) {
            expect(skill).toContain(param);
        }
    });

    it("AC-003：searchContent + 扫描分页 + 先元信息", () => {
        expect(skill).toContain("POST /v1/sessionHistory/searchContent");
        expect(skill).toMatch(/candidate scanning|候选扫描/i);
        expect(skill).toMatch(/not result count|不是结果条数/i);
        expect(skill).toMatch(/metadata filters first|元信息过滤|Prefer metadata/i);
    });

    it("AC-004：读消息须 id/source/env，可分页", () => {
        expect(skill).toContain("GET /v1/sessionHistory");
        expect(skill).toContain("`id`, `source`, and `env` are **required**");
        expect(skill).toContain("before_cursor");
        expect(skill).toMatch(/Optional: `limit`/);
    });

    it("AC-005：只读；禁止 subscribe/open", () => {
        expect(skill).toMatch(/Read-only|只读/);
        expect(skill).toMatch(/Never modify|不改|不.*修改会话源/);
        expect(skill).toContain("subscribe");
        expect(skill).toMatch(
            /Do \*\*not\*\* call subscribe|不调用订阅|unsubscribe|sessionHistory\.open/i,
        );
    });

    it("AC-006：指南覆盖三家拷贝且不要求 MCP", () => {
        expect(guide).toContain("Claude Code");
        expect(guide).toContain("Cursor");
        expect(guide).toContain("Grok");
        expect(guide).toContain("skills/session_library_search");
        expect(guide).toMatch(/不需要 MCP|不要.*MCP|不要求.*MCP|不配 MCP/);
        // 允许出现「不改 mcp.json」类否定句；禁止要求「添加/配置 mcp.json」。
        expect(guide).not.toMatch(/添加.*mcp\.json|配置 mcp\.json|写入 mcp\.json/);
    });
});
