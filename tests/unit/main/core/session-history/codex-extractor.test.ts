import { mkdtempSync, rmSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    extract_codex,
    extract_codex_first_user,
    extract_codex_incremental,
} from "../../../../../src/main/core/session-history/codex-extractor";
import { normalize_user_display_text } from "../../../../../src/main/core/session-history/normalize_user_text";
import { resolve_session_file } from "../../../../../src/main/core/session-history/session-locator";

const SID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function line(obj: unknown): string {
    return JSON.stringify(obj);
}

function fixture(): string {
    return [
        line({
            timestamp: "2026-09-03T17:51:43.486Z",
            ordinal: 0,
            type: "session_meta",
            payload: { session_id: SID, cwd: "/home/karon/proj" },
        }),
        line({
            timestamp: "2026-09-03T17:51:43.491Z",
            ordinal: 1,
            type: "response_item",
            payload: {
                type: "message",
                role: "developer",
                content: [{ type: "input_text", text: "sys" }],
            },
        }),
        line({
            timestamp: "2026-09-03T17:51:44.000Z",
            ordinal: 2,
            type: "response_item",
            payload: {
                type: "message",
                role: "user",
                content: [{ type: "input_text", text: "hello codex" }],
            },
        }),
        line({
            timestamp: "2026-09-03T17:51:45.000Z",
            ordinal: 3,
            type: "response_item",
            payload: { type: "reasoning", text: "thinking" },
        }),
        line({
            timestamp: "2026-09-03T17:51:46.000Z",
            ordinal: 4,
            type: "response_item",
            payload: {
                type: "message",
                role: "assistant",
                content: [{ type: "output_text", text: "hi there" }],
            },
        }),
        line({
            timestamp: "2026-09-03T17:51:47.000Z",
            ordinal: 5,
            type: "response_item",
            payload: { type: "function_call", name: "x", arguments: "{}" },
        }),
        line({
            timestamp: "2026-09-03T17:51:48.000Z",
            ordinal: 6,
            type: "event_msg",
            payload: { type: "token_count", info: {} },
        }),
        line({
            timestamp: "2026-09-03T17:51:49.000Z",
            ordinal: 7,
            type: "response_item",
            payload: { type: "web_search_call", query: "q" },
        }),
        "not-json{{{",
    ].join("\n");
}

function write_rollout(dir: string, sid: string, content: string): string {
    const dated = join(dir, ".codex", "sessions", "2026", "09", "03");
    mkdirSync(dated, { recursive: true });
    const file = join(dated, `rollout-2026-09-03T17-51-32-${sid}.jsonl`);
    writeFileSync(file, content);
    return file;
}

describe("codex extractor (t446)", () => {
    it("AC-001: 全量只返回 user/assistant 文本，顺序一致，timestamp 非空", () => {
        const dir = mkdtempSync(join(tmpdir(), "codex-ext-t446-"));
        try {
            const file = write_rollout(dir, SID, fixture());
            const { messages } = extract_codex(file);
            expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
            expect(messages.map((m) => m.text)).toEqual(["hello codex", "hi there"]);
            expect(messages.every((m) => typeof m.timestamp === "number")).toBe(true);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("AC-002: 追加新行后增量只返回新增", () => {
        const dir = mkdtempSync(join(tmpdir(), "codex-ext-t446-"));
        try {
            const file = write_rollout(dir, SID, fixture());
            const first = extract_codex(file);
            expect(first.cursor).not.toBeNull();
            appendFileSync(
                file,
                "\n" +
                    line({
                        timestamp: "2026-09-03T17:51:50.000Z",
                        ordinal: 8,
                        type: "response_item",
                        payload: {
                            type: "message",
                            role: "assistant",
                            content: [{ type: "output_text", text: "second" }],
                        },
                    }),
            );
            if (first.cursor === null) throw new Error("expected cursor");
            const inc = extract_codex_incremental(file, first.cursor);
            expect(inc.messages.map((m) => m.text)).toEqual(["second"]);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("AC-003: first_user 返回首条 user 文本", () => {
        const dir = mkdtempSync(join(tmpdir(), "codex-ext-t446-"));
        try {
            const file = write_rollout(dir, SID, fixture());
            expect(extract_codex_first_user(file)).toBe("hello codex");
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("AC-004: locator 按 session_id 解析到 rollout 文件；不存在返回 null", () => {
        const dir = mkdtempSync(join(tmpdir(), "codex-ext-t446-"));
        try {
            write_rollout(dir, SID, fixture());
            const found = resolve_session_file("codex", "linux", SID, {
                host: "linux",
                homedir: dir,
                win_home: "",
                wsl_distro: "Ubuntu-22.04",
                wsl_user: "",
                index_dir: join(dir, "index"),
            });
            expect(found).not.toBeNull();
            expect(found?.extractor_kind).toBe("codex");
            expect(found?.file_path.endsWith(`rollout-2026-09-03T17-51-32-${SID}.jsonl`)).toBe(
                true,
            );
            const missing = resolve_session_file(
                "codex",
                "linux",
                "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee",
                {
                    host: "linux",
                    homedir: dir,
                    win_home: "",
                    wsl_distro: "Ubuntu-22.04",
                    wsl_user: "",
                    index_dir: join(dir, "index"),
                },
            );
            expect(missing).toBeNull();
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("AC-005: 大信封 user 行经归一后不展示信封原文", () => {
        // 真实形态为裸信封（无 user_query 包裹，d051），走 strip_envelope_blocks 分支。
        const norm = normalize_user_display_text(
            "<environment_context>\n  <cwd>/home/karon</cwd>\n</environment_context>\nhello",
        );
        expect(norm.keep).toBe(true);
        if (norm.keep) {
            expect(norm.text).not.toContain("<environment_context>");
        }
    });
});
