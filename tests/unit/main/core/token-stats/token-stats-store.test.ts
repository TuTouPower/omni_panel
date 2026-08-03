/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import Database from "better-sqlite3";
import { create_token_stats_store } from "../../../../../src/main/core/token-stats/token-stats-store";
import type { TokenStatsStore } from "../../../../../src/main/core/token-stats/token-stats-store";
import { DEFAULT_RECORDS_LIMIT } from "../../../../../src/main/core/token-stats/token-stats-store";
import type {
    AgentSessionUsageRecord,
    TokenStatsDailyUpsert,
    TokenStatsSessionUpsert,
} from "../../../../../src/shared/types/token-stats";

const T0 = new Date("2026-07-10T08:00:00Z").getTime();
const T1 = new Date("2026-07-10T09:00:00Z").getTime();
const T2 = new Date("2026-07-11T10:00:00Z").getTime();

function delta(overrides: Partial<TokenStatsSessionUpsert> = {}): TokenStatsSessionUpsert {
    return {
        id: "s1",
        source: "claude_code",
        env: "win",
        model: "sonnet-4",
        title: null,
        directory: null,
        input_tokens: 1000,
        output_tokens: 500,
        cache_read_tokens: 200,
        cache_write_tokens: 100,
        calls: null,
        started_at: T0,
        ended_at: T1,
        ...overrides,
    };
}

function daily(overrides: Partial<TokenStatsDailyUpsert> = {}): TokenStatsDailyUpsert {
    return {
        id: "s1",
        source: "claude_code",
        env: "win",
        model: "sonnet-4",
        date: "2026-07-10",
        input_tokens: 1000,
        output_tokens: 500,
        cache_read_tokens: 200,
        cache_write_tokens: 100,
        calls: 2,
        ...overrides,
    };
}

function record(overrides: Partial<AgentSessionUsageRecord> = {}): AgentSessionUsageRecord {
    return {
        session_id: "s1",
        title: "hello",
        directory: "/home/user/proj",
        slug: "brave-fox-jumps",
        version: "2.1.170",
        parent_session_id: null,
        message_id: "msg-001",
        role: "assistant",
        timestamp: T0,
        model: "sonnet-4",
        input_tokens: 100,
        output_tokens: 50,
        cache_read_tokens: 10,
        cache_write_tokens: 5,
        agent: "claude-code",
        source: "claude_code",
        env: "win",
        ...overrides,
    };
}

describe("token-stats-store", () => {
    let store: TokenStatsStore;

    beforeEach(() => {
        store = create_token_stats_store(":memory:");
    });

    afterEach(() => {
        store.close();
    });

    describe("session upsert + merge", () => {
        it("inserts a full delta", () => {
            store.upsert_sessions([delta({ title: "hello", calls: 3 })], []);

            const rows = store.query_sessions({});
            expect(rows).toHaveLength(1);
            expect(rows[0]).toMatchObject({
                id: "s1",
                model: "sonnet-4",
                title: "hello",
                input_tokens: 1000,
                calls: 3,
                started_at: T0,
                ended_at: T1,
            });
        });

        it("merges partial deltas: null fields keep existing values", () => {
            // costs.jsonl delta: tokens only
            store.upsert_sessions([delta({ input_tokens: 1000 })], []);
            // session-jsonl delta: calls + title + directory only
            store.upsert_sessions(
                [
                    delta({
                        input_tokens: null,
                        output_tokens: null,
                        cache_read_tokens: null,
                        cache_write_tokens: null,
                        calls: 7,
                        title: "Fix bug",
                        directory: "D:\\proj",
                    }),
                ],
                [],
            );

            const rows = store.query_sessions({});
            expect(rows).toHaveLength(1);
            expect(rows[0]!.input_tokens).toBe(1000); // kept from first delta
            expect(rows[0]!.calls).toBe(7); // from second delta
            expect(rows[0]!.title).toBe("Fix bug");
            expect(rows[0]!.directory).toBe("D:\\proj");
        });

        it("takes newer cumulative token snapshots", () => {
            store.upsert_sessions([delta({ input_tokens: 1000 })], []);
            store.upsert_sessions([delta({ input_tokens: 2500 })], []);

            expect(store.query_sessions({})[0]!.input_tokens).toBe(2500);
        });

        it("started_at converges to MIN, ended_at to MAX", () => {
            store.upsert_sessions([delta({ started_at: T1, ended_at: T1 })], []);
            store.upsert_sessions([delta({ started_at: T0, ended_at: T2 })], []);

            const row = store.query_sessions({})[0]!;
            expect(row.started_at).toBe(T0);
            expect(row.ended_at).toBe(T2);
        });

        it("keeps id+source+env as identity: same id across envs is two rows", () => {
            store.upsert_sessions([delta({})], []);
            store.upsert_sessions([delta({ env: "wsl" })], []);

            expect(store.query_sessions({})).toHaveLength(2);
        });
    });

    describe("daily rows + bucket derivation", () => {
        it("derives buckets from daily rows grouped by (source, env, date, model)", () => {
            store.upsert_sessions([], [daily()]);

            const buckets = store.query_buckets({});
            expect(buckets).toHaveLength(1);
            expect(buckets[0]).toMatchObject({
                source: "claude_code",
                env: "win",
                bucket_date: "2026-07-10",
                model: "sonnet-4",
                input_tokens: 1000,
                output_tokens: 500,
                sessions: 1,
                calls: 2,
            });
        });

        it("counts distinct sessions per bucket", () => {
            store.upsert_sessions(
                [],
                [
                    daily({ id: "A", input_tokens: 1000 }),
                    daily({ id: "B", input_tokens: 500 }),
                    // Same session, another model → separate bucket
                    daily({ id: "A", model: "opus", input_tokens: 100 }),
                ],
            );

            const buckets = store.query_buckets({});
            expect(buckets).toHaveLength(2);
            const sonnet = buckets.find((b) => b.model === "sonnet-4")!;
            expect(sonnet.sessions).toBe(2);
            expect(sonnet.input_tokens).toBe(1500);
        });

        it("REPLACEs daily rows on recount (idempotent full-file rescans)", () => {
            store.upsert_sessions([], [daily({ input_tokens: 1000, calls: 2 })]);
            // File changed → full recount emits updated totals for the same key
            store.upsert_sessions([], [daily({ input_tokens: 1500, calls: 3 })]);

            const bucket = store.query_buckets({})[0]!;
            expect(bucket.input_tokens).toBe(1500);
            expect(bucket.calls).toBe(3);
            expect(bucket.sessions).toBe(1);
        });

        it("regression: usage from finished sessions stays in the bucket", () => {
            // Old bug: buckets were REPLACEd from the latest batch only, so
            // sessions absent from that batch lost their contribution.
            store.upsert_sessions(
                [],
                [daily({ id: "A", input_tokens: 1000 }), daily({ id: "B", input_tokens: 500 })],
            );
            store.upsert_sessions([], [daily({ id: "A", input_tokens: 2000 })]);

            const bucket = store.query_buckets({})[0]!;
            expect(bucket.input_tokens).toBe(2500);
            expect(bucket.sessions).toBe(2);
        });

        it("same session on two days lands in two buckets with per-day values", () => {
            store.upsert_sessions(
                [],
                [
                    daily({ date: "2026-07-10", input_tokens: 1000 }),
                    daily({ date: "2026-07-11", input_tokens: 700 }),
                ],
            );

            const buckets = store.query_buckets({});
            expect(buckets).toHaveLength(2);
            expect(buckets.map((b) => b.bucket_date).sort()).toEqual(["2026-07-10", "2026-07-11"]);
        });

        it("filters buckets by source/env/date range", () => {
            store.upsert_sessions(
                [],
                [
                    daily({ id: "A" }),
                    daily({ id: "B", source: "opencode", env: "wsl", model: "gpt-4" }),
                ],
            );

            expect(store.query_buckets({ source: "claude_code" })).toHaveLength(1);
            expect(store.query_buckets({ env: "wsl" })).toHaveLength(1);
            expect(store.query_buckets({ from_date: "2026-07-11" })).toHaveLength(0);
            expect(store.query_buckets({ from_date: "2026-07-10" })).toHaveLength(2);
        });
    });

    describe("session queries", () => {
        beforeEach(() => {
            store.upsert_sessions(
                [
                    delta({ id: "s1", title: "Frontend work", directory: "/home/user/frontend" }),
                    delta({
                        id: "s2",
                        source: "opencode",
                        env: "wsl",
                        model: "gpt-4",
                        title: "Backend work",
                    }),
                    delta({ id: "s3", title: null, model: "deepseek-v4-pro" }),
                ],
                [],
            );
        });

        it("filters by source and env", () => {
            expect(store.query_sessions({ source: "claude_code" })).toHaveLength(2);
            expect(store.query_sessions({ env: "wsl" })).toHaveLength(1);
        });

        it("searches title, directory, model and id", () => {
            expect(store.query_sessions({ search: "Frontend" })).toHaveLength(1);
            expect(store.query_sessions({ search: "frontend" })).toHaveLength(1); // directory
            expect(store.query_sessions({ search: "deepseek" })).toHaveLength(1); // model
            expect(store.query_sessions({ search: "s3" })).toHaveLength(1); // id
        });

        it("orders by ended_at desc and respects limit", () => {
            const rows = store.query_sessions({ limit: 2 });
            expect(rows).toHaveLength(2);
            expect(rows[0]!.ended_at).toBeGreaterThanOrEqual(rows[1]!.ended_at);
        });
    });

    describe("last_updated", () => {
        it("is null when empty, set after upsert", () => {
            expect(store.last_updated()).toBeNull();
            store.upsert_sessions([delta({})], []);
            expect(store.last_updated()).toBeGreaterThan(0);
        });
    });

    describe("records (AgentSessionUsage contract)", () => {
        it("inserts and queries records", () => {
            store.upsert_records([record({ message_id: "m1" }), record({ message_id: "m2" })]);

            const rows = store.query_records({});
            expect(rows).toHaveLength(2);
            expect(rows[0]).toMatchObject({
                session_id: "s1",
                message_id: "m1",
                agent: "claude-code",
                model: "sonnet-4",
                input_tokens: 100,
            });
        });

        it("filters records by agent and time range", () => {
            store.upsert_records([
                record({ message_id: "m1", agent: "claude-code", timestamp: T0 }),
                record({ message_id: "m2", agent: "opencode", timestamp: T1 }),
                record({ message_id: "m3", agent: "claude-code", timestamp: T2 }),
            ]);

            expect(store.query_records({ agent: "claude-code" })).toHaveLength(2);
            expect(store.query_records({ start: T0, end: T0 + 1 })).toHaveLength(1);
            expect(store.query_records({ start: T0, end: T2, agent: "claude-code" })).toHaveLength(
                2,
            );
        });

        it("filters records by platform and combines with other filters", () => {
            store.upsert_records([
                record({ message_id: "win-claude", env: "win", timestamp: T0 }),
                record({
                    message_id: "wsl-claude",
                    env: "wsl",
                    timestamp: T1,
                }),
                record({
                    message_id: "wsl-opencode",
                    source: "opencode",
                    env: "wsl",
                    agent: "opencode",
                    timestamp: T2,
                }),
            ]);

            expect(store.query_records({})).toHaveLength(3);
            expect(store.query_records({ env: "win" })).toHaveLength(1);
            expect(store.query_records({ env: "wsl" })).toHaveLength(2);
            expect(
                store.query_records({
                    env: "wsl",
                    agent: "claude-code",
                    start: T1,
                    end: T1,
                }),
            ).toHaveLength(1);
        });

        it("replaces records by message_id+source+env (idempotent recounts)", () => {
            store.upsert_records([record({ message_id: "m1", input_tokens: 100 })]);
            store.upsert_records([record({ message_id: "m1", input_tokens: 150 })]);

            const rows = store.query_records({});
            expect(rows).toHaveLength(1);
            expect(rows[0]!.input_tokens).toBe(150);
        });

        it("keeps same message_id across sources as separate rows", () => {
            store.upsert_records([record({ message_id: "m1", source: "claude_code" })]);
            store.upsert_records([
                record({ message_id: "m1", source: "opencode", agent: "opencode" }),
            ]);

            expect(store.query_records({})).toHaveLength(2);
        });

        it("defaults missing numeric fields to 0 and allows null metadata", () => {
            store.upsert_records([
                {
                    session_id: "s1",
                    title: null,
                    directory: null,
                    slug: null,
                    version: null,
                    parent_session_id: null,
                    message_id: "m1",
                    role: "assistant",
                    timestamp: T0,
                    model: "sonnet-4",
                    input_tokens: NaN,
                    output_tokens: undefined,
                    cache_read_tokens: Number("x"),
                    cache_write_tokens: -1,
                    agent: "claude-code",
                    source: "claude_code",
                    env: "win",
                } as unknown as AgentSessionUsageRecord,
            ]);

            const rows = store.query_records({});
            expect(rows[0]!).toMatchObject({
                title: null,
                directory: null,
                input_tokens: 0,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
            });
        });

        it("returns AgentSessionUsage shape without source/env", () => {
            store.upsert_records([record()]);
            const rows = store.query_records({});
            expect("source" in rows[0]!).toBe(false);
            expect("env" in rows[0]!).toBe(false);
        });

        it("applies an explicit limit (keeps newest by timestamp DESC)", () => {
            store.upsert_records([
                record({ message_id: "m1", timestamp: T0 }),
                record({ message_id: "m2", timestamp: T1 }),
                record({ message_id: "m3", timestamp: T2 }),
            ]);

            const rows = store.query_records({ limit: 2 });
            expect(rows).toHaveLength(2);
            // ORDER BY timestamp DESC → newest two kept
            expect(rows.map((r) => r.message_id)).toEqual(["m3", "m2"]);
        });

        it("applies a default limit when filters omit limit", () => {
            // Insert more than the default cap; query without limit should still cap.
            const recs: AgentSessionUsageRecord[] = [];
            for (let i = 0; i < DEFAULT_RECORDS_LIMIT + 5; i++) {
                recs.push(record({ message_id: `m${String(i)}`, timestamp: T0 + i }));
            }
            store.upsert_records(recs);

            expect(store.query_records({})).toHaveLength(DEFAULT_RECORDS_LIMIT);
        });

        it("respects limit alongside window filters", () => {
            const recs: AgentSessionUsageRecord[] = [];
            for (let i = 0; i < 10; i++) {
                recs.push(record({ message_id: `m${String(i)}`, timestamp: T0 + i }));
            }
            store.upsert_records(recs);

            const rows = store.query_records({ start: T0, end: T0 + 9, limit: 3 });
            expect(rows).toHaveLength(3);
            expect(rows.map((r) => r.message_id)).toEqual(["m9", "m8", "m7"]);
        });
    });

    describe("query_range_rollup (24h summary, t184)", () => {
        it("aggregates by (source, model, directory, session_id) without a LIMIT", () => {
            // Two sessions × two models; multiple messages per group.
            store.upsert_records([
                record({ message_id: "a1", session_id: "s1", model: "sonnet-4", timestamp: T0 }),
                record({ message_id: "a2", session_id: "s1", model: "sonnet-4", timestamp: T1 }),
                record({ message_id: "a3", session_id: "s1", model: "opus", timestamp: T1 }),
                record({ message_id: "b1", session_id: "s2", model: "sonnet-4", timestamp: T0 }),
            ]);

            const rows = store.query_range_rollup({ start: T0, end: T2 });
            // Groups: (claude_code, sonnet-4, /home/user/proj, s1), (claude_code,
            // opus, /home/user/proj, s1), (claude_code, sonnet-4, /home/user/proj, s2)
            expect(rows).toHaveLength(3);
            const s1_sonnet = rows.find((r) => r.session_id === "s1" && r.model === "sonnet-4")!;
            expect(s1_sonnet.calls).toBe(2);
            expect(s1_sonnet.input_tokens).toBe(200);
            expect(s1_sonnet.title).toBe("hello");
            expect(s1_sonnet.directory).toBe("/home/user/proj");
        });

        it("uses half-open [start, end) so boundary records fall in one window", () => {
            store.upsert_records([
                record({ message_id: "in-window", timestamp: T1 }),
                record({ message_id: "on-end", timestamp: T2 }),
            ]);

            const rows = store.query_range_rollup({ start: T0, end: T2 });
            // Half-open end (timestamp < @end): the T2 record is excluded from
            // the current window. The caller fetches the previous window as
            // [start - width, start), so a record at exactly `start` belongs to
            // current (>= start) and a record at exactly `end` belongs to the
            // next window — no record is double-counted across the two fetches.
            expect(rows).toHaveLength(1);
            expect(rows[0]!.session_id).toBe("s1");
            expect(rows[0]!.calls).toBe(1);
        });

        it("picks the latest-timestamp title per session (matches records' rs[0])", () => {
            // sessionRows reads ORDER BY timestamp DESC → rs[0].title is the
            // latest; rollup must agree, not return the lexicographic MAX.
            store.upsert_records([
                record({ message_id: "old", session_id: "s1", title: "alpha", timestamp: T0 }),
                record({ message_id: "new", session_id: "s1", title: "zzz-late", timestamp: T1 }),
            ]);
            const rows = store.query_range_rollup({});
            expect(rows[0]!.title).toBe("zzz-late");
        });

        it("title subquery honors the window start (window-local latest, t188)", () => {
            // AC1: query_range_rollup({start, end}) returns the window-local
            // latest title. s1 has title=A inside the window and title=B
            // outside (newer timestamp). With start, the subquery must pick A
            // (window-local), not B (full-table latest) — matching records'
            // rs[0].title semantics (records are window-filtered first).
            store.upsert_records([
                record({ message_id: "in1", session_id: "s1", title: "A", timestamp: T0 }),
                record({ message_id: "in2", session_id: "s1", title: "A2", timestamp: T1 }),
                record({
                    message_id: "out_newer",
                    session_id: "s1",
                    title: "B",
                    timestamp: T2 + 10_000,
                }),
            ]);
            const rows = store.query_range_rollup({ start: T0, end: T2 });
            expect(rows).toHaveLength(1);
            expect(rows[0]!.title).toBe("A2");
        });

        it("title subquery without start picks full-table latest (t188)", () => {
            // AC2: no start → full-table latest title (window filter absent).
            store.upsert_records([
                record({ message_id: "in", session_id: "s1", title: "A", timestamp: T0 }),
                record({
                    message_id: "out_newer",
                    session_id: "s1",
                    title: "B",
                    timestamp: T2 + 10_000,
                }),
            ]);
            const rows = store.query_range_rollup({});
            expect(rows[0]!.title).toBe("B");
        });

        it("filters by agent and env", () => {
            store.upsert_records([
                record({
                    message_id: "claude-win",
                    agent: "claude-code",
                    env: "win",
                    timestamp: T0,
                }),
                record({
                    message_id: "opencode-wsl",
                    agent: "opencode",
                    env: "wsl",
                    timestamp: T0,
                }),
            ]);

            expect(store.query_range_rollup({ agent: "claude-code" })).toHaveLength(1);
            expect(store.query_range_rollup({ env: "wsl" })).toHaveLength(1);
            expect(store.query_range_rollup({ agent: "claude-code", env: "win" })).toHaveLength(1);
        });

        it("sums token components and counts distinct sessions per group", () => {
            store.upsert_records([
                record({
                    message_id: "m1",
                    session_id: "s1",
                    input_tokens: 100,
                    output_tokens: 50,
                    cache_read_tokens: 10,
                    cache_write_tokens: 5,
                }),
                record({
                    message_id: "m2",
                    session_id: "s1",
                    input_tokens: 200,
                    output_tokens: 20,
                    cache_read_tokens: 0,
                    cache_write_tokens: 0,
                }),
                record({
                    message_id: "m3",
                    session_id: "s2",
                    input_tokens: 7,
                    output_tokens: 3,
                    cache_read_tokens: 1,
                    cache_write_tokens: 0,
                }),
            ]);

            const rows = store.query_range_rollup({});
            const s1 = rows.find((r) => r.session_id === "s1")!;
            expect(s1.calls).toBe(2);
            expect(s1.input_tokens).toBe(300);
            expect(s1.output_tokens).toBe(70);
            expect(s1.cache_read_tokens).toBe(10);
            expect(s1.cache_write_tokens).toBe(5);
        });

        it("covers the full high-density window past the records LIMIT (AC1)", () => {
            // AC1: records exceed the fetch LIMIT in the window yet the rollup
            // total still matches the complete window. query_records' default
            // LIMIT is DEFAULT_RECORDS_LIMIT (5000); insert 6000 current +
            // 6000 previous messages so the records path would truncate but
            // rollup (no LIMIT) returns the full window. All messages share one
            // session/model so the rollup collapses to a single row whose
            // `calls` must equal the full message count (no LIMIT truncation).
            const cur_start = T0;
            const cur_end = T1;
            const width = cur_end - cur_start;
            const records: AgentSessionUsageRecord[] = [];
            for (let i = 0; i < 6_000; i++) {
                records.push(
                    record({
                        message_id: `cur-${String(i)}`,
                        timestamp: cur_start + i,
                        input_tokens: 1,
                        output_tokens: 0,
                        cache_read_tokens: 0,
                        cache_write_tokens: 0,
                    }),
                );
            }
            for (let i = 0; i < 6_000; i++) {
                records.push(
                    record({
                        message_id: `prev-${String(i)}`,
                        session_id: "s-prev",
                        timestamp: cur_start - width + i,
                        input_tokens: 1,
                        output_tokens: 0,
                        cache_read_tokens: 0,
                        cache_write_tokens: 0,
                    }),
                );
            }
            store.upsert_records(records);

            // current window: all 6000 messages collapse into one group
            // (s1, sonnet-4, /home/user/proj) → one row, calls=6000. query_records
            // would return only DEFAULT_RECORDS_LIMIT (5000); rollup has none.
            const cur = store.query_range_rollup({ start: cur_start, end: cur_end });
            expect(cur).toHaveLength(1);
            expect(cur[0]!.calls).toBe(6_000);
            expect(cur[0]!.input_tokens).toBe(6_000);

            // Previous window (half-open [start - width, start)) is complete;
            // its single group carries all 6000 previous messages. The cur-0
            // record at timestamp = cur_start is excluded from prev by the
            // half-open end (no double count).
            const prev = store.query_range_rollup({ start: cur_start - width, end: cur_start });
            expect(prev).toHaveLength(1);
            expect(prev[0]!.calls).toBe(6_000);
        }, 15_000);
    });

    describe("migration v4 (records env+timestamp index)", () => {
        it("creates idx_records_env_ts and bumps user_version through latest migration on legacy DB", () => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-store-mig4-"));
            try {
                const db_path = path.join(dir, "obs.sqlite");
                const legacy = create_token_stats_store(db_path);
                legacy.upsert_records([record({ env: "win", timestamp: T0 })]);
                legacy.close();
                // Simulate a v3 DB (index not yet present)
                const raw = new Database(db_path);
                raw.pragma("user_version = 3");
                raw.close();

                const migrated = create_token_stats_store(db_path);
                migrated.close();

                const check = new Database(db_path);
                check.pragma("wal_checkpoint(TRUNCATE)");
                expect(check.pragma("user_version", { simple: true })).toBe(5);
                const idx = check
                    .prepare(
                        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_records_env_ts'",
                    )
                    .get() as { name: string } | undefined;
                expect(idx?.name).toBe("idx_records_env_ts");
                check.close();
            } finally {
                // Windows may hold WAL handles briefly after close; retry, but
                // downgrade a lingering cleanup failure to a warning so the
                // assertion result is not masked by an EBUSY on temp teardown.
                let cleanup_err: Error | undefined;
                for (let i = 0; i < 20; i++) {
                    try {
                        fs.rmSync(dir, { recursive: true, force: true });
                        cleanup_err = undefined;
                        break;
                    } catch (err) {
                        cleanup_err = err as Error;
                        if (i < 19) {
                            const until = Date.now() + 100;
                            while (Date.now() < until) {
                                /* spin */
                            }
                        }
                    }
                }
                if (cleanup_err) {
                    console.warn(`[t163] temp cleanup retry exhausted: ${cleanup_err.message}`);
                }
            }
        });

        it("query_records env+timestamp window uses idx_records_env_ts (not full scan)", () => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-plan-"));
            let check: Database.Database | null = null;
            try {
                const db_path = path.join(dir, "obs.sqlite");
                const store = create_token_stats_store(db_path);
                const recs: AgentSessionUsageRecord[] = [];
                for (let i = 0; i < 200; i++) {
                    recs.push(
                        record({
                            message_id: `m${String(i)}`,
                            env: i % 2 === 0 ? "win" : "wsl",
                            timestamp: T0 + i * 1000,
                        }),
                    );
                }
                store.upsert_records(recs);
                store.close();

                check = new Database(db_path);
                const plan = check
                    .prepare(
                        "EXPLAIN QUERY PLAN SELECT message_id FROM token_stats_records WHERE env = 'win' AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC",
                    )
                    .all(T0, T0 + 200000) as { detail: string }[];
                const plan_text = plan.map((p) => p.detail).join("\n");
                expect(plan_text).toContain("idx_records_env_ts");
                expect(plan_text).not.toContain("SCAN");
            } finally {
                check?.close();
                // Windows WAL handles release asynchronously; retry, but downgrade
                // a lingering cleanup failure to a warning so the assertion result
                // (the actual test signal) is not masked by an EBUSY on temp teardown.
                let cleanup_err: Error | undefined;
                for (let i = 0; i < 20; i++) {
                    try {
                        fs.rmSync(dir, { recursive: true, force: true });
                        cleanup_err = undefined;
                        break;
                    } catch (err) {
                        cleanup_err = err as Error;
                        if (i < 19) {
                            const until = Date.now() + 100;
                            while (Date.now() < until) {
                                /* spin */
                            }
                        }
                    }
                }
                if (cleanup_err) {
                    console.warn(`[t163] temp cleanup retry exhausted: ${cleanup_err.message}`);
                }
            }
        });
    });

    it("close() works without error", () => {
        const temp_store = create_token_stats_store(":memory:");
        expect(() => {
            temp_store.close();
        }).not.toThrow();
    });

    describe("migration v2 (UTC daily dates + stale session purge)", () => {
        it("wipes derived tables of legacy DBs and bumps user_version", () => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-store-mig-"));
            try {
                const db_path = path.join(dir, "obs.sqlite");
                const legacy = create_token_stats_store(db_path);
                legacy.upsert_sessions([delta({ calls: 1 })], [daily()]);
                legacy.close();
                // Simulate a pre-migration DB
                const raw = new Database(db_path);
                raw.pragma("user_version = 0");
                raw.close();

                const migrated = create_token_stats_store(db_path);
                expect(migrated.query_buckets({})).toHaveLength(0);
                expect(migrated.query_sessions({})).toHaveLength(0);
                migrated.close();

                const check = new Database(db_path);
                check.pragma("wal_checkpoint(TRUNCATE)");
                // Pre-migration DB reopened → all migrations run to latest (v5).
                expect(check.pragma("user_version", { simple: true })).toBe(5);
                for (const table of [
                    "token_stats_daily",
                    "token_stats_buckets",
                    "token_stats_sessions",
                    "token_stats_records",
                ]) {
                    const row = check.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as {
                        c: number;
                    };
                    expect(row.c).toBe(0);
                }
                check.close();
            } finally {
                // Windows may hold WAL handles briefly after close; retry cleanup.
                let last_err: Error | undefined;
                for (let i = 0; i < 20; i++) {
                    try {
                        fs.rmSync(dir, { recursive: true, force: true });
                        last_err = undefined;
                        break;
                    } catch (err) {
                        last_err = err as Error;
                        if (i < 19) {
                            // small busy-wait to let the kernel release the handle
                            const until = Date.now() + 100;
                            while (Date.now() < until) {
                                /* spin */
                            }
                        }
                    }
                }
                if (last_err) {
                    // Downgrade a lingering cleanup failure to a warning: the
                    // assertion result (the actual test signal) must not be
                    // masked by an EBUSY on Windows temp teardown, which is
                    // unrelated to correctness.

                    console.warn(
                        `[token-stats-store] temp cleanup retry exhausted: ${last_err.message}`,
                    );
                }
            }
        });
    });

    describe("heatmap aggregate (t170)", () => {
        // Beijing time (UTC+8) → epoch ms. The store aggregates in UTC+8, so
        // timestamps here are pinned with an explicit offset.
        const bj = (iso: string): number => Date.parse(`${iso}+08:00`);

        it("returns a row for every weekday present in the window (no LIMIT truncation)", () => {
            // One record at 12:00 on each of the seven days of 2026-07-06..12
            // (Mon..Sun). The old records path truncated with ORDER BY DESC
            // LIMIT, dropping early-week days; the aggregate must keep them all.
            const weekdays = [
                "2026-07-06",
                "2026-07-07",
                "2026-07-08",
                "2026-07-09",
                "2026-07-10",
                "2026-07-11",
                "2026-07-12",
            ];
            store.upsert_records(
                weekdays.map((day, i) =>
                    record({ message_id: `m${String(i)}`, timestamp: bj(`${day} 12:00:00`) }),
                ),
            );

            const cells = store.query_heatmap({
                start: bj("2026-07-06 00:00:00"),
                end: bj("2026-07-12 23:59:59"),
            });
            // 7 distinct weekday rows, every one non-empty.
            expect(cells).toHaveLength(7);
            expect(new Set(cells.map((c) => c.weekday)).size).toBe(7);
            for (const c of cells) {
                expect(c.calls).toBeGreaterThan(0);
            }
        });

        it("aggregates tokens/calls/sessions per weekday×hour (matches full-record reduce)", () => {
            // Two records in the same session+slot (tokens 100+50+10+5 and
            // 200+60+0+30), one record in a different session same slot.
            const ts = bj("2026-07-06 09:00:00"); // Monday 09:00
            store.upsert_records([
                record({
                    message_id: "m1",
                    session_id: "s1",
                    timestamp: ts,
                    input_tokens: 100,
                    output_tokens: 50,
                    cache_read_tokens: 10,
                    cache_write_tokens: 5,
                }),
                record({
                    message_id: "m2",
                    session_id: "s1",
                    timestamp: ts,
                    input_tokens: 200,
                    output_tokens: 60,
                    cache_read_tokens: 0,
                    cache_write_tokens: 30,
                }),
                record({
                    message_id: "m3",
                    session_id: "s2",
                    timestamp: ts,
                    input_tokens: 7,
                    output_tokens: 3,
                    cache_read_tokens: 1,
                    cache_write_tokens: 1,
                }),
            ]);

            const cells = store.query_heatmap({});
            const cell = cells.find((c) => c.weekday === 1 && c.hour === 9);
            if (!cell) throw new Error("expected Monday 09:00 cell");
            expect(cell.calls).toBe(3);
            expect(cell.sessions).toBe(2);
            // 165 + 290 + 12
            expect(cell.tokens).toBe(467);
        });

        it("filters by time range, env and agent", () => {
            const t1 = bj("2026-07-06 10:00:00");
            const t2 = bj("2026-07-07 10:00:00");
            const t3 = bj("2026-07-08 10:00:00");
            store.upsert_records([
                record({ message_id: "m1", timestamp: t1, env: "win", agent: "claude-code" }),
                record({ message_id: "m2", timestamp: t2, env: "wsl", agent: "opencode" }),
                record({ message_id: "m3", timestamp: t3, env: "win", agent: "claude-code" }),
            ]);

            expect(store.query_heatmap({ start: t2, end: t3 })).toHaveLength(2);
            expect(store.query_heatmap({ env: "win" })).toHaveLength(2);
            expect(store.query_heatmap({ agent: "opencode" })).toHaveLength(1);
            expect(store.query_heatmap({ env: "win", agent: "claude-code" })).toHaveLength(2);
        });

        it("reports weekday as strftime('%w') 0=Sunday", () => {
            // 2026-07-12 is a Sunday. 23:59 Beijing is the same calendar day.
            const ts = bj("2026-07-12 23:59:59");
            store.upsert_records([record({ message_id: "m1", timestamp: ts })]);
            const cell = store.query_heatmap({})[0];
            if (!cell) throw new Error("expected a cell");
            expect(cell.weekday).toBe(0);
            expect(cell.hour).toBe(23);
        });

        it("shifts the calendar day by +8 across the UTC date boundary", () => {
            // 2026-07-11T20:00:00Z is Saturday in UTC but Sunday 04:00 in
            // Beijing. Without '+8 hours' the aggregate would bucket it as
            // Saturday (weekday 6) hour 20.
            const ts = Date.parse("2026-07-11T20:00:00Z");
            store.upsert_records([record({ message_id: "m1", timestamp: ts })]);
            const cell = store.query_heatmap({})[0];
            if (!cell) throw new Error("expected a cell");
            expect(cell.weekday).toBe(0); // Sunday
            expect(cell.hour).toBe(4);
        });
    });

    describe("hour bucket aggregate (t173)", () => {
        // Beijing time (UTC+8) → epoch ms. The store aggregates in UTC+8, so
        // timestamps here are pinned with an explicit offset.
        const bj = (iso: string): number => Date.parse(`${iso}+08:00`);

        it("returns a row for every hour present across the window (no LIMIT truncation)", () => {
            // Records across three days; the earliest day must survive the
            // aggregate (the old records path truncated with ORDER BY DESC LIMIT).
            store.upsert_records([
                record({ message_id: "m1", timestamp: bj("2026-07-24 22:05:00") }),
                record({ message_id: "m2", timestamp: bj("2026-07-25 01:30:00") }),
                record({ message_id: "m3", timestamp: bj("2026-07-25 01:45:00"), model: "opus" }),
                record({ message_id: "m4", timestamp: bj("2026-07-26 10:00:00") }),
            ]);

            const rows = store.query_hour_buckets({
                start: bj("2026-07-24 00:00:00"),
                end: bj("2026-07-26 23:59:59"),
            });
            const hours = new Set(rows.map((r) => r.hour_start));
            expect(hours.has(bj("2026-07-24 22:00:00"))).toBe(true);
            expect(hours.has(bj("2026-07-25 01:00:00"))).toBe(true);
            expect(hours.has(bj("2026-07-26 10:00:00"))).toBe(true);
            // One session spans the hours; each hour×model row counts it once.
            for (const row of rows) expect(row.sessions).toBe(1);
        });

        it("aggregates tokens/calls/sessions per hour×model", () => {
            const ts = bj("2026-07-24 22:00:00");
            store.upsert_records([
                record({
                    message_id: "m1",
                    session_id: "s1",
                    timestamp: ts,
                    input_tokens: 100,
                    output_tokens: 50,
                    cache_read_tokens: 10,
                    cache_write_tokens: 5,
                }),
                record({
                    message_id: "m2",
                    session_id: "s1",
                    timestamp: ts + 1000,
                    input_tokens: 200,
                    output_tokens: 60,
                    cache_read_tokens: 0,
                    cache_write_tokens: 0,
                }),
                record({
                    message_id: "m3",
                    session_id: "s2",
                    timestamp: ts,
                    model: "opus",
                    input_tokens: 7,
                    output_tokens: 3,
                }),
            ]);

            const rows = store.query_hour_buckets({});
            const sonnet = rows.find((r) => r.model === "sonnet-4");
            const opus = rows.find((r) => r.model === "opus");
            if (!sonnet || !opus) throw new Error("expected both model rows");
            expect(sonnet.hour_start).toBe(ts);
            // (100+50+10+5) + (200+60+0+0)
            expect(sonnet.tokens).toBe(425);
            expect(sonnet.calls).toBe(2);
            expect(sonnet.sessions).toBe(1);
            // (7+3) + fixture cache defaults (10+5)
            expect(opus.tokens).toBe(25);
            expect(opus.calls).toBe(1);
            // 3 detail rows collapse to 2 hour×model rows (2 sonnet + 1 opus),
            // far fewer than the raw record count — the whole point of AC2.
            expect(rows.length).toBe(2);
        });

        it("filters by time range, env and agent", () => {
            const t1 = bj("2026-07-24 10:00:00");
            const t2 = bj("2026-07-25 10:00:00");
            const t3 = bj("2026-07-26 10:00:00");
            store.upsert_records([
                record({ message_id: "m1", timestamp: t1, env: "win", agent: "claude-code" }),
                record({ message_id: "m2", timestamp: t2, env: "wsl", agent: "opencode" }),
                record({ message_id: "m3", timestamp: t3, env: "win", agent: "claude-code" }),
            ]);

            expect(store.query_hour_buckets({ start: t2, end: t3 })).toHaveLength(2);
            expect(store.query_hour_buckets({ env: "win" })).toHaveLength(2);
            expect(store.query_hour_buckets({ agent: "opencode" })).toHaveLength(1);
            expect(store.query_hour_buckets({ env: "win", agent: "claude-code" })).toHaveLength(2);
        });

        it("shifts the hour boundary by +8 across the UTC hour boundary", () => {
            // 2026-07-24T15:59:00Z is 23:59 Beijing the same calendar day.
            store.upsert_records([
                record({ message_id: "m1", timestamp: Date.parse("2026-07-24T15:59:00Z") }),
            ]);
            const rows = store.query_hour_buckets({});
            if (!rows[0]) throw new Error("expected a row");
            expect(rows[0].hour_start).toBe(bj("2026-07-24 23:00:00"));
        });
    });
});
