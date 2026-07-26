/* eslint-disable @typescript-eslint/no-non-null-assertion */
import * as fs from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { utimesSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import type { TokenStatsEnv } from "../../../../../src/shared/types/token-stats";
import {
    create_kimi_scan_state,
    scan_kimi_wire_jsonls,
} from "../../../../../src/main/core/token-stats/kimi-reader";

function make_tmp(): string {
    return mkdtempSync(join(tmpdir(), "kimi-reader-"));
}

function write_wire(
    sessions_dir: string,
    ws_id: string,
    session_id: string,
    lines: string[],
): string {
    const file = join(sessions_dir, ws_id, session_id, "agents", "main", "wire.jsonl");
    fs.mkdirSync(dirname(file), { recursive: true });
    fs.writeFileSync(file, `${lines.join("\n")}\n`);
    return file;
}

function touch(file: string, ms: number): void {
    utimesSync(file, ms / 1000, ms / 1000);
}

function write_index(tmp: string, entries: { sessionId: string; workDir: string }[]): string {
    const file = join(tmp, "session_index.jsonl");
    fs.writeFileSync(file, `${entries.map((e) => JSON.stringify(e)).join("\n")}\n`);
    return file;
}

function usage_record(opts: {
    model?: string;
    inputOther?: number;
    output?: number;
    inputCacheRead?: number;
    inputCacheCreation?: number;
    usageScope?: string;
    time?: number;
}): string {
    return JSON.stringify({
        type: "usage.record",
        model: opts.model ?? "kimi-code/k3",
        usage: {
            inputOther: opts.inputOther ?? 0,
            output: opts.output ?? 0,
            inputCacheRead: opts.inputCacheRead ?? 0,
            inputCacheCreation: opts.inputCacheCreation ?? 0,
        },
        usageScope: opts.usageScope ?? "turn",
        time: opts.time ?? 1784217963778,
    });
}

function user_msg(text: string, time = 1784217963000): string {
    return JSON.stringify({
        type: "context.append_message",
        message: {
            role: "user",
            content: [{ type: "text", text }],
            origin: { kind: "user" },
        },
        time,
    });
}

const ENV: TokenStatsEnv = "win";
const T0 = 1784217963778;
const T1 = 1784304000000;

describe("scan_kimi_wire_jsonls", () => {
    let tmp: string;
    let sessions_dir: string;

    beforeEach(() => {
        tmp = make_tmp();
        sessions_dir = join(tmp, "sessions");
        fs.mkdirSync(sessions_dir, { recursive: true });
    });

    it("maps a single turn usage.record to one record with correct fields", () => {
        const index = write_index(tmp, [
            { sessionId: "session_abc", workDir: "D:/Dev/Code/omni_panel" },
        ]);
        const file = write_wire(sessions_dir, "wd_x", "session_abc", [
            usage_record({
                inputOther: 3464,
                output: 52,
                inputCacheRead: 17920,
                inputCacheCreation: 0,
            }),
        ]);
        touch(file, T0);

        const result = scan_kimi_wire_jsonls(sessions_dir, ENV, index, create_kimi_scan_state());

        expect(result.records).toHaveLength(1);
        expect(result.records[0]).toMatchObject({
            source: "kimi_code",
            env: "win",
            agent: "kimi-code",
            session_id: "session_abc",
            model: "kimi-code/k3",
            timestamp: T0,
            input_tokens: 3464,
            output_tokens: 52,
            cache_read_tokens: 17920,
            cache_write_tokens: 0,
            directory: "D:/Dev/Code/omni_panel",
        });

        expect(result.sessions).toHaveLength(1);
        expect(result.sessions[0]).toMatchObject({
            id: "session_abc",
            source: "kimi_code",
            env: "win",
            model: "kimi-code/k3",
            calls: 1,
            input_tokens: 3464,
            output_tokens: 52,
            cache_read_tokens: 17920,
            cache_write_tokens: 0,
            directory: "D:/Dev/Code/omni_panel",
            started_at: T0,
            ended_at: T0,
        });

        expect(result.daily).toHaveLength(1);
        expect(result.daily[0]).toMatchObject({
            id: "session_abc",
            source: "kimi_code",
            env: "win",
            model: "kimi-code/k3",
            calls: 1,
            input_tokens: 3464,
        });
    });

    it("ignores usageScope=session aggregate rows to avoid double counting", () => {
        const index = write_index(tmp, [{ sessionId: "session_agg", workDir: "D:/p" }]);
        const file = write_wire(sessions_dir, "wd_x", "session_agg", [
            usage_record({
                inputOther: 100,
                output: 10,
                inputCacheRead: 0,
                time: T0,
            }),
            usage_record({
                inputOther: 999999,
                usageScope: "session",
                inputCacheRead: 211968,
                time: T0 + 1000,
            }),
        ]);
        touch(file, T0);

        const result = scan_kimi_wire_jsonls(sessions_dir, ENV, index, create_kimi_scan_state());

        expect(result.records).toHaveLength(1);
        expect(result.records[0]!.input_tokens).toBe(100);
        expect(result.sessions[0]!.input_tokens).toBe(100);
    });

    it("accumulates multiple turns and buckets daily by utc date + model", () => {
        const index = write_index(tmp, [{ sessionId: "session_multi", workDir: "D:/p" }]);
        const file = write_wire(sessions_dir, "wd_x", "session_multi", [
            usage_record({
                model: "kimi-code/k3",
                inputOther: 100,
                output: 10,
                time: T0,
            }),
            usage_record({
                model: "kimi-code/k3",
                inputOther: 200,
                output: 20,
                time: T0 + 1,
            }),
            usage_record({
                model: "kimi-code/kimi-for-coding",
                inputOther: 50,
                output: 5,
                time: T1,
            }),
        ]);
        touch(file, T0);

        const result = scan_kimi_wire_jsonls(sessions_dir, ENV, index, create_kimi_scan_state());

        expect(result.records).toHaveLength(3);
        expect(result.sessions[0]!.calls).toBe(3);
        expect(result.sessions[0]!.input_tokens).toBe(350);
        expect(result.sessions[0]!.started_at).toBe(T0);
        expect(result.sessions[0]!.ended_at).toBe(T1);

        // Two distinct (date, model) buckets.
        expect(result.daily).toHaveLength(2);
        const k3 = result.daily.find((d) => d.model === "kimi-code/k3")!;
        expect(k3.input_tokens).toBe(300);
        expect(k3.calls).toBe(2);
    });

    it("falls back directory to null when index is missing or session not in index", () => {
        const no_index = join(tmp, "missing.jsonl");
        const file = write_wire(sessions_dir, "wd_x", "session_no_idx", [
            usage_record({ time: T0 }),
        ]);
        touch(file, T0);

        const r1 = scan_kimi_wire_jsonls(sessions_dir, ENV, no_index, create_kimi_scan_state());
        expect(r1.records[0]!.directory).toBeNull();

        const index = write_index(tmp, [{ sessionId: "session_other", workDir: "D:/other" }]);
        const r2 = scan_kimi_wire_jsonls(sessions_dir, ENV, index, create_kimi_scan_state());
        expect(r2.records[0]!.directory).toBeNull();
    });

    it("derives title from first user text, then workDir basename, then null", () => {
        // user text present
        const idxA = write_index(tmp, [{ sessionId: "session_a", workDir: "D:/p" }]);
        const fileA = write_wire(sessions_dir, "wd_a", "session_a", [
            user_msg("fix the login bug"),
            usage_record({ time: T0 }),
        ]);
        touch(fileA, T0);
        const ra = scan_kimi_wire_jsonls(sessions_dir, ENV, idxA, create_kimi_scan_state());
        expect(ra.sessions.find((s) => s.id === "session_a")!.title).toBe("fix the login bug");

        // no user text → workDir basename
        const idxB = write_index(tmp, [
            { sessionId: "session_b", workDir: "D:/Dev/Code/dream_skin" },
        ]);
        const fileB = write_wire(sessions_dir, "wd_b", "session_b", [usage_record({ time: T0 })]);
        touch(fileB, T0);
        const rb = scan_kimi_wire_jsonls(sessions_dir, ENV, idxB, create_kimi_scan_state());
        expect(rb.sessions.find((s) => s.id === "session_b")!.title).toBe("dream_skin");

        // no user text, no workDir → null
        const idxC = write_index(tmp, []);
        const fileC = write_wire(sessions_dir, "wd_c", "session_c", [usage_record({ time: T0 })]);
        touch(fileC, T0);
        const rc = scan_kimi_wire_jsonls(sessions_dir, ENV, idxC, create_kimi_scan_state());
        expect(rc.sessions.find((s) => s.id === "session_c")!.title).toBeNull();
    });

    it("skips unchanged files via mtime and re-merges on change", () => {
        const index = write_index(tmp, [{ sessionId: "session_m", workDir: "D:/p" }]);
        const file = write_wire(sessions_dir, "wd_x", "session_m", [
            usage_record({ inputOther: 100, time: T0 }),
        ]);
        touch(file, 1000);

        const first = scan_kimi_wire_jsonls(sessions_dir, ENV, index, create_kimi_scan_state());
        expect(first.records).toHaveLength(1);

        // Second scan, same mtime → no dirty work, empty emission, state preserved.
        const second = scan_kimi_wire_jsonls(sessions_dir, ENV, index, first.new_state);
        expect(second.records).toHaveLength(0);
        expect(second.sessions).toHaveLength(0);
        expect(second.new_state.files.size).toBe(1);

        // Append + bump mtime → re-merge, emits full session recount.
        fs.appendFileSync(file, `${usage_record({ inputOther: 200, time: T0 + 1 })}\n`);
        touch(file, 2000);
        const third = scan_kimi_wire_jsonls(sessions_dir, ENV, index, second.new_state);
        expect(third.records).toHaveLength(2);
        expect(third.sessions[0]!.input_tokens).toBe(300);
    });

    it("skips malformed lines but keeps valid ones; whole-file garbage yields no facts", () => {
        const index = write_index(tmp, [{ sessionId: "session_g", workDir: "D:/p" }]);
        const file = write_wire(sessions_dir, "wd_x", "session_g", [
            "not json at all",
            usage_record({ inputOther: 42, time: T0 }),
            '{ "broken":',
        ]);
        touch(file, T0);

        const result = scan_kimi_wire_jsonls(sessions_dir, ENV, index, create_kimi_scan_state());
        expect(result.records).toHaveLength(1);
        expect(result.records[0]!.input_tokens).toBe(42);

        // Entirely garbage file → no usage → no facts, state not written.
        const fileBad = write_wire(sessions_dir, "wd_y", "session_bad", [
            "garbage line one",
            "garbage line two",
        ]);
        touch(fileBad, T0);
        const r2 = scan_kimi_wire_jsonls(sessions_dir, ENV, index, create_kimi_scan_state());
        expect(r2.new_state.files.has(fileBad)).toBe(false);
    });

    it("propagates env to wsl on records and sessions", () => {
        const index = write_index(tmp, [{ sessionId: "session_w", workDir: "/home/testuser/p" }]);
        const file = write_wire(sessions_dir, "wd_x", "session_w", [usage_record({ time: T0 })]);
        touch(file, T0);

        const result = scan_kimi_wire_jsonls(sessions_dir, "wsl", index, create_kimi_scan_state());
        expect(result.records[0]!.env).toBe("wsl");
        expect(result.records[0]!.source).toBe("kimi_code");
        expect(result.records[0]!.agent).toBe("kimi-code");
        expect(result.sessions[0]!.env).toBe("wsl");
        expect(result.daily[0]!.env).toBe("wsl");
    });

    it("returns empty results for an empty sessions directory", () => {
        const index = write_index(tmp, []);
        const result = scan_kimi_wire_jsonls(sessions_dir, ENV, index, create_kimi_scan_state());
        expect(result.records).toEqual([]);
        expect(result.sessions).toEqual([]);
        expect(result.daily).toEqual([]);
    });
});
