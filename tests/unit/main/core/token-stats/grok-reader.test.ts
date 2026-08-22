/* eslint-disable @typescript-eslint/no-non-null-assertion */
import * as fs from "node:fs";
import { mkdtempSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as NodeFs from "node:fs";
import type { PathLike } from "node:fs";

// Intercept readFileSync so one specific path can be made to throw, proving the
// unreadable-file branch of AC5 deterministically. Everything else delegates to
// the real fs — filesystem is an allowed mock boundary for failure injection.
const read_fail_path = vi.hoisted(() => ({ current: null as string | null }));
vi.mock("node:fs", async (importOriginal) => {
    const actual = await importOriginal<typeof NodeFs>();
    return {
        ...actual,
        readFileSync: (p: PathLike, opts?: unknown) => {
            if (read_fail_path.current !== null && p === read_fail_path.current) {
                throw new Error("EACCES: file locked");
            }
            return (actual.readFileSync as (p: PathLike, opts?: unknown) => unknown)(p, opts);
        },
    };
});
import type { TokenStatsEnv } from "../../../../../src/shared/types/token-stats";
import {
    create_grok_scan_state,
    scan_grok_updates,
} from "../../../../../src/main/core/token-stats/grok-reader";

function make_tmp(): string {
    return mkdtempSync(join(tmpdir(), "grok-reader-"));
}

/** Write updates.jsonl at sessions/<enc_cwd>/<session_id>/updates.jsonl. */
function write_updates(
    sessions_dir: string,
    enc_cwd: string,
    session_id: string,
    lines: string[],
): string {
    const file = join(sessions_dir, enc_cwd, session_id, "updates.jsonl");
    fs.mkdirSync(dirname(file), { recursive: true });
    fs.writeFileSync(file, `${lines.join("\n")}\n`);
    return file;
}

function touch(file: string, ms: number): void {
    utimesSync(file, ms / 1000, ms / 1000);
}

function turn_completed(
    opts: {
        prompt_id?: string;
        input?: number;
        output?: number;
        cache_read?: number;
        reasoning?: number;
        model?: string;
        models?: string[];
        ts_sec?: number;
        usage?: boolean;
    } = {},
): string {
    const prompt_id = opts.prompt_id ?? "019f9fe0-cae5-7d31-bf17-d3292a086bcc";
    const model = opts.model ?? "grok-4.5-build";
    const models = opts.models ?? [model];
    const input = opts.input ?? 100;
    const output = opts.output ?? 52;
    const cache_read = opts.cache_read ?? 20;
    const reasoning = opts.reasoning ?? 30;
    const ts_sec = opts.ts_sec ?? 1785093854;
    const usage =
        opts.usage === false
            ? undefined
            : {
                  inputTokens: input,
                  outputTokens: output,
                  totalTokens: input + output,
                  cachedReadTokens: cache_read,
                  reasoningTokens: reasoning,
                  modelCalls: 1,
                  apiDurationMs: 1000,
                  costUsdTicks: 0,
                  modelUsage: Object.fromEntries(
                      models.map((m) => [
                          m,
                          {
                              inputTokens: input,
                              outputTokens: output,
                              totalTokens: input + output,
                              cachedReadTokens: cache_read,
                              reasoningTokens: reasoning,
                              modelCalls: 1,
                              apiDurationMs: 1000,
                              costUsdTicks: 0,
                          },
                      ]),
                  ),
                  numTurns: 1,
              };
    return JSON.stringify({
        timestamp: ts_sec,
        method: "_x.ai/session/update",
        params: {
            update: {
                sessionUpdate: "turn_completed",
                prompt_id,
                stop_reason: "end_turn",
                usage,
            },
        },
    });
}

const ENC_CWD = "%2Fhome%2Fkaron%2Fgithub_repo";
const ENV: TokenStatsEnv = "linux";
const T0_MS = 1785093854000;

describe("scan_grok_updates", () => {
    let tmp: string;
    let sessions_dir: string;

    beforeEach(() => {
        tmp = make_tmp();
        sessions_dir = join(tmp, "sessions");
        fs.mkdirSync(sessions_dir, { recursive: true });
    });

    it("maps a single turn_completed to one record with correct fields", () => {
        const file = write_updates(sessions_dir, ENC_CWD, "session_abc", [
            turn_completed({ input: 3464, output: 52, cache_read: 17920, reasoning: 30 }),
        ]);
        touch(file, T0_MS);

        const result = scan_grok_updates(sessions_dir, ENV, create_grok_scan_state());

        expect(result.records).toHaveLength(1);
        expect(result.records[0]).toMatchObject({
            source: "grok",
            env: "linux",
            agent: "grok",
            session_id: "session_abc",
            message_id: "019f9fe0-cae5-7d31-bf17-d3292a086bcc",
            role: "assistant",
            timestamp: T0_MS,
            model: "grok-4.5-build",
            input_tokens: 3464,
            output_tokens: 52,
            cache_read_tokens: 17920,
            cache_write_tokens: 0,
            directory: "/home/karon/github_repo",
        });

        expect(result.sessions).toHaveLength(1);
        expect(result.sessions[0]).toMatchObject({
            id: "session_abc",
            source: "grok",
            env: "linux",
            model: "grok-4.5-build",
            calls: 1,
            input_tokens: 3464,
            output_tokens: 52,
            cache_read_tokens: 17920,
            cache_write_tokens: 0,
            directory: "/home/karon/github_repo",
            started_at: T0_MS,
            ended_at: T0_MS,
        });

        expect(result.daily).toHaveLength(1);
        expect(result.daily[0]).toMatchObject({
            id: "session_abc",
            source: "grok",
            env: "linux",
            model: "grok-4.5-build",
            calls: 1,
            input_tokens: 3464,
        });
    });

    it("counts reasoning within output and never double-counts it", () => {
        const file = write_updates(sessions_dir, ENC_CWD, "session_r", [
            turn_completed({ input: 100, output: 52, reasoning: 30 }),
        ]);
        touch(file, T0_MS);

        const result = scan_grok_updates(sessions_dir, ENV, create_grok_scan_state());
        expect(result.records[0]!.output_tokens).toBe(52);
        expect(result.records[0]!.cache_write_tokens).toBe(0);
        expect(result.sessions[0]!.output_tokens).toBe(52);
    });

    it("skips turn_completed events without usage (observed 23/1055)", () => {
        const file = write_updates(sessions_dir, ENC_CWD, "session_no_usage", [
            turn_completed({ usage: false }),
        ]);
        touch(file, T0_MS);

        const result = scan_grok_updates(sessions_dir, ENV, create_grok_scan_state());
        expect(result.records).toHaveLength(0);
        expect(result.sessions).toHaveLength(0);
        expect(result.daily).toHaveLength(0);
        // File still tracked so it is not re-read on every scan.
        expect(result.new_state.files.has(file)).toBe(false);
        expect(result.new_state.mtimes.has(file)).toBe(true);
    });

    it("accumulates multiple turns and buckets daily by date + model", () => {
        const file = write_updates(sessions_dir, ENC_CWD, "session_multi", [
            turn_completed({
                prompt_id: "p1",
                model: "grok-4.5-build",
                input: 100,
                output: 10,
                ts_sec: 1785093854,
            }),
            turn_completed({
                prompt_id: "p2",
                model: "grok-4.5-build",
                input: 200,
                output: 20,
                ts_sec: 1785093855,
            }),
            turn_completed({
                prompt_id: "p3",
                model: "grok-4.5",
                input: 50,
                output: 5,
                ts_sec: 1785180300,
            }),
        ]);
        touch(file, T0_MS);

        const result = scan_grok_updates(sessions_dir, ENV, create_grok_scan_state());

        expect(result.records).toHaveLength(3);
        expect(result.records.map((r) => r.message_id).sort()).toEqual(["p1", "p2", "p3"]);
        expect(result.sessions[0]!.calls).toBe(3);
        expect(result.sessions[0]!.input_tokens).toBe(350);
        expect(result.sessions[0]!.started_at).toBe(1785093854000);
        expect(result.sessions[0]!.ended_at).toBe(1785180300000);

        // Two distinct (date, model) buckets.
        expect(result.daily).toHaveLength(2);
        const build = result.daily.find((d) => d.model === "grok-4.5-build")!;
        expect(build.input_tokens).toBe(300);
        expect(build.calls).toBe(2);
    });

    it("joins multiple modelUsage keys into the record model", () => {
        const file = write_updates(sessions_dir, ENC_CWD, "session_multi_model", [
            turn_completed({
                prompt_id: "pm",
                models: ["grok-4.5", "grok-4.5-build"],
                input: 300,
                output: 30,
            }),
        ]);
        touch(file, T0_MS);

        const result = scan_grok_updates(sessions_dir, ENV, create_grok_scan_state());
        expect(result.records[0]!.model).toBe("grok-4.5+grok-4.5-build");
        // Tokens still come from the top-level aggregate (already the turn total).
        expect(result.records[0]!.input_tokens).toBe(300);
    });

    it("derives title from decoded cwd basename", () => {
        const file = write_updates(sessions_dir, ENC_CWD, "session_t", [turn_completed()]);
        touch(file, T0_MS);
        const result = scan_grok_updates(sessions_dir, ENV, create_grok_scan_state());
        expect(result.sessions.find((s) => s.id === "session_t")!.title).toBe("github_repo");
        expect(result.records.find((r) => r.session_id === "session_t")!.title).toBe("github_repo");
    });

    it("skips unchanged files via mtime and re-merges on change", () => {
        const file = write_updates(sessions_dir, ENC_CWD, "session_m", [
            turn_completed({ prompt_id: "p1", input: 100 }),
        ]);
        touch(file, 1000);

        const first = scan_grok_updates(sessions_dir, ENV, create_grok_scan_state());
        expect(first.records).toHaveLength(1);

        // Second scan, same mtime -> no dirty work, empty emission, state preserved.
        const second = scan_grok_updates(sessions_dir, ENV, first.new_state);
        expect(second.records).toHaveLength(0);
        expect(second.sessions).toHaveLength(0);
        expect(second.new_state.files.size).toBe(1);

        // Append + bump mtime -> re-merge, emits full session recount.
        fs.appendFileSync(file, `${turn_completed({ prompt_id: "p2", input: 200 })}\n`);
        touch(file, 2000);
        const third = scan_grok_updates(sessions_dir, ENV, second.new_state);
        expect(third.records).toHaveLength(2);
        expect(third.sessions[0]!.input_tokens).toBe(300);
    });

    it("skips malformed lines but keeps valid ones; whole-file garbage yields no facts", () => {
        const file = write_updates(sessions_dir, ENC_CWD, "session_g", [
            "not json at all",
            turn_completed({ prompt_id: "p1", input: 42 }),
            '{ "broken":',
        ]);
        touch(file, T0_MS);

        const result = scan_grok_updates(sessions_dir, ENV, create_grok_scan_state());
        expect(result.records).toHaveLength(1);
        expect(result.records[0]!.input_tokens).toBe(42);

        const file_bad = write_updates(sessions_dir, ENC_CWD, "session_bad", [
            "garbage line one",
            "garbage line two",
        ]);
        touch(file_bad, T0_MS);
        const r2 = scan_grok_updates(sessions_dir, ENV, create_grok_scan_state());
        expect(r2.new_state.files.has(file_bad)).toBe(false);
    });

    it("propagates env to wsl on records and sessions", () => {
        const file = write_updates(sessions_dir, ENC_CWD, "session_w", [turn_completed()]);
        touch(file, T0_MS);

        const result = scan_grok_updates(sessions_dir, "wsl", create_grok_scan_state());
        expect(result.records[0]!.env).toBe("wsl");
        expect(result.records[0]!.source).toBe("grok");
        expect(result.records[0]!.agent).toBe("grok");
        expect(result.sessions[0]!.env).toBe("wsl");
        expect(result.daily[0]!.env).toBe("wsl");
    });

    it("returns empty results for an empty sessions directory", () => {
        const result = scan_grok_updates(sessions_dir, ENV, create_grok_scan_state());
        expect(result.records).toEqual([]);
        expect(result.sessions).toEqual([]);
        expect(result.daily).toEqual([]);
    });

    it("tolerates a missing sessions directory (t197 AC5)", () => {
        const missing = join(tmp, "does-not-exist");
        const result = scan_grok_updates(missing, ENV, create_grok_scan_state());
        expect(result.records).toEqual([]);
        expect(result.sessions).toEqual([]);
        expect(result.missing).toBe(true);
    });

    it("reports missing=false when the sessions directory exists", () => {
        const result = scan_grok_updates(sessions_dir, ENV, create_grok_scan_state());
        expect(result.missing).toBe(false);
    });

    it("treats an unreadable sessions path (a file, not a dir) as missing (t197 AC5)", () => {
        const file_path = join(tmp, "not_a_dir");
        fs.writeFileSync(file_path, "x");
        const result = scan_grok_updates(file_path, ENV, create_grok_scan_state());
        expect(result.missing).toBe(true);
        expect(result.records).toEqual([]);
        expect(result.sessions).toEqual([]);
    });

    it("flags the source unreadable when one updates.jsonl cannot be read, still collecting the rest (t197 AC5)", () => {
        const good = write_updates(sessions_dir, ENC_CWD, "session_ok", [turn_completed()]);
        touch(good, 1000);
        const bad = write_updates(sessions_dir, ENC_CWD, "session_bad", [turn_completed()]);
        touch(bad, 2000);

        read_fail_path.current = bad;
        try {
            const result = scan_grok_updates(sessions_dir, ENV, create_grok_scan_state());
            // t345 AC-001: 目录未缺失 → missing=false；部分文件不可读 → file_unreadable=true。
            expect(result.missing).toBe(false);
            expect(result.file_unreadable).toBe(true);
            // The readable file is still collected; the unreadable one is skipped.
            expect(result.records).toHaveLength(1);
            expect(result.records[0]!.session_id).toBe("session_ok");
        } finally {
            read_fail_path.current = null;
        }
    });

    it("retries an unreadable file on the next scan instead of skipping it forever", () => {
        const file = write_updates(sessions_dir, ENC_CWD, "session_x", [
            turn_completed({ input: 100 }),
        ]);
        touch(file, 1000);

        read_fail_path.current = file;
        let first: ReturnType<typeof scan_grok_updates>;
        try {
            first = scan_grok_updates(sessions_dir, ENV, create_grok_scan_state());
        } finally {
            read_fail_path.current = null;
        }

        expect(first.missing).toBe(false);
        expect(first.file_unreadable).toBe(true);
        expect(first.records).toHaveLength(0);
        // mtime is NOT committed for the failed file -> next scan retries it.
        expect(first.new_state.mtimes.has(file)).toBe(false);

        const second = scan_grok_updates(sessions_dir, ENV, first.new_state);
        expect(second.missing).toBe(false);
        expect(second.file_unreadable).toBe(false);
        expect(second.records).toHaveLength(1);
        expect(second.records[0]!.input_tokens).toBe(100);
    });
});
