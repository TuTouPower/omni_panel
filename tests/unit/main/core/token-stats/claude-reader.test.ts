/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
    read_costs_jsonl,
    scan_session_jsonls,
    create_session_scan_state,
} from "../../../../../src/main/core/token-stats/claude-reader";

let tmp_dir: string;
let jsonl_path: string;

function write(content: string) {
    fs.writeFileSync(jsonl_path, content, "utf-8");
}

beforeEach(() => {
    tmp_dir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-reader-"));
    jsonl_path = path.join(tmp_dir, "costs.jsonl");
});

afterEach(() => {
    fs.rmSync(tmp_dir, { recursive: true, force: true });
});

// --- Helpers to build JSONL lines ---

function line(
    session_id: string,
    model: string,
    input: number,
    output: number,
    timestamp: string,
    extras: Record<string, unknown> = {},
) {
    return JSON.stringify({
        session_id,
        model,
        input_tokens: input,
        output_tokens: output,
        timestamp,
        ...extras,
    });
}

const T1 = "2025-07-10T10:00:00.000Z";
const T2 = "2025-07-10T11:00:00.000Z";
const T3 = "2025-07-10T12:00:00.000Z";

const E1 = new Date(T1).getTime();
const E3 = new Date(T3).getTime();

// --- Tests ---

describe("read_costs_jsonl", () => {
    it("reads valid records and groups by session_id", () => {
        write(
            [
                line("s1", "claude-sonnet-4-20250514", 100, 50, T1),
                line("s2", "claude-sonnet-4-20250514", 200, 80, T2),
            ].join("\n"),
        );

        const result = read_costs_jsonl(jsonl_path, "win", 0, 0);

        expect(result.sessions).toHaveLength(2);

        const s1 = result.sessions.find((s) => s.id === "s1");
        expect(s1).toBeDefined();
        if (!s1) throw new Error("s1 not found");
        expect(s1.input_tokens).toBe(100);
        expect(s1.output_tokens).toBe(50);
        expect(s1.calls).toBeNull(); // calls come from scan_session_jsonls
        expect(s1.started_at).toBe(E1);
        expect(s1.ended_at).toBe(E1);
        expect(s1.source).toBe("claude_code");
        expect(s1.env).toBe("win");
        expect(s1.title).toBeNull();
        expect(s1.directory).toBeNull();

        const s2 = result.sessions.find((s) => s.id === "s2");
        expect(s2).toBeDefined();
        if (!s2) throw new Error("s2 not found");
        expect(s2.input_tokens).toBe(200);
        expect(s2.output_tokens).toBe(80);
    });

    it("filters out session_id=default", () => {
        write(
            [
                line("default", "claude-sonnet-4-20250514", 100, 50, T1),
                line("real", "claude-sonnet-4-20250514", 200, 80, T2),
            ].join("\n"),
        );

        const result = read_costs_jsonl(jsonl_path, "win", 0, 0);
        expect(result.sessions).toHaveLength(1);
        expect(result.sessions[0]!.id).toBe("real");
    });

    it("filters out model=unknown", () => {
        write(
            [
                line("s1", "unknown", 100, 50, T1),
                line("s2", "claude-sonnet-4-20250514", 200, 80, T2),
            ].join("\n"),
        );

        const result = read_costs_jsonl(jsonl_path, "win", 0, 0);
        expect(result.sessions).toHaveLength(1);
        expect(result.sessions[0]!.id).toBe("s2");
    });

    it("filters out zero-token rows", () => {
        write(
            [
                line("s1", "claude-sonnet-4-20250514", 0, 0, T1),
                line("s2", "claude-sonnet-4-20250514", 0, 50, T2),
                line("s3", "claude-sonnet-4-20250514", 100, 0, T3),
            ].join("\n"),
        );

        const result = read_costs_jsonl(jsonl_path, "win", 0, 0);
        expect(result.sessions).toHaveLength(2);
        expect(result.sessions.map((s) => s.id).sort()).toEqual(["s2", "s3"]);
    });

    it("takes max_by(.timestamp) token values and correct time range", () => {
        write(
            [
                line("s1", "claude-sonnet-4-20250514", 100, 50, T1),
                line("s1", "claude-opus-4-20250514", 300, 120, T3),
                line("s1", "claude-sonnet-4-20250514", 200, 80, T2),
            ].join("\n"),
        );

        const result = read_costs_jsonl(jsonl_path, "win", 0, 0);
        expect(result.sessions).toHaveLength(1);

        const s = result.sessions[0]!;
        // Latest timestamp is T3 -> model=opus, input=300, output=120
        expect(s.model).toBe("claude-opus-4-20250514");
        expect(s.input_tokens).toBe(300);
        expect(s.output_tokens).toBe(120);
        expect(s.calls).toBeNull(); // calls come from scan_session_jsonls
        expect(s.started_at).toBe(E1);
        expect(s.ended_at).toBe(E3);
    });

    it("handles offset reset when file shrinks", () => {
        // Write a large file, read it
        write(
            [
                line("s1", "claude-sonnet-4-20250514", 100, 50, T1),
                line("s2", "claude-sonnet-4-20250514", 200, 80, T2),
            ].join("\n"),
        );
        const first = read_costs_jsonl(jsonl_path, "win", 0, 0);
        expect(first.sessions).toHaveLength(2);
        const saved_offset = first.new_offset;

        // Rewrite with smaller content (file "recreated")
        write(line("s3", "claude-sonnet-4-20250514", 50, 20, T3) + "\n");

        const second = read_costs_jsonl(jsonl_path, "win", saved_offset, saved_offset);
        expect(second.sessions).toHaveLength(1);
        expect(second.sessions[0]!.id).toBe("s3");
    });

    it("returns empty when file unchanged (same size)", () => {
        write(line("s1", "claude-sonnet-4-20250514", 100, 50, T1) + "\n");

        const first = read_costs_jsonl(jsonl_path, "win", 0, 0);
        const size = first.new_size;

        const second = read_costs_jsonl(jsonl_path, "win", size, size);
        expect(second.sessions).toHaveLength(0);
        expect(second.new_offset).toBe(size);
    });

    it("handles malformed JSON lines gracefully", () => {
        const content = [
            line("s1", "claude-sonnet-4-20250514", 100, 50, T1),
            "not valid json {{{",
            line("s2", "claude-sonnet-4-20250514", 200, 80, T2),
            "",
            "  ",
        ].join("\n");
        write(content);

        const result = read_costs_jsonl(jsonl_path, "win", 0, 0);
        expect(result.sessions).toHaveLength(2);
    });

    it("reads incrementally (only new bytes from saved_offset)", () => {
        const line1 = line("s1", "claude-sonnet-4-20250514", 100, 50, T1);
        write(line1 + "\n");

        const first = read_costs_jsonl(jsonl_path, "win", 0, 0);
        expect(first.sessions).toHaveLength(1);
        const saved = first.new_offset;

        // Append more data
        const line2 = line("s2", "claude-sonnet-4-20250514", 200, 80, T2);
        fs.appendFileSync(jsonl_path, line2 + "\n", "utf-8");

        const second = read_costs_jsonl(jsonl_path, "win", saved, saved);
        expect(second.sessions).toHaveLength(1);
        expect(second.sessions[0]!.id).toBe("s2");
    });

    it("defaults missing cache tokens to 0", () => {
        write(line("s1", "claude-sonnet-4-20250514", 100, 50, T1) + "\n");

        const result = read_costs_jsonl(jsonl_path, "win", 0, 0);
        expect(result.sessions[0]!.cache_read_tokens).toBe(0);
        expect(result.sessions[0]!.cache_write_tokens).toBe(0);
    });

    it("reads cache tokens when present", () => {
        write(
            line("s1", "claude-sonnet-4-20250514", 100, 50, T1, {
                cache_read_tokens: 500,
                cache_write_tokens: 300,
            }) + "\n",
        );

        const result = read_costs_jsonl(jsonl_path, "win", 0, 0);
        expect(result.sessions[0]!.cache_read_tokens).toBe(500);
        expect(result.sessions[0]!.cache_write_tokens).toBe(300);
    });

    it("propagates env parameter", () => {
        write(line("s1", "claude-sonnet-4-20250514", 100, 50, T1) + "\n");

        const result = read_costs_jsonl(jsonl_path, "wsl", 0, 0);
        expect(result.sessions[0]!.env).toBe("wsl");
    });
});

// --- scan_session_jsonls ---

function session_line(type: string, timestamp: string, extras: Record<string, unknown> = {}) {
    return JSON.stringify({ type, timestamp, ...extras });
}

function assistant_line(timestamp: string, model: string) {
    return session_line("assistant", timestamp, {
        message: { model, usage: { input_tokens: 10, output_tokens: 5 } },
    });
}

describe("scan_session_jsonls", () => {
    let projects_dir: string;

    beforeEach(() => {
        projects_dir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-projects-"));
    });

    afterEach(() => {
        fs.rmSync(projects_dir, { recursive: true, force: true });
    });

    function write_session(rel: string, lines: string[]) {
        const full = path.join(projects_dir, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, lines.join("\n") + "\n", "utf-8");
    }

    it("parses calls, title, directory, model, token sums and time range", () => {
        write_session("proj-a/sess-1.jsonl", [
            session_line("user", T1, {
                cwd: "D:\\proj\\a",
                message: { content: "hello world" },
            }),
            assistant_line(T2, "claude-sonnet-4-20250514"),
            assistant_line(T3, "claude-sonnet-4-20250514"),
        ]);

        const result = scan_session_jsonls(projects_dir, "win", create_session_scan_state());

        expect(result.sessions).toHaveLength(1);
        const s = result.sessions[0]!;
        expect(s.id).toBe("sess-1");
        expect(s.calls).toBe(2);
        expect(s.title).toBe("hello world");
        expect(s.directory).toBe("D:\\proj\\a");
        expect(s.model).toBe("claude-sonnet-4-20250514");
        expect(s.started_at).toBe(E1);
        expect(s.ended_at).toBe(E3);
        // Token sums come from per-call usage (2 calls × 10 in / 5 out)
        expect(s.input_tokens).toBe(20);
        expect(s.output_tokens).toBe(10);
        expect(result.new_state.mtimes.size).toBe(1);
    });

    it("emits per-message AgentSessionUsage records for assistant messages", () => {
        write_session("proj-a/sess-rec.jsonl", [
            session_line("user", T1, {
                cwd: "/work/rec",
                message: { content: "records test" },
            }),
            session_line("assistant", T2, {
                sessionId: "sess-rec",
                message: {
                    model: "claude-sonnet-4-20250514",
                    usage: {
                        input_tokens: 12,
                        output_tokens: 7,
                        cache_read_input_tokens: 3,
                        cache_creation_input_tokens: 1,
                    },
                },
            }),
            session_line("assistant", T3, {
                sessionId: "sess-rec",
                message: {
                    model: "claude-opus-4-20250514",
                    usage: { input_tokens: 20, output_tokens: 10 },
                },
            }),
        ]);

        const result = scan_session_jsonls(projects_dir, "win", create_session_scan_state());

        expect(result.records).toHaveLength(2);
        const r0 = result.records[0]!;
        expect(r0.agent).toBe("claude-code");
        expect(r0.session_id).toBe("sess-rec");
        expect(r0.title).toBe("records test");
        expect(r0.directory).toBe("/work/rec");
        expect(r0.model).toBe("claude-sonnet-4-20250514");
        expect(r0.timestamp).toBe(E1 + 3600000); // T2
        expect(r0.input_tokens).toBe(12);
        expect(r0.output_tokens).toBe(7);
        expect(r0.cache_read_tokens).toBe(3);
        expect(r0.cache_write_tokens).toBe(1);
        expect(r0.role).toBe("assistant");
        expect(r0.parent_session_id).toBeNull();

        const r1 = result.records[1]!;
        expect(r1.model).toBe("claude-opus-4-20250514");
        expect(r1.cache_read_tokens).toBe(0);
        expect(r1.cache_write_tokens).toBe(0);
    });

    it("emits per-day usage rows grouped by local date and model", () => {
        write_session("proj-a/sess-1.jsonl", [
            assistant_line("2026-07-10T02:00:00.000Z", "sonnet"),
            assistant_line("2026-07-10T10:00:00.000Z", "sonnet"),
            assistant_line("2026-07-11T02:00:00.000Z", "opus"),
        ]);

        const result = scan_session_jsonls(projects_dir, "win", create_session_scan_state());

        expect(result.daily).toHaveLength(2);
        const d1 = result.daily.find((d) => d.model === "sonnet")!;
        const d2 = result.daily.find((d) => d.model === "opus")!;
        expect(d1.calls).toBe(2);
        expect(d1.input_tokens).toBe(20);
        expect(d1.date).toBe("2026-07-10");
        expect(d2.calls).toBe(1);
        expect(d2.date).toBe("2026-07-11");
        expect(d1.id).toBe("sess-1");
        expect(d1.source).toBe("claude_code");
    });

    it("dedups byte-identical records but keeps distinct calls with identical usage", () => {
        const dup = assistant_line(T2, "sonnet");
        const same_usage_different_request = session_line("assistant", T2, {
            requestId: "req-other",
            message: { model: "sonnet", usage: { input_tokens: 10, output_tokens: 5 } },
        });
        write_session("proj-a/sess-1.jsonl", [
            assistant_line(T1, "sonnet"),
            dup,
            dup, // exact duplicate line — counted once
            same_usage_different_request, // distinct call with same ts+usage — counted
        ]);

        const result = scan_session_jsonls(projects_dir, "win", create_session_scan_state());
        expect(result.sessions[0]!.calls).toBe(3);
        expect(result.sessions[0]!.input_tokens).toBe(30);
        expect(result.daily[0]!.calls).toBe(3);
    });

    it("prefers sessionId from records over the filename", () => {
        write_session("proj-a/file-name.jsonl", [
            session_line("assistant", T1, {
                sessionId: "real-session-id",
                message: { model: "m", usage: { input_tokens: 1, output_tokens: 1 } },
            }),
        ]);

        const result = scan_session_jsonls(projects_dir, "win", create_session_scan_state());
        expect(result.sessions[0]!.id).toBe("real-session-id");
        expect(result.daily[0]!.id).toBe("real-session-id");
    });

    it("prefers summary line title over first user text", () => {
        write_session("proj-a/sess-2.jsonl", [
            session_line("summary", T1, { summary: "Real title" }),
            session_line("user", T2, { message: { content: "user text" } }),
            assistant_line(T3, "m"),
        ]);

        const result = scan_session_jsonls(projects_dir, "win", create_session_scan_state());
        expect(result.sessions[0]!.title).toBe("Real title");
    });

    it("extracts user text from array content blocks", () => {
        write_session("proj-a/sess-3.jsonl", [
            session_line("user", T1, {
                message: { content: [{ type: "text", text: "array content title" }] },
            }),
            assistant_line(T2, "m"),
        ]);

        const result = scan_session_jsonls(projects_dir, "win", create_session_scan_state());
        expect(result.sessions[0]!.title).toBe("array content title");
    });

    it("skips unchanged files by mtime on rescan", () => {
        write_session("proj-a/sess-4.jsonl", [assistant_line(T1, "m")]);

        const first = scan_session_jsonls(projects_dir, "win", create_session_scan_state());
        expect(first.sessions).toHaveLength(1);

        const second = scan_session_jsonls(projects_dir, "win", first.new_state);
        expect(second.sessions).toHaveLength(0);
        expect(second.new_state.mtimes.size).toBe(1);
    });

    it("recounts in full when a file changes (store REPLACEs)", () => {
        write_session("proj-a/sess-5.jsonl", [assistant_line(T1, "m")]);

        const first = scan_session_jsonls(projects_dir, "win", create_session_scan_state());
        expect(first.sessions[0]!.calls).toBe(1);

        // Append another call — mtime changes
        const file = path.join(projects_dir, "proj-a", "sess-5.jsonl");
        fs.appendFileSync(file, assistant_line(T2, "m") + "\n", "utf-8");
        // Ensure mtime differs even on coarse filesystems
        const future = new Date(Date.now() + 5000);
        fs.utimesSync(file, future, future);

        const second = scan_session_jsonls(projects_dir, "win", first.new_state);
        expect(second.sessions).toHaveLength(1);
        expect(second.sessions[0]!.calls).toBe(2);
    });

    it("scans nested project dirs and skips non-jsonl files", () => {
        write_session("proj-a/sess-6.jsonl", [assistant_line(T1, "m")]);
        write_session("proj-b/deep/sess-7.jsonl", [assistant_line(T1, "m")]);
        write_session("proj-a/notes.txt", [assistant_line(T1, "m")]);

        const result = scan_session_jsonls(projects_dir, "win", create_session_scan_state());
        expect(result.sessions.map((s) => s.id).sort()).toEqual(["sess-6", "sess-7"]);
    });

    it("skips <synthetic> assistant records (not real API calls)", () => {
        write_session("proj-a/sess-syn.jsonl", [
            session_line("user", T1, { message: { content: "hi" } }),
            assistant_line(T2, "<synthetic>"),
            assistant_line(T3, "claude-sonnet-4-20250514"),
        ]);

        const result = scan_session_jsonls(projects_dir, "win", create_session_scan_state());
        expect(result.sessions[0]!.calls).toBe(1);
        expect(result.sessions[0]!.model).toBe("claude-sonnet-4-20250514");
    });

    it("skips files with no timestamps and malformed lines", () => {
        write_session("proj-a/empty.jsonl", ["not json", ""]);
        write_session("proj-a/ok.jsonl", ["bad json {{{", assistant_line(T1, "m")]);

        const result = scan_session_jsonls(projects_dir, "win", create_session_scan_state());
        expect(result.sessions).toHaveLength(1);
        expect(result.sessions[0]!.id).toBe("ok");
    });

    it("returns empty when the directory does not exist", () => {
        const result = scan_session_jsonls(
            path.join(projects_dir, "does-not-exist"),
            "win",
            create_session_scan_state(),
        );
        expect(result.sessions).toEqual([]);
        expect(result.new_state.mtimes.size).toBe(0);
    });

    // Regression: subagent transcripts (<id>/subagents/agent-*.jsonl) carry the
    // parent sessionId. Per-file rows keyed by sessionId made the store's
    // REPLACE clobber sibling files, undercounting tokens (~3x in the wild).
    it("merges subagent files sharing a sessionId into one session", () => {
        write_session("proj-a/sess-9.jsonl", [
            session_line("user", T1, { cwd: "/work/a", message: { content: "main session" } }),
            assistant_line(T2, "sonnet"),
        ]);
        write_session("proj-a/sess-9/subagents/agent-aaa.jsonl", [
            session_line("assistant", T2, {
                sessionId: "sess-9",
                message: { model: "sonnet", usage: { input_tokens: 100, output_tokens: 50 } },
            }),
        ]);
        write_session("proj-a/sess-9/subagents/agent-bbb.jsonl", [
            session_line("assistant", T3, {
                sessionId: "sess-9",
                message: { model: "sonnet", usage: { input_tokens: 200, output_tokens: 60 } },
            }),
        ]);

        const result = scan_session_jsonls(projects_dir, "win", create_session_scan_state());

        expect(result.sessions).toHaveLength(1);
        const s = result.sessions[0]!;
        expect(s.id).toBe("sess-9");
        expect(s.calls).toBe(3);
        expect(s.input_tokens).toBe(310); // 10 + 100 + 200
        expect(s.output_tokens).toBe(115); // 5 + 50 + 60
        expect(s.title).toBe("main session"); // main transcript wins over agent prompts
        expect(s.directory).toBe("/work/a");

        expect(result.daily).toHaveLength(1);
        expect(result.daily[0]!.id).toBe("sess-9");
        expect(result.daily[0]!.input_tokens).toBe(310);
        expect(result.daily[0]!.calls).toBe(3);
    });

    it("re-merges the whole session when only a subagent file changes", () => {
        write_session("proj-a/sess-10.jsonl", [assistant_line(T1, "sonnet")]);
        const agent = "proj-a/sess-10/subagents/agent-aaa.jsonl";
        write_session(agent, [
            session_line("assistant", T2, {
                sessionId: "sess-10",
                message: { model: "sonnet", usage: { input_tokens: 100, output_tokens: 50 } },
            }),
        ]);

        const first = scan_session_jsonls(projects_dir, "win", create_session_scan_state());
        expect(first.sessions[0]!.input_tokens).toBe(110);

        // Append to the agent file only: the re-emitted row must still carry
        // the main file's tokens, or the store's REPLACE would drop them.
        const full = path.join(projects_dir, agent);
        fs.appendFileSync(
            full,
            session_line("assistant", T3, {
                sessionId: "sess-10",
                message: { model: "sonnet", usage: { input_tokens: 5, output_tokens: 1 } },
            }) + "\n",
            "utf-8",
        );
        const future = new Date(Date.now() + 5000);
        fs.utimesSync(full, future, future);

        const second = scan_session_jsonls(projects_dir, "win", first.new_state);
        expect(second.sessions).toHaveLength(1);
        expect(second.sessions[0]!.input_tokens).toBe(115); // 10 + 100 + 5
        expect(second.daily[0]!.input_tokens).toBe(115);
    });

    it("re-merges when a session file is deleted", () => {
        write_session("proj-a/sess-11.jsonl", [assistant_line(T1, "sonnet")]);
        const agent = "proj-a/sess-11/subagents/agent-aaa.jsonl";
        write_session(agent, [
            session_line("assistant", T2, {
                sessionId: "sess-11",
                message: { model: "sonnet", usage: { input_tokens: 100, output_tokens: 50 } },
            }),
        ]);

        const first = scan_session_jsonls(projects_dir, "win", create_session_scan_state());
        expect(first.sessions[0]!.input_tokens).toBe(110);

        fs.rmSync(path.join(projects_dir, agent));

        const second = scan_session_jsonls(projects_dir, "win", first.new_state);
        expect(second.sessions).toHaveLength(1);
        expect(second.sessions[0]!.input_tokens).toBe(10); // main transcript only
        expect(second.daily[0]!.input_tokens).toBe(10);
    });
});

// 构造 OpenAI 协议语义的 assistant 行：input_tokens 含 cache_read（见
// docs/research/token-cache-openai-semantics.md）
function openai_semantic_line(
    timestamp: string,
    model: string,
    input: number,
    cache_read: number,
    output = 5,
) {
    return session_line("assistant", timestamp, {
        message: {
            model,
            usage: {
                input_tokens: input,
                output_tokens: output,
                cache_read_input_tokens: cache_read,
                cache_creation_input_tokens: 0,
            },
        },
    });
}

// deepseek / longcat 经 new-api 以 OpenAI 协议接入，input_tokens 含 cache_read。
// 采集时需归一化为 input -= cache_read，否则 hitRateOf = read/(input+read)
// 双重计数把真实 ~65% 算成 ~37%。详见 docs/research/token-cache-openai-semantics.md
describe("scan_session_jsonls - OpenAI semantic input normalization", () => {
    let projects_dir: string;

    beforeEach(() => {
        projects_dir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-openai-sem-"));
    });

    afterEach(() => {
        fs.rmSync(projects_dir, { recursive: true, force: true });
    });

    function write_session(rel: string, lines: string[]) {
        const full = path.join(projects_dir, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, lines.join("\n") + "\n", "utf-8");
    }

    it("deepseek-v4-pro 命中时归一化 input（扣除 cache_read）", () => {
        write_session("p/s.jsonl", [openai_semantic_line(T2, "deepseek-v4-pro", 38083, 38016)]);
        const result = scan_session_jsonls(projects_dir, "win", create_session_scan_state());

        const rec = result.records[0]!;
        expect(rec.input_tokens).toBe(67); // 38083 - 38016
        expect(rec.cache_read_tokens).toBe(38016);
        // session sums 也用归一化值
        expect(result.sessions[0]!.input_tokens).toBe(67);
    });

    it("LongCat-2.0 模型名大小写不敏感，归一化生效", () => {
        write_session("p/s.jsonl", [openai_semantic_line(T2, "LongCat-2.0", 5000, 3000)]);
        const result = scan_session_jsonls(projects_dir, "win", create_session_scan_state());

        expect(result.records[0]!.input_tokens).toBe(2000); // 5000 - 3000
    });

    it("deepseek 未命中（read=0）不归一化", () => {
        write_session("p/s.jsonl", [openai_semantic_line(T2, "deepseek-v4-pro", 38083, 0)]);
        const result = scan_session_jsonls(projects_dir, "win", create_session_scan_state());

        // read=0 时原始 input 就是未缓存输入，两种语义一致，不动
        expect(result.records[0]!.input_tokens).toBe(38083);
    });

    it("deepseek input < cache_read 时跳过归一化（防御负数）", () => {
        write_session("p/s.jsonl", [openai_semantic_line(T2, "deepseek-v4-pro", 100, 200)]);
        const result = scan_session_jsonls(projects_dir, "win", create_session_scan_state());

        expect(result.records[0]!.input_tokens).toBe(100); // 保留原值
    });

    it("claude-opus-4-8（Anthropic 原生语义）不受归一化影响", () => {
        // mimo/glm/opus 等原生语义模型 read >> input，必须保持原值
        write_session("p/s.jsonl", [openai_semantic_line(T2, "claude-opus-4-8", 61, 43840)]);
        const result = scan_session_jsonls(projects_dir, "win", create_session_scan_state());

        expect(result.records[0]!.input_tokens).toBe(61);
        expect(result.records[0]!.cache_read_tokens).toBe(43840);
    });

    it("daily 聚合使用归一化后的 input", () => {
        write_session("p/s.jsonl", [
            openai_semantic_line(T2, "deepseek-v4-pro", 38083, 38016),
            openai_semantic_line(T3, "deepseek-v4-pro", 20000, 15000),
        ]);
        const result = scan_session_jsonls(projects_dir, "win", create_session_scan_state());

        const total_input = result.daily.reduce((s, d) => s + d.input_tokens, 0);
        const total_read = result.daily.reduce((s, d) => s + d.cache_read_tokens, 0);
        expect(total_input).toBe(67 + 5000); // (38083-38016) + (20000-15000)
        expect(total_read).toBe(38016 + 15000);
    });
});
