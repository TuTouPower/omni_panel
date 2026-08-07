import { describe, expect, it, vi } from "vitest";
import type * as NodeFs from "node:fs";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extract_claude_code_first_user } from "../../../../../src/main/core/session-history/claude-code-extractor";
import { extract_grok_first_user } from "../../../../../src/main/core/session-history/grok-extractor";
import { extract_kimi_code_first_user } from "../../../../../src/main/core/session-history/kimi-extractor";
import { READ_CAP, read_head } from "../../../../../src/main/core/session-history/head-read";

/**
 * t255 摘要限量头部读取：单个会话文件最多读 SUMMARY_HEAD_BYTES 字节，
 * 与文件总大小解耦；头部窗口内未找到 user 返回空串，不抛错。
 * readSync 计数断言读取字节数上限。
 */

const fs_spy = vi.hoisted(() => ({
    total_bytes_read: 0,
    readFileSync_calls: 0,
}));

vi.mock("node:fs", async (import_original) => {
    const actual = await import_original<typeof NodeFs>();
    return {
        ...actual,
        readSync: ((fd: number, buf: Buffer, off: number, len: number, pos: number | null) => {
            fs_spy.total_bytes_read += len;
            return actual.readSync(fd, buf, off, len, pos);
        }) as typeof actual.readSync,
        readFileSync: ((...args: Parameters<typeof actual.readFileSync>) => {
            // first_user 不应整文件读：若有 readFileSync 调用即回退整文件读，测试应失败。
            fs_spy.readFileSync_calls += 1;
            return actual.readFileSync(...args);
        }) as typeof actual.readFileSync,
    };
});

function make_file(content: string): { file: string; cleanup: () => void } {
    const dir = mkdtempSync(join(tmpdir(), "t255-head-"));
    const file = join(dir, "session.jsonl");
    writeFileSync(file, content, "utf8");
    return {
        file,
        cleanup: () => {
            rmSync(dir, { recursive: true, force: true });
        },
    };
}
/** 构造 content 以模拟各来源 JSONL 行。 */
const claude_line = (role: string, text: string) =>
    `${JSON.stringify({ type: role, message: { content: text } })}\n`;

describe("摘要限量头部读取 (t255)", () => {
    it("首条 user 在顶部时正常返回其文本（AC1）", () => {
        const { file, cleanup } = make_file(
            claude_line("user", "帮我看看这个文件") + claude_line("assistant", "好的"),
        );
        try {
            expect(extract_claude_code_first_user(file)).toBe("帮我看看这个文件");
        } finally {
            cleanup();
        }
    });

    it("大文件：摘要读取字节数有上界，远小于文件大小（AC2）", () => {
        // 构造 2MB 文件，user 消息在头部。
        const head = claude_line("user", "第一个问题");
        const filler = claude_line("assistant", "x".repeat(512));
        const big = head + filler.repeat(4000); // ~2MB
        const { file, cleanup } = make_file(big);
        try {
            fs_spy.total_bytes_read = 0;
            fs_spy.readFileSync_calls = 0;
            expect(extract_claude_code_first_user(file)).toBe("第一个问题");
            // 读取上界：窗口 + 末行补全余量；且未整文件读。
            expect(fs_spy.total_bytes_read).toBeLessThanOrEqual(READ_CAP);
            expect(fs_spy.readFileSync_calls).toBe(0);
            expect(fs_spy.total_bytes_read).toBeLessThan(big.length / 10);
        } finally {
            cleanup();
        }
    });

    it("头部窗口内无 user 返回空串，不抛错（AC3）", () => {
        // 文件全是 assistant 行，超窗口后仍是 assistant。
        const filler = claude_line("assistant", "x".repeat(512));
        const { file, cleanup } = make_file(filler.repeat(200)); // ~100KB
        try {
            expect(extract_claude_code_first_user(file)).toBe("");
        } finally {
            cleanup();
        }
    });

    it("user 消息在头部窗口之外时不返回该 user 文本（窗口裁剪语义）", () => {
        // 窗口 64KB 内只有 assistant；user 在 ~70KB 处。
        const filler = claude_line("assistant", "x".repeat(512));
        const offset_line = claude_line("user", "靠后的问题");
        const { file, cleanup } = make_file(filler.repeat(130) + offset_line);
        try {
            expect(extract_claude_code_first_user(file)).toBe("");
        } finally {
            cleanup();
        }
    });

    it("user 行起点在窗口内但整行跨窗口边界时仍能解析（f001 边界补全）", () => {
        // filler 行 558 字节；117 行后起点 65286，长 user 行（~360B）行尾跨出 64KB 窗口。
        const filler = claude_line("assistant", "x".repeat(512));
        const long_user = "边界行".repeat(100);
        const boundary_user = claude_line("user", long_user);
        const { file, cleanup } = make_file(filler.repeat(117) + boundary_user);
        try {
            expect(extract_claude_code_first_user(file)).toBe(long_user);
        } finally {
            cleanup();
        }
    });

    it("窗口边界切断多字节字符时不产出 U+FFFD（f001 解码）", () => {
        // ASCII filler 65498 字节使 '你'(E4 BD A0) 首字节 E4 落在文件偏移 65535，
        // window_end=65536 截断：窗口含残缺 E4，无 StringDecoder 会产出 U+FFFD。
        const filler = "x".repeat(65498);
        const { file, cleanup } = make_file(filler + claude_line("user", "你好"));
        try {
            const text = read_head(file);
            // StringDecoder 丢弃残缺 E4 尾字节，绝不产出 U+FFFD。
            expect(text).not.toContain("�");
        } finally {
            cleanup();
        }
    });

    it("损坏首行 / 非 JSON 行跳过，不抛错", () => {
        const { file, cleanup } = make_file(
            "{not valid json\n" + claude_line("user", "第二行是用户") + "\n",
        );
        try {
            expect(extract_claude_code_first_user(file)).toBe("第二行是用户");
        } finally {
            cleanup();
        }
    });

    it("文件缺失返回空串，不抛错", () => {
        expect(extract_claude_code_first_user("/nonexistent/file.jsonl")).toBe("");
    });
});

describe("grok / kimi first_user 复用头部读取 (t255)", () => {
    const grok_line = (role: string, text: string) =>
        `${JSON.stringify({ type: role, content: text })}\n`;
    const kimi_line = (role: string, text: string) =>
        `${JSON.stringify({
            type: "context.append_message",
            message: { role, content: [{ type: "text", text }] },
        })}\n`;

    it("grok：首条 user 返回其文本", () => {
        const { file, cleanup } = make_file(
            grok_line("system", "系统") + grok_line("user", "grok 的问题"),
        );
        try {
            expect(extract_grok_first_user(file)).toBe("grok 的问题");
        } finally {
            cleanup();
        }
    });

    it("kimi：首条 user 返回其文本", () => {
        const { file, cleanup } = make_file(kimi_line("user", "kimi 的问题"));
        try {
            expect(extract_kimi_code_first_user(file)).toBe("kimi 的问题");
        } finally {
            cleanup();
        }
    });
});
