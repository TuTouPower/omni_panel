import { appendFileSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
    extract_commandcode,
    extract_commandcode_first_user,
    extract_commandcode_incremental,
    extract_commandcode_last_user,
} from "../../../../../src/main/core/session-history/commandcode-extractor";

const SID = "session-cc-001";

function line(record: unknown): string {
    return JSON.stringify(record);
}

function message(
    role: "user" | "assistant",
    text: string,
    timestamp: string,
    source = role === "user" ? "user" : "assistant",
): string {
    return line({
        type: "message",
        timestamp,
        message: {
            role,
            meta: { source },
            content: [{ type: "text", text }],
        },
    });
}

function write_session(dir: string, content: string): string {
    const project = join(dir, ".commandcode", "projects", "encoded-project");
    mkdirSync(project, { recursive: true });
    const file = join(project, `${SID}.jsonl`);
    writeFileSync(file, content);
    return file;
}

describe("commandcode extractor (t484)", () => {
    it("AC-001: 全量只保留 user/assistant text，过滤 thinking/tool/tool_result", () => {
        const dir = mkdtempSync(join(tmpdir(), "commandcode-ext-"));
        try {
            const file = write_session(
                dir,
                [
                    message("user", "hello", "2026-09-14T10:00:00.000Z"),
                    line({
                        type: "message",
                        timestamp: "2026-09-14T10:00:01.000Z",
                        message: {
                            role: "assistant",
                            content: [{ type: "thinking", text: "hidden" }],
                        },
                    }),
                    line({
                        type: "message",
                        timestamp: "2026-09-14T10:00:02.000Z",
                        message: {
                            role: "assistant",
                            content: [{ type: "tool_use", name: "shell", input: {} }],
                        },
                    }),
                    message("user", "tool result", "2026-09-14T10:00:03.000Z", "tool"),
                    message("assistant", "done", "2026-09-14T10:00:04.000Z"),
                    line({ type: "event", timestamp: "not-a-message" }),
                    "not-json",
                ].join("\n") + "\n",
            );
            const result = extract_commandcode(file);
            expect(result.messages.map(({ role, text }) => ({ role, text }))).toEqual([
                { role: "user", text: "hello" },
                { role: "assistant", text: "done" },
            ]);
            expect(result.messages.every((item) => item.timestamp !== null)).toBe(true);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("AC-002: 追加后增量只返回新增消息并延续 id", () => {
        const dir = mkdtempSync(join(tmpdir(), "commandcode-ext-"));
        try {
            const file = write_session(
                dir,
                message("user", "first", "2026-09-14T10:00:00.000Z") + "\n",
            );
            const first = extract_commandcode(file);
            appendFileSync(file, message("assistant", "second", "2026-09-14T10:00:01.000Z") + "\n");
            if (!first.cursor) throw new Error("expected cursor");
            const incremental = extract_commandcode_incremental(file, first.cursor);
            expect(incremental.messages.map((item) => item.text)).toEqual(["second"]);
            expect(incremental.messages[0]?.id).toBe("commandcode:1");
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("AC-003: first_user/last_user 只看真人 user", () => {
        const dir = mkdtempSync(join(tmpdir(), "commandcode-ext-"));
        try {
            const file = write_session(
                dir,
                [
                    message("user", "first", "2026-09-14T10:00:00.000Z"),
                    message("user", "ignored tool", "2026-09-14T10:00:01.000Z", "tool"),
                    message("assistant", "answer", "2026-09-14T10:00:02.000Z"),
                    message("user", "last", "2026-09-14T10:00:03.000Z"),
                ].join("\n") + "\n",
            );
            expect(extract_commandcode_first_user(file)).toBe("first");
            expect(extract_commandcode_last_user(file)).toBe("last");
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("AC-008: 半行、多字节文本和非法 JSON 在追加后仍能恢复", () => {
        const dir = mkdtempSync(join(tmpdir(), "commandcode-ext-"));
        try {
            const partial_message = message("assistant", "😀 新消息", "2026-09-14T10:00:02.000Z");
            const split_at = Math.floor(partial_message.length / 2);
            const file = write_session(
                dir,
                message("user", "旧消息", "2026-09-14T10:00:00.000Z") +
                    "\n" +
                    partial_message.slice(0, split_at),
            );
            const first = extract_commandcode(file);
            if (!first.cursor) throw new Error("expected cursor");
            appendFileSync(file, partial_message.slice(split_at) + "\n" + "broken-json\n");
            const incremental = extract_commandcode_incremental(file, first.cursor);
            expect(incremental.messages.map((item) => item.text)).toEqual(["😀 新消息"]);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("AC-008: 非法 JSON 行单独跳过且不影响相邻消息", () => {
        const dir = mkdtempSync(join(tmpdir(), "commandcode-ext-"));
        try {
            const file = write_session(
                dir,
                [
                    message("user", "before", "2026-09-14T10:00:00.000Z"),
                    "{broken-json",
                    message("assistant", "after", "2026-09-14T10:00:01.000Z"),
                ].join("\n") + "\n",
            );
            expect(extract_commandcode(file).messages.map((item) => item.text)).toEqual([
                "before",
                "after",
            ]);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("AC-008: 未知 content block 跳过但保留同条 text", () => {
        const dir = mkdtempSync(join(tmpdir(), "commandcode-ext-"));
        try {
            const file = write_session(
                dir,
                line({
                    type: "message",
                    timestamp: "2026-09-14T10:00:00.000Z",
                    message: {
                        role: "assistant",
                        content: [
                            { type: "future_block", payload: "ignored" },
                            { type: "text", text: "visible" },
                        ],
                    },
                }) + "\n",
            );
            expect(extract_commandcode(file).messages.map((item) => item.text)).toEqual([
                "visible",
            ]);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("AC-008: 畸形 timestamp 单独跳过", () => {
        const dir = mkdtempSync(join(tmpdir(), "commandcode-ext-"));
        try {
            const file = write_session(
                dir,
                [
                    message("user", "bad timestamp", "not-an-iso-timestamp"),
                    message("assistant", "valid", "2026-09-14T10:00:01.000Z"),
                ].join("\n") + "\n",
            );
            expect(extract_commandcode(file).messages.map((item) => item.text)).toEqual(["valid"]);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("AC-008: 文件截断或同尺寸重写返回替换标记，避免 cache 追加旧内容", () => {
        const dir = mkdtempSync(join(tmpdir(), "commandcode-ext-"));
        try {
            const file = write_session(dir, file_content("old-old"));
            const first = extract_commandcode(file);
            if (!first.cursor) throw new Error("expected cursor");
            if (first.cursor.kind !== "byte_offset" || first.cursor.mtime_ms === undefined) {
                throw new Error("expected mtime");
            }
            writeFileSync(file, file_content("new-new"));
            const forced_mtime = new Date(first.cursor.mtime_ms + 1000);
            utimesSync(file, forced_mtime, forced_mtime);
            const rewritten = extract_commandcode_incremental(file, first.cursor);
            expect(rewritten.replace_cache).toBe(true);
            expect(rewritten.messages.map((item) => item.text)).toEqual(["new-new"]);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

function file_content(text: string): string {
    return message("user", text, "2026-09-14T10:00:00.000Z") + "\n";
}
