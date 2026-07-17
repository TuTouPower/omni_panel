/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import Database from "better-sqlite3";
import { create_token_stats_store } from "../../../../../src/main/core/token-stats/token-stats-store";
import type { TokenStatsStore } from "../../../../../src/main/core/token-stats/token-stats-store";
import type {
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
                expect(check.pragma("user_version", { simple: true })).toBe(2);
                for (const table of [
                    "token_stats_daily",
                    "token_stats_buckets",
                    "token_stats_sessions",
                ]) {
                    const row = check.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as {
                        c: number;
                    };
                    expect(row.c).toBe(0);
                }
                check.close();
            } finally {
                fs.rmSync(dir, { recursive: true, force: true });
            }
        });
    });
});
