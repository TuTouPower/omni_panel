import { describe, expect, it } from "vitest";
import {
    agent_friendly,
    agent_slug,
    format_date,
    format_time_short,
} from "../../../../src/renderer/lib/session-history/markdown";

/**
 * 会话历史纯函数（t211/t226）。
 *
 * t226 起复制输出由摘选托盘 copy-format（format_entries）取代，旧 build_copy_markdown
 * 与其测试整体删除（语义：按选择顺序分组，见 copy_format.test.ts）。
 * 本文件只保留 agent 显示名与时间格式化。
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
});
