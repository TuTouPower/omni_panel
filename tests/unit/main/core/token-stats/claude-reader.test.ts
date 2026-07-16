import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { read_costs_jsonl } from "../../../../../src/main/core/token-stats/claude-reader";

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
        expect(s1.calls).toBe(1);
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
        expect(result.sessions[0].id).toBe("real");
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
        expect(result.sessions[0].id).toBe("s2");
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

        const s = result.sessions[0];
        // Latest timestamp is T3 -> model=opus, input=300, output=120
        expect(s.model).toBe("claude-opus-4-20250514");
        expect(s.input_tokens).toBe(300);
        expect(s.output_tokens).toBe(120);
        expect(s.calls).toBe(3);
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
        expect(second.sessions[0].id).toBe("s3");
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
        expect(second.sessions[0].id).toBe("s2");
    });

    it("defaults missing cache tokens to 0", () => {
        write(line("s1", "claude-sonnet-4-20250514", 100, 50, T1) + "\n");

        const result = read_costs_jsonl(jsonl_path, "win", 0, 0);
        expect(result.sessions[0].cache_read_tokens).toBe(0);
        expect(result.sessions[0].cache_write_tokens).toBe(0);
    });

    it("reads cache tokens when present", () => {
        write(
            line("s1", "claude-sonnet-4-20250514", 100, 50, T1, {
                cache_read_tokens: 500,
                cache_write_tokens: 300,
            }) + "\n",
        );

        const result = read_costs_jsonl(jsonl_path, "win", 0, 0);
        expect(result.sessions[0].cache_read_tokens).toBe(500);
        expect(result.sessions[0].cache_write_tokens).toBe(300);
    });

    it("propagates env parameter", () => {
        write(line("s1", "claude-sonnet-4-20250514", 100, 50, T1) + "\n");

        const result = read_costs_jsonl(jsonl_path, "wsl", 0, 0);
        expect(result.sessions[0].env).toBe("wsl");
    });
});
