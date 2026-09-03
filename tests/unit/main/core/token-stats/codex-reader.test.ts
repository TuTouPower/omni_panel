import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { codex_sessions_path } from "../../../../../src/main/core/token-stats/paths";
import { scan_codex_rollouts, create_codex_scan_state } from "../../../../../src/main/core/token-stats/codex-reader";
import {
    create_token_stats_store,
} from "../../../../../src/main/core/token-stats/token-stats-store";

const START = new Date("2026-09-03T17:00:00Z").getTime();

function rollout_line(obj: unknown): string {
    return JSON.stringify(obj);
}

function fixture_rollout(opts: {
    session_id: string;
    cwd: string;
    model: string;
    counts: { ts: string; total: number; input: number; output: number }[];
}): string {
    const lines = [
        rollout_line({
            timestamp: opts.counts[0]?.ts ?? "2026-09-03T17:51:43.486Z",
            ordinal: 0,
            type: "session_meta",
            payload: { session_id: opts.session_id, cwd: opts.cwd },
        }),
        rollout_line({
            timestamp: opts.counts[0]?.ts ?? "2026-09-03T17:51:43.486Z",
            ordinal: 1,
            type: "turn_context",
            payload: { model: opts.model, cwd: opts.cwd },
        }),
    ];
    let ordinal = 2;
    for (const c of opts.counts) {
        lines.push(
            rollout_line({
                timestamp: c.ts,
                ordinal: ordinal++,
                type: "event_msg",
                payload: {
                    type: "token_count",
                    info: {
                        total_token_usage: {
                            input_tokens: c.input,
                            cached_input_tokens: 0,
                            output_tokens: c.output,
                            reasoning_output_tokens: 0,
                            total_tokens: c.total,
                        },
                    },
                },
            }),
        );
    }
    lines.push(rollout_line({ timestamp: "2026-09-03T17:52:00.000Z", ordinal, type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "hi" }] } }));
    return lines.join("\n");
}

function write_rollout(dir: string, name: string, content: string): void {
    const dated = join(dir, "2026", "09", "03");
    mkdirSync(dated, { recursive: true });
    writeFileSync(join(dated, name), content);
}

describe("codex rollout reader (t445)", () => {
    it("AC-001: token_count 差分归因到 session，model/directory 一致", () => {
        const dir = mkdtempSync(join(tmpdir(), "codex-t445-"));
        try {
            write_rollout(
                dir,
                "rollout-2026-09-03T17-51-32-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl",
                fixture_rollout({
                    session_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                    cwd: "/home/testuser/proj",
                    model: "muse-spark-1.3-contributor",
                    counts: [
                        { ts: "2026-09-03T17:51:47.670Z", total: 6374, input: 6138, output: 236 },
                        { ts: "2026-09-03T17:51:51.137Z", total: 12836, input: 12423, output: 413 },
                    ],
                }),
            );
            const result = scan_codex_rollouts(dir, "linux", create_codex_scan_state());
            expect(result.missing).toBe(false);
            expect(result.sessions).toHaveLength(1);
            // 差分之和：12836 - 0 = 12836（首个累计即增量）。
            const session = result.sessions[0];
            expect(session?.model).toBe("muse-spark-1.3-contributor");
            expect(session?.directory).toBe("/home/testuser/proj");
            const tokens =
                (session?.input_tokens ?? 0) + (session?.output_tokens ?? 0);
            expect(tokens).toBe(12836);
            expect(result.records).toHaveLength(2);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("AC-002: 跨小时 token_count 按 timestamp 小时桶拆分", () => {
        const dir = mkdtempSync(join(tmpdir(), "codex-t445-"));
        try {
            write_rollout(
                dir,
                "rollout-2026-09-03T17-51-32-bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl",
                fixture_rollout({
                    session_id: "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee",
                    cwd: "/home/testuser/proj",
                    model: "m",
                    counts: [
                        { ts: "2026-09-03T17:51:47.670Z", total: 1000, input: 900, output: 100 },
                        { ts: "2026-09-03T18:05:00.000Z", total: 2500, input: 2200, output: 300 },
                    ],
                }),
            );
            const result = scan_codex_rollouts(dir, "linux", create_codex_scan_state());
            const hours = new Set(result.records.map((r) => r.timestamp - (r.timestamp % 3600000)));
            expect(hours.size).toBe(2);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("AC-003: 无 token_count 文件跳过；archived 缺失不报错", () => {
        const dir = mkdtempSync(join(tmpdir(), "codex-t445-"));
        try {
            write_rollout(
                dir,
                "rollout-2026-09-03T17-51-32-cccccccc-cccc-cccc-dddd-eeeeeeeeeeee.jsonl",
                rollout_line({ timestamp: "2026-09-03T17:51:43.486Z", ordinal: 0, type: "session_meta", payload: { session_id: "cccccccc-cccc-cccc-dddd-eeeeeeeeeeee", cwd: "/x" } }),
            );
            const result = scan_codex_rollouts(dir, "linux", create_codex_scan_state());
            expect(result.sessions).toHaveLength(0);
            expect(result.records).toHaveLength(0);
            const missing = scan_codex_rollouts(join(dir, "nope"), "linux", create_codex_scan_state());
            expect(missing.missing).toBe(true);
            expect(missing.sessions).toHaveLength(0);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("AC-004: agent=codex 可查且 agent_totals 含 codex", () => {
        const dir = mkdtempSync(join(tmpdir(), "codex-t445-"));
        try {
            write_rollout(
                dir,
                "rollout-2026-09-03T17-51-32-dddddddd-dddd-dddd-dddd-eeeeeeeeeeee.jsonl",
                fixture_rollout({
                    session_id: "dddddddd-dddd-dddd-dddd-eeeeeeeeeeee",
                    cwd: "/home/testuser/proj",
                    model: "m",
                    counts: [{ ts: "2026-09-03T17:10:00.000Z", total: 500, input: 400, output: 100 }],
                }),
            );
            const scanned = scan_codex_rollouts(dir, "linux", create_codex_scan_state());
            const store = create_token_stats_store(":memory:");
            try {
                store.upsert_sessions(scanned.sessions, scanned.daily);
                store.upsert_records(scanned.records);
                const by_source = store.query_sessions({ source: "codex" });
                expect(by_source.length).toBeGreaterThan(0);
                const by_agent = store.query_records({ agent: "codex" });
                expect(by_agent.length).toBeGreaterThan(0);
                const dashboard = store.query_dashboard(
                    { agent: "all", platform: "all", start: START, end: START + 3600000, metric: "tokens", xaxis: "time", gran: "hour" },
                    { running: true, last_updated: null },
                );
                const codex_total = dashboard.current.agent_totals.find((t) => t.key === "codex");
                expect(codex_total).toBeDefined();
                expect(codex_total?.value).toBe(500);
            } finally {
                store.close();
            }
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("paths: codex_sessions_path 解析 ~/.codex/sessions", () => {
        const p = codex_sessions_path(
            { host: "linux", homedir: "/home/testuser", win_home: "", wsl_distro: "Ubuntu-22.04", wsl_user: "" },
            "linux",
        );
        expect(p).toBe("/home/testuser/.codex/sessions");
    });
});
