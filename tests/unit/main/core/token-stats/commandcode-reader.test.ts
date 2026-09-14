import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
    create_commandcode_scan_state,
    scan_commandcode_jsonls,
} from "../../../../../src/main/core/token-stats/commandcode-reader";
import type { CommandCodeScanState } from "../../../../../src/main/core/token-stats/commandcode-reader";
import {
    deserialize_bucket,
    serialize_state,
} from "../../../../../src/main/core/token-stats/scan-state";

const temp_dirs: string[] = [];

function fixture_root(): { root: string; file: string; session_id: string } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "t483-commandcode-"));
    temp_dirs.push(root);
    const project_dir = path.join(root, "encoded-project");
    fs.mkdirSync(project_dir);
    const session_id = "session-commandcode-1";
    const file = path.join(project_dir, `${session_id}.jsonl`);
    fs.writeFileSync(
        path.join(project_dir, `${session_id}.meta.json`),
        JSON.stringify({ title: "Command Code fixture" }),
    );
    fs.writeFileSync(
        path.join(project_dir, `${session_id}.checkpoints.jsonl`),
        JSON.stringify({
            type: "session",
            id: "checkpoint-must-not-be-read",
            cwd: "/wrong",
        }) +
            "\n" +
            JSON.stringify({
                type: "message",
                message: { role: "assistant" },
                model: "wrong-model",
                timestamp: "2026-09-14T04:00:00.000Z",
                usage: { inputTokens: 9999, outputTokens: 9999 },
            }) +
            "\n",
    );
    fs.writeFileSync(
        path.join(root, "history.jsonl"),
        JSON.stringify({ type: "message", usage: { inputTokens: 9999 } }) + "\n",
    );
    fs.writeFileSync(file, fixture_content(session_id));
    return { root, file, session_id };
}

function fixture_content(session_id: string): string {
    const rows = [
        {
            type: "session",
            id: session_id,
            cwd: "/home/test/project",
            timestamp: "2026-09-14T01:00:00.000Z",
        },
        {
            type: "message",
            id: "assistant-1",
            timestamp: "2026-09-14T01:10:00.000Z",
            model: "deepseek/test",
            message: { role: "assistant", content: [] },
            usage: {
                inputTokens: 100,
                outputTokens: 40,
                cacheReadTokens: 20,
                cacheWriteTokens: 2,
                costUsd: 0.4,
            },
        },
        {
            type: "message",
            id: "assistant-2",
            timestamp: "2026-09-14T01:30:00.000Z",
            model: "deepseek/test",
            message: { role: "assistant", content: [] },
            usage: {
                inputTokens: 90,
                outputTokens: 10,
                cacheReadTokens: 10,
                cacheWriteTokens: 0,
                costUsd: 0.1,
            },
        },
        {
            type: "message",
            id: "assistant-3",
            timestamp: "2026-09-14T02:05:00.000Z",
            model: "deepseek/test",
            message: { role: "assistant", content: [] },
            usage: {
                inputTokens: 80,
                outputTokens: 30,
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
                costUsd: 0.3,
            },
        },
        {
            type: "message",
            id: "user-1",
            timestamp: "2026-09-14T02:06:00.000Z",
            model: "deepseek/test",
            message: { role: "user", content: [] },
            usage: { inputTokens: 10000, outputTokens: 10000 },
        },
        {
            type: "message",
            id: "assistant-without-usage",
            timestamp: "2026-09-14T02:07:00.000Z",
            model: "deepseek/test",
            message: { role: "assistant", content: [] },
        },
    ];
    return rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
}

afterEach(() => {
    for (const dir of temp_dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("commandcode token reader", () => {
    it("reads assistant usage, title, directory, and per-message hour timestamps", () => {
        const fixture = fixture_root();
        const result = scan_commandcode_jsonls(
            fixture.root,
            "linux",
            create_commandcode_scan_state(),
        );

        expect(result.missing).toBe(false);
        expect(result.file_unreadable).toBe(false);
        expect(result.sessions).toHaveLength(1);
        expect(result.daily).toHaveLength(1);
        expect(result.records).toHaveLength(3);
        expect(result.new_state.files).toHaveLength(1);

        expect(result.sessions[0]).toMatchObject({
            id: fixture.session_id,
            source: "commandcode",
            env: "linux",
            model: "deepseek/test",
            title: "Command Code fixture",
            directory: "/home/test/project",
            input_tokens: 240,
            output_tokens: 80,
            cache_read_tokens: 30,
            cache_write_tokens: 2,
            calls: 3,
        });
        expect(result.daily[0]).toMatchObject({
            id: fixture.session_id,
            model: "deepseek/test",
            input_tokens: 240,
            output_tokens: 80,
            cache_read_tokens: 30,
            cache_write_tokens: 2,
            calls: 3,
        });
        expect(result.records.map((record) => record.message_id)).toEqual([
            "assistant-1",
            "assistant-2",
            "assistant-3",
        ]);
        expect(
            result.records.reduce(
                (sum, record) =>
                    sum +
                    record.input_tokens +
                    record.output_tokens +
                    record.cache_read_tokens +
                    record.cache_write_tokens,
                0,
            ),
        ).toBe(352);
        const hour_start = (timestamp: number) => {
            const local_offset_ms = 8 * 60 * 60 * 1000;
            return timestamp - ((timestamp + local_offset_ms) % (60 * 60 * 1000));
        };
        expect(new Set(result.records.map((record) => hour_start(record.timestamp)))).toEqual(
            new Set([
                hour_start(Date.parse("2026-09-14T01:10:00.000Z")),
                hour_start(Date.parse("2026-09-14T02:05:00.000Z")),
            ]),
        );

        const facts = result.new_state.files.get(fixture.file)?.facts;
        expect(facts?.sums.cost_usd).toBeCloseTo(0.8);
    });

    it("is idempotent, then recounts an appended turn without differencing a fallback", () => {
        const fixture = fixture_root();
        const first = scan_commandcode_jsonls(
            fixture.root,
            "linux",
            create_commandcode_scan_state(),
        );
        const unchanged = scan_commandcode_jsonls(fixture.root, "linux", first.new_state);
        expect(unchanged.sessions).toEqual([]);
        expect(unchanged.daily).toEqual([]);
        expect(unchanged.records).toEqual([]);

        fs.appendFileSync(
            fixture.file,
            JSON.stringify({
                type: "message",
                id: "assistant-4",
                timestamp: "2026-09-14T03:05:00.000Z",
                model: "deepseek/test",
                message: { role: "assistant", content: [] },
                usage: {
                    inputTokens: 50,
                    outputTokens: 5,
                    cacheReadTokens: 5,
                    cacheWriteTokens: 0,
                    costUsd: 0.05,
                },
            }) + "\n",
        );
        const future = new Date(Date.now() + 2000);
        fs.utimesSync(fixture.file, future, future);

        const appended = scan_commandcode_jsonls(fixture.root, "linux", first.new_state);
        expect(appended.sessions[0]).toMatchObject({
            input_tokens: 285,
            output_tokens: 85,
            cache_read_tokens: 35,
            calls: 4,
        });
        expect(appended.records).toHaveLength(4);
        expect(appended.records.at(-1)?.message_id).toBe("assistant-4");
    });

    it("resumes from serialized scan-state and converges with a fresh full scan", () => {
        const fixture = fixture_root();
        const first = scan_commandcode_jsonls(
            fixture.root,
            "linux",
            create_commandcode_scan_state(),
        );
        const serialized = serialize_state({
            costs_state: new Map(),
            opencode_max_updated: new Map(),
            jsonl_states: new Map(),
            kimi_states: new Map(),
            grok_states: new Map(),
            codex_states: new Map(),
            commandcode_states: new Map([["commandcode_linux", first.new_state]]),
            antigravity_states: new Map(),
            source_cursors: new Map(),
        });
        const bucket = serialized.commandcode_states?.["commandcode_linux"];
        expect(bucket).toBeDefined();
        const restored = deserialize_bucket(bucket!);

        const unchanged = scan_commandcode_jsonls(
            fixture.root,
            "linux",
            restored as unknown as CommandCodeScanState,
        );
        expect(unchanged.sessions).toEqual([]);
        expect(unchanged.records).toEqual([]);

        fs.appendFileSync(
            fixture.file,
            JSON.stringify({
                type: "message",
                id: "assistant-after-restart",
                timestamp: "2026-09-14T03:05:00.000Z",
                model: "deepseek/test",
                message: { role: "assistant", content: [] },
                usage: { inputTokens: 50, outputTokens: 5, cacheReadTokens: 5, costUsd: 0.05 },
            }) + "\n",
        );
        const future = new Date(Date.now() + 2000);
        fs.utimesSync(fixture.file, future, future);

        const resumed = scan_commandcode_jsonls(
            fixture.root,
            "linux",
            restored as unknown as CommandCodeScanState,
        );
        const full = scan_commandcode_jsonls(
            fixture.root,
            "linux",
            create_commandcode_scan_state(),
        );
        expect(resumed.sessions).toEqual(full.sessions);
        expect(resumed.daily).toEqual(full.daily);
        expect(resumed.records).toEqual(full.records);
    });
});
