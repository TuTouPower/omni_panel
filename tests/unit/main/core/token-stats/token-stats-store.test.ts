/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import Database from "better-sqlite3";
import { create_token_stats_store } from "../../../../../src/main/core/token-stats/token-stats-store";
import type { TokenStatsStore } from "../../../../../src/main/core/token-stats/token-stats-store";
import { DEFAULT_RECORDS_LIMIT } from "../../../../../src/main/core/token-stats/token-stats-store";
import { legacy_env_from_directory } from "../../../../../src/main/core/token-stats/token-stats-store";
import type {
    AgentSessionUsageRecord,
    TokenStatsDailyUpsert,
    TokenStatsDashboardQuery,
    TokenStatsSessionUpsert,
} from "../../../../../src/shared/types/token-stats";

interface SessionStats {
    sessions: number;
    agents: number;
    tokens: number;
}
type SessionStatsStore = TokenStatsStore & {
    query_session_stats: () => SessionStats;
};

const T0 = new Date("2026-07-10T08:00:00Z").getTime();
const T1 = new Date("2026-07-10T09:00:00Z").getTime();
const T2 = new Date("2026-07-11T10:00:00Z").getTime();

function delta(overrides: Partial<TokenStatsSessionUpsert> = {}): TokenStatsSessionUpsert {
    return {
        id: "s1",
        source: "claude_code",
        env: "linux",
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
        env: "linux",
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
        env: "linux",
        ...overrides,
    };
}

/**
 * Run a t192 store scenario against a temp-file DB (the hour rollup is only
 * observable via a second connection, so :memory: won't do). Windows releases
 * WAL handles asynchronously; a short retry on teardown avoids EBUSY masking
 * the real assertion signal.
 */
function with_temp_store(fn: (db_path: string) => void): void {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-store-t192-"));
    try {
        fn(path.join(dir, "obs.sqlite"));
    } finally {
        let last_err: Error | undefined;
        for (let i = 0; i < 20; i++) {
            try {
                fs.rmSync(dir, { recursive: true, force: true });
                last_err = undefined;
                break;
            } catch (err) {
                last_err = err as Error;
                if (i < 19) {
                    const until = Date.now() + 100;
                    while (Date.now() < until) {
                        /* spin */
                    }
                }
            }
        }
        if (last_err) {
            console.warn(`[token-stats-store] temp cleanup retry exhausted: ${last_err.message}`);
        }
    }
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

    describe("t438: env=win 会话（Windows 侧采集数据）", () => {
        it("AC-002: query_sessions search 命中 title 含「黑沙皇」的 kimi env=win 会话", () => {
            store.upsert_sessions(
                [
                    delta({
                        id: "session_kwin",
                        source: "kimi_code",
                        env: "win",
                        model: "kimi-code/k3",
                        title: "黑沙皇 帮我整理需求",
                        directory: "D:\\Dev\\Code\\winproj",
                    }),
                ],
                [],
            );

            const rows = store.query_sessions({ search: "黑沙皇" });
            expect(rows).toHaveLength(1);
            expect(rows[0]?.id).toBe("session_kwin");
            expect(rows[0]?.env).toBe("win");
            // 目录与会话 id 也在搜索范围内（AC-007 语义：标题/目录/会话 id）。
            expect(store.query_sessions({ search: "winproj" })[0]?.id).toBe("session_kwin");
            expect(store.query_sessions({ search: "session_kwin" })[0]?.id).toBe("session_kwin");
        });

        it("AC-004: 同 id 的 kimi 会话 linux/win 两 env 并存、互不覆盖", () => {
            store.upsert_sessions(
                [
                    delta({
                        id: "session_shared",
                        source: "kimi_code",
                        env: "linux",
                        title: "wsl 侧需求",
                        directory: "/home/testuser/proj",
                    }),
                    delta({
                        id: "session_shared",
                        source: "kimi_code",
                        env: "win",
                        title: "窗口侧需求",
                        directory: "D:\\Dev\\Code\\winproj",
                    }),
                ],
                [],
            );

            const rows = store.query_sessions({ source: "kimi_code" });
            expect(rows).toHaveLength(2);
            const linux_row = rows.find((r) => r.env === "linux");
            const win_row = rows.find((r) => r.env === "win");
            expect(linux_row?.title).toBe("wsl 侧需求");
            expect(win_row?.title).toBe("窗口侧需求");
            // env 过滤各自独立命中（不串）。
            expect(store.query_sessions({ env: "win" })).toHaveLength(1);
            expect(store.query_sessions({ env: "linux" })).toHaveLength(1);
        });
    });

    describe("daily rows + bucket derivation", () => {
        it("derives buckets from daily rows grouped by (source, env, date, model)", () => {
            store.upsert_sessions([], [daily()]);

            const buckets = store.query_buckets({});
            expect(buckets).toHaveLength(1);
            expect(buckets[0]).toMatchObject({
                source: "claude_code",
                env: "linux",
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

        it("rebuild_buckets=false 不重建 buckets，仅最后一批 true 触发（t347 AC-001）", () => {
            // 首批不重建（false）：buckets 保持空。
            store.upsert_sessions([], [daily({ date: "2026-07-10", input_tokens: 1000 })], false);
            expect(store.query_buckets({})).toHaveLength(0);

            // 最后一批重建（true）：buckets 反映全部 daily。
            store.upsert_sessions([], [daily({ date: "2026-07-11", input_tokens: 700 })], true);
            const buckets = store.query_buckets({});
            expect(buckets).toHaveLength(2);
            expect(buckets.map((b) => b.bucket_date).sort()).toEqual(["2026-07-10", "2026-07-11"]);
        });

        it("空数据 + rebuild_buckets=true 仍重建 buckets（t347 f003）", () => {
            // 首轮有数据并重建。
            store.upsert_sessions([], [daily({ date: "2026-07-10", input_tokens: 1000 })], true);
            expect(store.query_buckets({})).toHaveLength(1);

            // 删除 buckets 前快照后，空数据 + true 应触发重建（不早退）。
            store.upsert_sessions([], [], true);
            const buckets = store.query_buckets({});
            // 数据未变，buckets 仍重建为 1 条（非 0——若早退则删除被跳过、旧值保留）。
            expect(buckets).toHaveLength(1);
            expect(buckets[0]!.input_tokens).toBe(1000);
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

        it("searches title, directory and id, but not model", () => {
            expect(store.query_sessions({ search: "Frontend" })).toHaveLength(1);
            expect(store.query_sessions({ search: "frontend" })).toHaveLength(1); // directory
            expect(store.query_sessions({ search: "deepseek" })).toHaveLength(0); // model is excluded
            expect(store.query_sessions({ search: "s3" })).toHaveLength(1); // id
        });

        it("t248 literal-escapes LIKE wildcards", () => {
            store.upsert_sessions(
                [
                    delta({
                        id: "literal",
                        title: "100%_done",
                        directory: "C:\\work\\100%_done",
                    }),
                ],
                [],
            );
            expect(store.query_sessions({ search: "%" }).map((row) => row.id)).toEqual(["literal"]);
            expect(store.query_sessions({ search: "_" }).map((row) => row.id)).toEqual(["literal"]);
            expect(store.query_sessions({ search: "\\" }).map((row) => row.id)).toEqual([
                "literal",
            ]);
        });

        it("searches title, directory and id with JavaScript Unicode case semantics", () => {
            store.upsert_sessions(
                [
                    delta({ id: "СЕССИЯ", title: "Привет мир" }),
                    delta({ id: "directory", title: "other", directory: "C:\\Проект" }),
                ],
                [],
            );

            expect(store.query_sessions({ search: "привет" }).map((row) => row.id)).toEqual([
                "СЕССИЯ",
            ]);
            expect(store.query_sessions({ search: "c:\\проект" }).map((row) => row.id)).toEqual([
                "directory",
            ]);
            expect(store.query_sessions({ search: "сессия" }).map((row) => row.id)).toEqual([
                "СЕССИЯ",
            ]);
        });

        it("registers Unicode lower on readonly connections", () => {
            with_temp_store((db_path) => {
                const writable = create_token_stats_store(db_path);
                writable.upsert_sessions([delta({ id: "Привет", title: "Привет" })], []);
                expect(writable.query_sessions({ search: "привет" })).toHaveLength(1);
                writable.close();

                const readonly_store = create_token_stats_store(db_path, { readonly: true });
                try {
                    expect(readonly_store.query_sessions({ search: "привет" })).toHaveLength(1);
                } finally {
                    readonly_store.close();
                }
            });
        });

        it("orders by ended_at desc and respects limit", () => {
            const rows = store.query_sessions({ limit: 2 });
            expect(rows).toHaveLength(2);
            expect(rows[0]!.ended_at).toBeGreaterThanOrEqual(rows[1]!.ended_at);
        });
    });

    describe("query_sessions extension (t227)", () => {
        beforeEach(() => {
            store.upsert_sessions(
                [
                    delta({
                        id: "a",
                        source: "claude_code",
                        calls: 5,
                        input_tokens: 1000,
                        title: "match-alpha",
                        directory: "/alpha",
                        started_at: 100,
                        ended_at: 200,
                    }),
                    delta({
                        id: "b",
                        source: "opencode",
                        calls: 2,
                        input_tokens: 300,
                        title: "match-beta",
                        directory: "/beta",
                        started_at: 300,
                        ended_at: 500,
                    }),
                    delta({
                        id: "c",
                        source: "grok",
                        calls: 9,
                        input_tokens: 700,
                        title: "other",
                        directory: "/gamma",
                        started_at: 600,
                        ended_at: 900,
                    }),
                ],
                [],
            );
        });

        it("filters by multiple sources (IN)", () => {
            const rows = store.query_sessions({ sources: ["claude_code", "opencode"] });
            expect(rows).toHaveLength(2);
        });

        it("filters by activity-time intersection", () => {
            // [start_at, end_at] = [250, 550]：交集 = b（300-500）与 a（100-200 无交集）。
            const rows = store.query_sessions({ start_at: 250, end_at: 550 });
            expect(rows.map((r) => r.id).sort()).toEqual(["b"]);
        });

        it("searches the combined metadata string like renderer filtering", () => {
            const rows = store.query_sessions({ search: "match-alpha /alpha" });
            expect(rows.map((row) => row.id)).toEqual(["a"]);
        });

        it("orders by tokens and calls in both directions", () => {
            expect(
                store
                    .query_sessions({ order_by: "tokens", direction: "desc" })
                    .map((row) => row.id),
            ).toEqual(["a", "c", "b"]);
            expect(
                store.query_sessions({ order_by: "tokens", direction: "asc" }).map((row) => row.id),
            ).toEqual(["b", "c", "a"]);
            expect(
                store.query_sessions({ order_by: "calls", direction: "desc" }).map((row) => row.id),
            ).toEqual(["c", "a", "b"]);
            expect(
                store.query_sessions({ order_by: "calls", direction: "asc" }).map((row) => row.id),
            ).toEqual(["b", "a", "c"]);
        });

        it("combines search, sources, date intersection and limit/offset", () => {
            const rows = store.query_sessions({
                search: "match",
                sources: ["claude_code", "opencode"],
                start_at: 150,
                end_at: 550,
                order_by: "ended_at",
                direction: "asc",
                limit: 1,
                offset: 1,
            });
            expect(rows.map((row) => row.id)).toEqual(["b"]);
        });

        it("t248 AC2：session stats 聚合全量会话，不受列表分页影响", () => {
            const page = store.query_sessions({ limit: 1 });
            expect(page).toHaveLength(1);
            expect((store as SessionStatsStore).query_session_stats()).toEqual({
                sessions: 3,
                agents: 3,
                tokens: 4400,
                source_counts: { claude_code: 1, grok: 1, opencode: 1 },
            });
        });
    });

    describe("last_updated", () => {
        it("is null when empty, set after upsert", () => {
            expect(store.last_updated()).toBeNull();
            store.upsert_sessions([delta({})], []);
            expect(store.last_updated()).toBeGreaterThan(0);
        });
    });

    describe("source status (t309)", () => {
        it("returns what the manager reported via set_sources_status", () => {
            expect(store.sources_status()).toEqual([]);
            store.set_sources_status([
                {
                    source: "grok",
                    env: "wsl",
                    status: "unavailable",
                    lastError: "sessions dir missing",
                },
                { source: "claude_code", env: "linux", status: "ok" },
            ]);
            expect(store.sources_status()).toEqual([
                {
                    source: "grok",
                    env: "wsl",
                    status: "unavailable",
                    lastError: "sessions dir missing",
                },
                { source: "claude_code", env: "linux", status: "ok" },
            ]);
        });

        it("embeds sources_status in the dashboard DTO status snapshot (AC-004)", () => {
            store.set_sources_status([
                { source: "opencode", env: "linux", status: "failed", lastError: "db locked" },
            ]);
            const dto = store.query_dashboard(
                {
                    agent: "all",
                    platform: "all",
                    start: T0,
                    end: T1,
                    metric: "tokens",
                    xaxis: "time",
                    gran: "hour",
                },
                { running: true, last_updated: 42, sources_status: store.sources_status() },
            );
            expect(dto.status).toEqual({
                running: true,
                last_updated: 42,
                sources_status: [
                    { source: "opencode", env: "linux", status: "failed", lastError: "db locked" },
                ],
            });
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

        it("stores and queries source=grok rows across all three tables (t197 AC1)", () => {
            store.upsert_sessions(
                [
                    {
                        id: "grok-s1",
                        source: "grok",
                        env: "wsl",
                        model: "grok-4.5-build",
                        title: "github_repo",
                        directory: "/home/testuser/github_repo",
                        input_tokens: 100,
                        output_tokens: 52,
                        cache_read_tokens: 20,
                        cache_write_tokens: 0,
                        calls: 1,
                        started_at: T0,
                        ended_at: T1,
                    },
                ],
                [
                    {
                        id: "grok-s1",
                        source: "grok",
                        env: "wsl",
                        model: "grok-4.5-build",
                        date: "2026-07-10",
                        input_tokens: 100,
                        output_tokens: 52,
                        cache_read_tokens: 20,
                        cache_write_tokens: 0,
                        calls: 1,
                    },
                ],
            );
            store.upsert_records([
                {
                    session_id: "grok-s1",
                    title: "github_repo",
                    directory: "/home/testuser/github_repo",
                    slug: null,
                    version: null,
                    parent_session_id: null,
                    message_id: "019f9fe0-cae5-7d31-bf17-d3292a086bcc",
                    role: "assistant",
                    timestamp: T0,
                    model: "grok-4.5-build",
                    input_tokens: 100,
                    output_tokens: 52,
                    cache_read_tokens: 20,
                    cache_write_tokens: 0,
                    agent: "grok",
                    source: "grok",
                    env: "wsl",
                },
            ]);

            const grok_sessions = store.query_sessions({}).filter((s) => s.source === "grok");
            expect(grok_sessions).toHaveLength(1);
            expect(grok_sessions[0]).toMatchObject({
                id: "grok-s1",
                source: "grok",
                env: "wsl",
                model: "grok-4.5-build",
                input_tokens: 100,
                calls: 1,
            });

            const grok_records = store.query_records({ agent: "grok" });
            expect(grok_records).toHaveLength(1);
            // The public AgentSessionUsage contract deliberately drops source/env.
            expect(grok_records[0]).toMatchObject({
                agent: "grok",
                model: "grok-4.5-build",
                message_id: "019f9fe0-cae5-7d31-bf17-d3292a086bcc",
            });

            const grok_buckets = store.query_buckets({ source: "grok" });
            expect(grok_buckets).toHaveLength(1);
            expect(grok_buckets[0]).toMatchObject({
                source: "grok",
                input_tokens: 100,
                sessions: 1,
                calls: 1,
            });
        });

        it("filters records by platform and combines with other filters", () => {
            store.upsert_records([
                record({ message_id: "win-claude", env: "linux", timestamp: T0 }),
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
            expect(store.query_records({ env: "linux" })).toHaveLength(1);
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
                    env: "linux",
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
        it("aggregates by (source, env, model, directory, session_id) without a LIMIT", () => {
            // Two sessions × two models; multiple messages per group.
            store.upsert_records([
                record({ message_id: "a1", session_id: "s1", model: "sonnet-4", timestamp: T0 }),
                record({ message_id: "a2", session_id: "s1", model: "sonnet-4", timestamp: T1 }),
                record({ message_id: "a3", session_id: "s1", model: "opus", timestamp: T1 }),
                record({ message_id: "b1", session_id: "s2", model: "sonnet-4", timestamp: T0 }),
            ]);

            const rows = store.query_range_rollup({ start: T0, end: T2 });
            // Groups: (claude_code, win, sonnet-4, /home/user/proj, s1),
            // (claude_code, win, opus, /home/user/proj, s1),
            // (claude_code, win, sonnet-4, /home/user/proj, s2)
            expect(rows).toHaveLength(3);
            const s1_sonnet = rows.find((r) => r.session_id === "s1" && r.model === "sonnet-4")!;
            expect(s1_sonnet.calls).toBe(2);
            expect(s1_sonnet.input_tokens).toBe(200);
            expect(s1_sonnet.title).toBe("hello");
            expect(s1_sonnet.directory).toBe("/home/user/proj");
        });

        it("同 session_id 跨 env 不合并：rollup 行含 env 区分 win/wsl", () => {
            store.upsert_records([
                record({ message_id: "w1", session_id: "s1", env: "linux", timestamp: T0 }),
                record({ message_id: "w2", session_id: "s1", env: "wsl", timestamp: T1 }),
            ]);

            const rows = store.query_range_rollup({ start: T0, end: T2 });
            // GROUP BY 含 env：同 session_id 不同 env 拆成两行，且每行含 env 字段
            expect(rows).toHaveLength(2);
            const envs = rows.map((r) => r.env).sort();
            expect(envs).toEqual(["linux", "wsl"]);
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
                    env: "linux",
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
            expect(store.query_range_rollup({ agent: "claude-code", env: "linux" })).toHaveLength(
                1,
            );
        });

        it("filters rollup rows by model (t206 AC5)", () => {
            store.upsert_records([
                record({
                    message_id: "a-sonnet",
                    session_id: "s1",
                    model: "sonnet",
                    timestamp: T0,
                }),
                record({ message_id: "b-opus", session_id: "s2", model: "opus", timestamp: T0 }),
            ]);
            const sonnet = store.query_range_rollup({ model: "sonnet" });
            expect(sonnet).toHaveLength(1);
            expect(sonnet[0]?.model).toBe("sonnet");
            const opus = store.query_range_rollup({ model: "opus" });
            expect(opus).toHaveLength(1);
            expect(opus[0]?.model).toBe("opus");
            // No filter → both models present.
            expect(store.query_range_rollup({})).toHaveLength(2);
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
                legacy.upsert_records([record({ env: "linux", timestamp: T0 })]);
                legacy.close();
                // Simulate a v3 DB (index not yet present)
                const raw = new Database(db_path);
                raw.pragma("user_version = 3");
                raw.close();

                const migrated = create_token_stats_store(db_path);
                migrated.close();

                const check = new Database(db_path);
                check.pragma("wal_checkpoint(TRUNCATE)");
                // Latest migration is v8 (t437 env local/win → platform labels)
                // since this test was written; "bumps through latest" semantics
                // unchanged.
                expect(check.pragma("user_version", { simple: true })).toBe(8);
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
                            env: i % 2 === 0 ? "linux" : "wsl",
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

    describe("migration v8 (t437: env local/win → platform labels)", () => {
        // 与 store 迁移的宿主默认规则一致（win32→win、darwin→mac、其他→linux），
        // 跨平台 CI 不硬编码 "linux"（t437 review f003）。
        const HOST_DEFAULT_ENV =
            process.platform === "win32" ? "win" : process.platform === "darwin" ? "mac" : "linux";
        // 造「迁移前旧库」：fresh store 以合法 env 写入后，raw SQL 把平台行改写为
        // env='local'（模拟 pre-t437），再直接 INSERT 残留 env='win' 行（模拟
        // pre-t308 残留），user_version 拨回 7 只触发 v8（隔离测试）。
        function build_legacy_db(dir_name: string): string {
            const db_path = path.join(dir_name, "obs.sqlite");
            const seed = create_token_stats_store(db_path);
            seed.upsert_sessions(
                [
                    delta({ id: "win-sess", directory: "D:\\proj" }), // 盘符 → win
                    delta({ id: "mac-sess", directory: "/Users/u/proj" }), // /Users/ → mac
                    delta({ id: "linux-sess", directory: "/home/u/proj" }), // POSIX → linux
                    delta({ id: "null-sess", directory: null }), // NULL → 宿主默认
                ],
                [
                    daily({ id: "win-sess", date: "2026-07-10" }),
                    daily({ id: "mac-sess", date: "2026-07-10" }),
                    daily({ id: "linux-sess", date: "2026-07-10" }),
                    daily({ id: "orphan", date: "2026-07-10" }), // 无 session → 宿主默认
                ],
            );
            seed.upsert_records([
                record({ message_id: "rec-win", directory: "D:\\proj" }),
                record({ message_id: "rec-mac", directory: "/Users/u/proj" }),
                record({ message_id: "rec-linux", directory: "/home/u/proj" }),
                record({ message_id: "rec-null", directory: null }),
                record({ message_id: "rec-wsl", env: "wsl" }),
            ]);
            seed.backfill_hour_rollup();
            seed.close();

            const raw = new Database(db_path);
            raw.exec(
                "UPDATE token_stats_records SET env='local' WHERE env='linux';" +
                    "UPDATE token_stats_sessions SET env='local' WHERE env='linux';" +
                    "UPDATE token_stats_daily SET env='local' WHERE env='linux';" +
                    "UPDATE token_stats_buckets SET env='local' WHERE env='linux';" +
                    "UPDATE token_stats_hour_rollup SET env='local' WHERE env='linux';",
            );
            // 残留 pre-t308 `win` 行：与同主键 `local` 行在分类后碰撞 → merge 验证。
            raw.prepare(
                `INSERT INTO token_stats_sessions (
                    id, source, env, model, title, directory,
                    input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
                    calls, started_at, ended_at, updated_at
                ) VALUES (?, ?, 'win', 'm', NULL, ?, ?, 0, 0, 0, ?, ?, ?, ?)`,
            ).run("win-sess", "claude_code", "D:\\proj", 111, 1, T0 + 1000, T1 + 1000, 1);
            raw.prepare(
                `INSERT INTO token_stats_daily (
                    id, source, env, date, model,
                    input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
                    calls, updated_at
                ) VALUES (?, ?, 'win', ?, 'm', ?, 0, 0, 0, ?, ?)`,
            ).run("win-sess", "claude_code", "2026-07-10", 111, 1, 1);
            raw.prepare(
                `INSERT INTO token_stats_records (
                    source, env, session_id, title, directory, slug, version,
                    parent_session_id, message_id, role, timestamp, model,
                    input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
                    agent, updated_at
                ) VALUES ('claude_code', 'win', 'win-sess', NULL, ?, NULL, NULL, NULL, 'rec-win', 'assistant', ?, 'm', 111, 0, 0, 0, 'claude-code', ?)`,
            ).run("D:\\proj", T0, 1);
            raw.pragma("user_version = 7");
            raw.close();
            return db_path;
        }

        it("classifies local/win rows by directory, merges collisions, clears old envs (AC-002)", () => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-store-mig8-"));
            try {
                const db_path = build_legacy_db(dir);
                const migrated = create_token_stats_store(db_path);
                migrated.close();

                const check = new Database(db_path);
                check.pragma("wal_checkpoint(TRUNCATE)");
                expect(check.pragma("user_version", { simple: true })).toBe(8);

                // 无 local 残留；win 是合法新枚举值，残留判定改为「win 行目录与
                // 分类一致」（盘符形）——旧义残留（如 /Users/ 目录却标 win）不得存在。
                const local_count = (table: string): number =>
                    (
                        check
                            .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE env='local'`)
                            .get() as { n: number }
                    ).n;
                for (const table of [
                    "token_stats_sessions",
                    "token_stats_records",
                    "token_stats_daily",
                    "token_stats_buckets",
                    "token_stats_hour_rollup",
                ]) {
                    expect(local_count(table)).toBe(0);
                }
                for (const table of ["token_stats_sessions", "token_stats_records"]) {
                    const win_rows = check
                        .prepare(`SELECT directory FROM ${table} WHERE env='win'`)
                        .all() as { directory: string | null }[];
                    expect(win_rows.length).toBeGreaterThan(0);
                    expect(win_rows.every((r) => /^[A-Za-z]:[\\/]/.test(r.directory ?? ""))).toBe(
                        true,
                    );
                }

                // 分类正确：盘符 → win、/Users/ → mac、POSIX → linux、NULL/孤儿 → 宿主默认。
                const session = (
                    id: string,
                ): { env: string; input_tokens: number; started_at: number; ended_at: number } =>
                    check
                        .prepare(
                            `SELECT env, input_tokens, started_at, ended_at
                             FROM token_stats_sessions WHERE id = ?`,
                        )
                        .get(id) as {
                        env: string;
                        input_tokens: number;
                        started_at: number;
                        ended_at: number;
                    };
                expect(session("win-sess").env).toBe("win");
                expect(session("mac-sess").env).toBe("mac");
                expect(session("linux-sess").env).toBe("linux");
                expect(session("null-sess").env).toBe(HOST_DEFAULT_ENV); // 宿主默认
                // local+win 碰撞 merge：input_tokens MAX(1000,111)=1000、started_at MIN、ended_at MAX。
                expect(session("win-sess").input_tokens).toBe(1000);
                expect(session("win-sess").started_at).toBe(T0);
                expect(session("win-sess").ended_at).toBe(T1 + 1000);

                const daily_env = (id: string): string =>
                    (
                        check
                            .prepare(
                                "SELECT env FROM token_stats_daily WHERE id = ? AND date = '2026-07-10'",
                            )
                            .get(id) as { env: string }
                    ).env;
                expect(daily_env("win-sess")).toBe("win");
                expect(daily_env("mac-sess")).toBe("mac");
                expect(daily_env("linux-sess")).toBe("linux");
                expect(daily_env("orphan")).toBe(HOST_DEFAULT_ENV); // 无 session join → 宿主默认

                const record_env = (message_id: string): string =>
                    (
                        check
                            .prepare("SELECT env FROM token_stats_records WHERE message_id = ?")
                            .get(message_id) as { env: string }
                    ).env;
                expect(record_env("rec-win")).toBe("win");
                expect(record_env("rec-mac")).toBe("mac");
                expect(record_env("rec-linux")).toBe("linux");
                expect(record_env("rec-null")).toBe(HOST_DEFAULT_ENV);
                expect(record_env("rec-wsl")).toBe("wsl"); // wsl 行不受迁移影响

                // 行数与 token 合计不因迁移减少：buckets 重建后合计 == 迁移前 daily 合计。
                const daily_total: number = (
                    check
                        .prepare(
                            "SELECT COALESCE(SUM(input_tokens), 0) AS t FROM token_stats_daily",
                        )
                        .get() as { t: number }
                ).t;
                const bucket_total: number = (
                    check
                        .prepare(
                            "SELECT COALESCE(SUM(input_tokens), 0) AS t FROM token_stats_buckets",
                        )
                        .get() as { t: number }
                ).t;
                expect(bucket_total).toBe(daily_total);
                // sessions 行数 = 4（win-sess 合并后仍 1 行）+ 无 wsl session。
                expect(
                    (
                        check.prepare("SELECT COUNT(*) AS n FROM token_stats_sessions").get() as {
                            n: number;
                        }
                    ).n,
                ).toBe(4);
                // hour_rollup 清空置 unready，走现成异步回填。
                expect(
                    (
                        check
                            .prepare("SELECT COUNT(*) AS n FROM token_stats_hour_rollup")
                            .get() as { n: number }
                    ).n,
                ).toBe(0);
                expect(
                    (
                        check
                            .prepare("SELECT hour_rollup_ready FROM token_stats_meta WHERE id = 1")
                            .get() as { hour_rollup_ready: number }
                    ).hour_rollup_ready,
                ).toBe(0);
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
                    console.warn(`[t437] temp cleanup retry exhausted: ${cleanup_err.message}`);
                }
            }
        });

        it("is idempotent: reopening a migrated DB leaves rows and user_version unchanged", () => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-store-mig8b-"));
            try {
                const db_path = build_legacy_db(dir);
                const migrated = create_token_stats_store(db_path);
                migrated.close();

                const first = new Database(db_path);
                first.pragma("wal_checkpoint(TRUNCATE)");
                const rows_before = {
                    sessions: (
                        first.prepare("SELECT COUNT(*) AS n FROM token_stats_sessions").get() as {
                            n: number;
                        }
                    ).n,
                    daily: (
                        first.prepare("SELECT COUNT(*) AS n FROM token_stats_daily").get() as {
                            n: number;
                        }
                    ).n,
                };
                first.close();

                // 重开：v8 不再执行，行数与 user_version 不变。
                const reopened = create_token_stats_store(db_path);
                reopened.close();
                const second = new Database(db_path);
                second.pragma("wal_checkpoint(TRUNCATE)");
                expect(second.pragma("user_version", { simple: true })).toBe(8);
                expect(
                    (
                        second.prepare("SELECT COUNT(*) AS n FROM token_stats_sessions").get() as {
                            n: number;
                        }
                    ).n,
                ).toBe(rows_before.sessions);
                expect(
                    (
                        second.prepare("SELECT COUNT(*) AS n FROM token_stats_daily").get() as {
                            n: number;
                        }
                    ).n,
                ).toBe(rows_before.daily);
                const legacy_count = (table: string): number =>
                    (
                        second
                            .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE env='local'`)
                            .get() as { n: number }
                    ).n;
                expect(legacy_count("token_stats_sessions")).toBe(0);
                expect(legacy_count("token_stats_daily")).toBe(0);
                second.close();
            } finally {
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
                    console.warn(`[t437] temp cleanup retry exhausted: ${cleanup_err.message}`);
                }
            }
        });
    });

    describe("legacy_env_from_directory (t437 分类纯函数)", () => {
        it("maps drive-letter directories to win", () => {
            expect(legacy_env_from_directory("D:\\proj", "linux")).toBe("win");
            expect(legacy_env_from_directory("C:/Users/u/proj", "mac")).toBe("win");
        });

        it("maps /Users/ directories to mac", () => {
            expect(legacy_env_from_directory("/Users/u/proj", "linux")).toBe("mac");
            expect(legacy_env_from_directory("/Users/admin/x", "win")).toBe("mac");
        });

        it("maps other non-null POSIX directories to linux", () => {
            expect(legacy_env_from_directory("/home/u/proj", "win")).toBe("linux");
            expect(legacy_env_from_directory("/var/tmp", "mac")).toBe("linux");
        });

        it("maps null directory to the host default", () => {
            expect(legacy_env_from_directory(null, "win")).toBe("win");
            expect(legacy_env_from_directory(null, "mac")).toBe("mac");
            expect(legacy_env_from_directory(null, "linux")).toBe("linux");
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
                // Pre-migration DB reopened → all migrations run to latest (v8).
                expect(check.pragma("user_version", { simple: true })).toBe(8);
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
                record({ message_id: "m1", timestamp: t1, env: "linux", agent: "claude-code" }),
                record({ message_id: "m2", timestamp: t2, env: "wsl", agent: "opencode" }),
                record({ message_id: "m3", timestamp: t3, env: "linux", agent: "claude-code" }),
            ]);

            expect(store.query_heatmap({ start: t2, end: t3 })).toHaveLength(2);
            expect(store.query_heatmap({ env: "linux" })).toHaveLength(2);
            expect(store.query_heatmap({ agent: "opencode" })).toHaveLength(1);
            expect(store.query_heatmap({ env: "linux", agent: "claude-code" })).toHaveLength(2);
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
                record({ message_id: "m1", timestamp: t1, env: "linux", agent: "claude-code" }),
                record({ message_id: "m2", timestamp: t2, env: "wsl", agent: "opencode" }),
                record({ message_id: "m3", timestamp: t3, env: "linux", agent: "claude-code" }),
            ]);

            expect(store.query_hour_buckets({ start: t2, end: t3 })).toHaveLength(2);
            expect(store.query_hour_buckets({ env: "linux" })).toHaveLength(2);
            expect(store.query_hour_buckets({ agent: "opencode" })).toHaveLength(1);
            expect(store.query_hour_buckets({ env: "linux", agent: "claude-code" })).toHaveLength(
                2,
            );
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

    describe("read-only store (t193 query worker)", () => {
        it("reads committed dashboard data through the same contract as the writable store", () => {
            with_temp_store((db_path) => {
                const writable = create_token_stats_store(db_path);
                writable.upsert_records([record({ message_id: "m1", timestamp: T0 })]);
                writable.backfill_hour_rollup();
                const dto_writable = writable.query_dashboard(
                    {
                        agent: "all",
                        platform: "all",
                        start: T0,
                        end: T0 + 3600000,
                        metric: "tokens",
                        xaxis: "time",
                        gran: "hour",
                    },
                    { running: false, last_updated: null },
                );
                writable.close();

                const readonly_store = create_token_stats_store(db_path, { readonly: true });
                expect(readonly_store.is_hour_rollup_ready()).toBe(true);
                expect(readonly_store.get_data_version()).toBe(1);
                const dto_readonly = readonly_store.query_dashboard(
                    {
                        agent: "all",
                        platform: "all",
                        start: T0,
                        end: T0 + 3600000,
                        metric: "tokens",
                        xaxis: "time",
                        gran: "hour",
                    },
                    { running: false, last_updated: null },
                );
                expect(dto_readonly.current).toEqual(dto_writable.current);
                expect(dto_readonly.previous).toEqual(dto_writable.previous);
                expect(dto_readonly.chart_data).toEqual(dto_writable.chart_data);
                expect(dto_readonly.heatmap).toEqual(dto_writable.heatmap);
                expect(dto_readonly.sessions).toEqual(dto_writable.sessions);
                readonly_store.close();
            });
        });

        it("rejects writes (AC7): upsert_records / backfill throw on a read-only store", () => {
            with_temp_store((db_path) => {
                const writable = create_token_stats_store(db_path);
                writable.upsert_records([record({ message_id: "m1" })]);
                writable.close();

                const readonly_store = create_token_stats_store(db_path, { readonly: true });
                expect(() => {
                    readonly_store.upsert_records([record({ message_id: "mX" })]);
                }).toThrow(/read-only/i);
                expect(() => {
                    readonly_store.upsert_sessions([], []);
                }).toThrow(/read-only/i);
                expect(() => {
                    readonly_store.backfill_hour_rollup();
                }).toThrow(/read-only/i);
                readonly_store.close();
            });
        });
    });

    describe("migration v6 (t192 hour rollup + data version)", () => {
        it("creates t192 tables on a pre-v6 DB and stays unready", () => {
            with_temp_store((db_path) => {
                const legacy = create_token_stats_store(db_path);
                legacy.upsert_records([record({ message_id: "m1" })]);
                legacy.close();
                // Strip the t192 tables + downgrade to simulate a real v5 DB.
                const raw = new Database(db_path);
                raw.exec(
                    "DROP TABLE token_stats_hour_rollup;" +
                        "DROP TABLE token_stats_data_version;" +
                        "DROP TABLE token_stats_meta;",
                );
                raw.pragma("user_version = 5");
                raw.close();

                const migrated = create_token_stats_store(db_path);
                expect(migrated.is_hour_rollup_ready()).toBe(false);
                expect(migrated.get_data_version()).toBe(0);
                migrated.close();

                const check = new Database(db_path);
                check.pragma("wal_checkpoint(TRUNCATE)");
                expect(check.pragma("user_version", { simple: true })).toBe(8);
                const rollup_rows = check
                    .prepare("SELECT COUNT(*) AS c FROM token_stats_hour_rollup")
                    .get() as { c: number };
                expect(rollup_rows.c).toBe(0);
                check.close();
            });
        });
    });

    describe("hour rollup incremental aggregation + data version (t192)", () => {
        const hs = (ts: number): number => ts - ((ts + 28800000) % 3600000);
        const read_rollup = (db_path: string): Record<string, unknown>[] => {
            const raw = new Database(db_path, { readonly: true });
            try {
                return raw
                    .prepare(
                        "SELECT source, env, session_id, hour_start, model, directory, agent, calls, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens FROM token_stats_hour_rollup ORDER BY source, env, session_id, hour_start, model",
                    )
                    .all() as Record<string, unknown>[];
            } finally {
                raw.close();
            }
        };

        it("builds a per-session/hour/model/directory rollup on upsert and advances data version once", () => {
            with_temp_store((db_path) => {
                const store = create_token_stats_store(db_path);
                expect(store.get_data_version()).toBe(0);
                expect(store.is_hour_rollup_ready()).toBe(false);
                store.upsert_records([
                    record({
                        message_id: "m1",
                        timestamp: T0,
                        input_tokens: 100,
                        output_tokens: 50,
                    }),
                    record({ message_id: "m2", timestamp: T0 + 60000, input_tokens: 10 }),
                    record({ message_id: "m3", timestamp: T2, input_tokens: 5 }),
                ]);
                expect(store.get_data_version()).toBe(1);

                const rows = read_rollup(db_path);
                expect(rows).toHaveLength(2);
                expect(rows[0]).toMatchObject({
                    source: "claude_code",
                    env: "linux",
                    session_id: "s1",
                    hour_start: hs(T0),
                    model: "sonnet-4",
                    directory: "/home/user/proj",
                    agent: "claude-code",
                    calls: 2,
                    input_tokens: 110,
                    output_tokens: 100,
                });
                expect(rows[1]).toMatchObject({
                    hour_start: hs(T2),
                    calls: 1,
                    input_tokens: 5,
                });

                // Empty batch is not a committed data change → version untouched.
                store.upsert_records([]);
                expect(store.get_data_version()).toBe(1);
                store.close();
            });
        });

        it("replaces a session's rollup on recount without double counting", () => {
            with_temp_store((db_path) => {
                const store = create_token_stats_store(db_path);
                store.upsert_records([
                    record({ message_id: "m1", input_tokens: 100 }),
                    record({ message_id: "m2", input_tokens: 50 }),
                ]);
                // Recount replaces m2 (REPLACE by PK), same session/hour/model.
                store.upsert_records([record({ message_id: "m2", input_tokens: 999 })]);
                expect(store.get_data_version()).toBe(2);

                const rows = read_rollup(db_path);
                expect(rows).toHaveLength(1);
                expect(rows[0]).toMatchObject({ calls: 2, input_tokens: 1099 });
                store.close();
            });
        });

        it("splits a session into separate groups when directory changes", () => {
            with_temp_store((db_path) => {
                const store = create_token_stats_store(db_path);
                store.upsert_records([
                    record({ message_id: "m1", directory: "/proj/a" }),
                    record({ message_id: "m2", directory: "/proj/b" }),
                ]);
                expect(read_rollup(db_path)).toHaveLength(2);
                store.close();
            });
        });

        it("keeps null directory as a single group (matches records GROUP BY)", () => {
            with_temp_store((db_path) => {
                const store = create_token_stats_store(db_path);
                store.upsert_records([
                    record({ message_id: "m1", directory: null }),
                    record({ message_id: "m2", directory: null }),
                ]);
                const rows = read_rollup(db_path);
                expect(rows).toHaveLength(1);
                expect(rows[0]).toMatchObject({ directory: null, calls: 2 });
                store.close();
            });
        });
    });

    describe("backfill hour rollup (t192)", () => {
        const read_rollup = (db_path: string): Record<string, unknown>[] => {
            const raw = new Database(db_path, { readonly: true });
            try {
                return raw
                    .prepare(
                        "SELECT source, env, session_id, hour_start, model, directory, agent, calls, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens FROM token_stats_hour_rollup ORDER BY source, env, session_id, hour_start, model",
                    )
                    .all() as Record<string, unknown>[];
            } finally {
                raw.close();
            }
        };
        const oracle_rollup = (db_path: string): Record<string, unknown>[] => {
            const raw = new Database(db_path, { readonly: true });
            try {
                return raw
                    .prepare(
                        "SELECT source, env, session_id, (timestamp - ((timestamp + 28800000) % 3600000)) AS hour_start, model, directory, agent, COUNT(*) AS calls, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens, SUM(cache_read_tokens) AS cache_read_tokens, SUM(cache_write_tokens) AS cache_write_tokens FROM token_stats_records GROUP BY source, env, session_id, hour_start, model, directory, agent ORDER BY source, env, session_id, hour_start, model",
                    )
                    .all() as Record<string, unknown>[];
            } finally {
                raw.close();
            }
        };

        it("rebuilds the full rollup, marks ready, and is idempotent", () => {
            with_temp_store((db_path) => {
                const store = create_token_stats_store(db_path);
                store.upsert_records([
                    record({ message_id: "m1", timestamp: T0, input_tokens: 100 }),
                    record({ message_id: "m2", timestamp: T0 + 3600000, input_tokens: 7 }),
                    record({
                        message_id: "m3",
                        timestamp: T2,
                        input_tokens: 5,
                        directory: "/proj/b",
                    }),
                ]);
                expect(store.is_hour_rollup_ready()).toBe(false);

                store.backfill_hour_rollup();
                expect(store.is_hour_rollup_ready()).toBe(true);

                expect(read_rollup(db_path)).toEqual(oracle_rollup(db_path));

                const count = read_rollup(db_path).length;
                store.backfill_hour_rollup();
                expect(read_rollup(db_path)).toHaveLength(count);
                expect(store.is_hour_rollup_ready()).toBe(true);
                store.close();
            });
        });

        it("keeps rollup consistent with records after backfill + incremental upsert", () => {
            with_temp_store((db_path) => {
                const store = create_token_stats_store(db_path);
                store.upsert_records([record({ message_id: "m1", input_tokens: 100 })]);
                store.backfill_hour_rollup();
                store.upsert_records([record({ message_id: "m2", input_tokens: 7 })]);
                expect(read_rollup(db_path)).toEqual(oracle_rollup(db_path));
                store.close();
            });
        });

        it("rebuilds from records after aggregate corruption with identical output (AC6)", () => {
            const t = (iso: string): number => Date.parse(`${iso}Z`);
            const status = { running: false, last_updated: null };
            const query: TokenStatsDashboardQuery = {
                agent: "all",
                platform: "all",
                start: t("2026-07-10T08:00:00"),
                end: t("2026-07-11T08:00:00"),
                metric: "tokens",
                xaxis: "time",
                gran: "hour",
            };
            with_temp_store((db_path) => {
                const store = create_token_stats_store(db_path);
                store.upsert_records([
                    record({
                        message_id: "m1",
                        timestamp: t("2026-07-10T08:30:00"),
                        input_tokens: 100,
                    }),
                    record({
                        message_id: "m2",
                        timestamp: t("2026-07-10T09:15:00"),
                        input_tokens: 7,
                    }),
                    record({
                        message_id: "m3",
                        timestamp: t("2026-07-11T00:30:00"),
                        input_tokens: 5,
                        directory: "/proj/b",
                    }),
                ]);
                store.backfill_hour_rollup();
                const before = store.query_dashboard(query, status);

                // Corrupt the aggregate table out-of-band.
                const raw = new Database(db_path);
                raw.exec("UPDATE token_stats_hour_rollup SET input_tokens = 999999;");
                raw.close();

                store.backfill_hour_rollup();
                const after = store.query_dashboard(query, status);
                expect(after.current).toEqual(before.current);
                expect(after.previous).toEqual(before.previous);
                expect(after.chart_data).toEqual(before.chart_data);
                expect(after.heatmap).toEqual(before.heatmap);
                expect(after.sessions).toEqual(before.sessions);
                store.close();
            });
        });
    });

    describe("rollup read scale vs per-message density (t192 AC5)", () => {
        const t = (iso: string): number => Date.parse(`${iso}Z`);
        const read_rollup_count = (db_path: string): number => {
            const raw = new Database(db_path, { readonly: true });
            try {
                return (
                    raw.prepare("SELECT COUNT(*) AS c FROM token_stats_hour_rollup").get() as {
                        c: number;
                    }
                ).c;
            } finally {
                raw.close();
            }
        };
        // 6 distinct (session, model, hour, directory) groups; density varies.
        const groups: [string, string, string, string][] = [
            ["s1", "sonnet", "/a", "2026-07-10T08:00:00"],
            ["s1", "opus", "/a", "2026-07-10T09:00:00"],
            ["s2", "sonnet", "/b", "2026-07-10T08:00:00"],
            ["s2", "kimi", "/b", "2026-07-10T10:00:00"],
            ["s3", "sonnet", "/c", "2026-07-10T08:00:00"],
            ["s3", "opus", "/c", "2026-07-10T09:00:00"],
        ];
        const low = groups.flatMap(([session_id, model, directory, iso], i) => [
            record({
                message_id: `low-${String(i)}-0`,
                session_id,
                model,
                directory,
                timestamp: t(iso),
            }),
        ]);
        const high = groups.flatMap(([session_id, model, directory, iso], i) =>
            Array.from({ length: 100 }, (_, j) =>
                record({
                    message_id: `high-${String(i)}-${String(j)}`,
                    session_id,
                    model,
                    directory,
                    timestamp: t(iso) + j * 1000,
                    input_tokens: j + 1,
                }),
            ),
        );

        it("keeps rollup rows and dashboard size flat as message density grows 100x", () => {
            const run = (recs: AgentSessionUsageRecord[]): number[] => {
                let chart_buckets = 0;
                let session_total = 0;
                with_temp_store((db_path) => {
                    const store = create_token_stats_store(db_path);
                    store.upsert_records(recs);
                    store.backfill_hour_rollup();
                    const rollup_rows = read_rollup_count(db_path);
                    const query: TokenStatsDashboardQuery = {
                        agent: "all",
                        platform: "all",
                        start: t("2026-07-10T08:00:00"),
                        end: t("2026-07-10T11:00:00"),
                        metric: "tokens",
                        xaxis: "time",
                        gran: "hour",
                    };
                    const dto = store.query_dashboard(query, {
                        running: false,
                        last_updated: null,
                    });
                    chart_buckets = dto.chart_data.axis.bucket_starts.length;
                    session_total = dto.sessions.total;
                    expect(rollup_rows).toBe(groups.length);
                    store.close();
                });
                return [chart_buckets, session_total];
            };
            const low_shape = run(low);
            const high_shape = run(high);
            expect(high_shape).toEqual(low_shape);
            // Sanity: the high-density fixture really has 100x the messages.
            expect(high.length).toBe(low.length * 100);
        });
    });

    describe("dashboard aggregate read path (t192)", () => {
        const t = (iso: string): number => Date.parse(`${iso}Z`);
        const S = t("2026-07-10T07:30:00");
        const E = t("2026-07-11T12:15:00");
        const status = { running: false, last_updated: null };
        const recs: AgentSessionUsageRecord[] = [
            // 边界首小时（07:30–08:00 部分，本地 15:30–16:00）
            record({
                message_id: "a1",
                session_id: "s1",
                timestamp: t("2026-07-10T07:45:00"),
                model: "sonnet-4",
                directory: "/proj/a",
                input_tokens: 10,
            }),
            record({
                message_id: "a2",
                session_id: "s1",
                timestamp: t("2026-07-10T07:50:00"),
                model: "sonnet-4",
                directory: "/proj/a",
                input_tokens: 20,
            }),
            // 完整小时 08:00（本地 16:00）
            record({
                message_id: "a3",
                session_id: "s1",
                timestamp: t("2026-07-10T08:30:00"),
                model: "sonnet-4",
                directory: "/proj/a",
                input_tokens: 30,
            }),
            // 完整小时 09:00（本地 17:00）
            record({
                message_id: "b1",
                session_id: "s2",
                timestamp: t("2026-07-10T09:15:00"),
                model: "opencode-latest",
                directory: "/proj/b",
                input_tokens: 40,
                source: "opencode",
                env: "wsl",
                agent: "opencode",
            }),
            record({
                message_id: "c1",
                session_id: "s3",
                timestamp: t("2026-07-10T09:40:00"),
                model: "kimi-max",
                directory: "/proj/c",
                input_tokens: 50,
                source: "kimi_code",
                env: "linux",
                agent: "kimi-code",
            }),
            // 当天尾（本地 23:59）
            record({
                message_id: "d1",
                session_id: "s4",
                timestamp: t("2026-07-10T15:59:00"),
                model: "sonnet-4",
                directory: "/proj/a",
                input_tokens: 60,
                env: "wsl",
            }),
            // 次日 08:00（本地 08:00）
            record({
                message_id: "a4",
                session_id: "s1",
                timestamp: t("2026-07-11T00:30:00"),
                model: "sonnet-4",
                directory: "/proj/a",
                input_tokens: 70,
            }),
            // 次日完整小时 12:00（本地 20:00）
            record({
                message_id: "b2",
                session_id: "s2",
                timestamp: t("2026-07-11T12:00:00"),
                model: "opencode-latest",
                directory: "/proj/b",
                input_tokens: 80,
                source: "opencode",
                env: "wsl",
                agent: "opencode",
            }),
            // 边界尾小时（12:00–12:15 部分，本地 20:00–20:15）
            record({
                message_id: "c2",
                session_id: "s3",
                timestamp: t("2026-07-11T12:10:00"),
                model: "kimi-max",
                directory: "/proj/c",
                input_tokens: 90,
                source: "kimi_code",
                env: "linux",
                agent: "kimi-code",
            }),
            // previous 窗口 [S-width, S) 内一条，使 previous summary 非空
            record({
                message_id: "p1",
                session_id: "s1",
                timestamp: t("2026-07-09T08:00:00"),
                model: "sonnet-4",
                directory: "/proj/a",
                input_tokens: 5,
            }),
        ];
        const queries: TokenStatsDashboardQuery[] = [
            {
                agent: "all",
                platform: "all",
                start: S,
                end: E,
                metric: "tokens",
                xaxis: "time",
                gran: "hour",
            },
            {
                agent: "all",
                platform: "all",
                start: S,
                end: E,
                metric: "calls",
                xaxis: "time",
                gran: "day",
            },
            {
                agent: "all",
                platform: "all",
                start: S,
                end: E,
                metric: "sessions",
                xaxis: "time",
                gran: "hour",
            },
            {
                agent: "all",
                platform: "all",
                start: S,
                end: E,
                metric: "tokens",
                xaxis: "project",
                gran: "day",
            },
            {
                agent: "all",
                platform: "all",
                start: S,
                end: E,
                metric: "tokens",
                xaxis: "session",
                gran: "hour",
                session_offset: 1,
                session_limit: 2,
            },
            {
                agent: "all",
                platform: "all",
                start: S,
                end: E,
                metric: "tokens",
                xaxis: "project",
                gran: "day",
                dir_aliases: [{ alias: "team-a", keys: ["/proj/a"] }],
            },
            {
                agent: "claude-code",
                platform: "all",
                start: S,
                end: E,
                metric: "tokens",
                xaxis: "time",
                gran: "hour",
            },
            {
                agent: "all",
                platform: "linux",
                start: S,
                end: E,
                metric: "tokens",
                xaxis: "time",
                gran: "hour",
            },
            {
                agent: "opencode",
                platform: "wsl",
                start: S,
                end: E,
                metric: "calls",
                xaxis: "project",
                gran: "day",
            },
            // 无完整小时的窗口（<1h，全走 records 边界段）
            {
                agent: "all",
                platform: "all",
                start: t("2026-07-10T07:35:00"),
                end: t("2026-07-10T07:55:00"),
                metric: "tokens",
                xaxis: "time",
                gran: "hour",
            },
            // t204: model 过滤须在 union 双源（rollup 整小时段 + records 边
            // 缘段）两侧一致——backfill 后走 rollup-ready 路径，断言与
            // records fallback 逐区域相等，覆盖 AC2 生产路径。
            {
                agent: "all",
                platform: "all",
                start: S,
                end: E,
                metric: "tokens",
                xaxis: "time",
                gran: "hour",
                model: "sonnet-4",
            },
        ];

        for (const q of queries) {
            it(`matches the records fallback after backfill for ${JSON.stringify(q)}`, () => {
                with_temp_store((db_path) => {
                    const store = create_token_stats_store(db_path);
                    store.upsert_records(recs);
                    const before = store.query_dashboard(q, status);
                    store.backfill_hour_rollup();
                    expect(store.is_hour_rollup_ready()).toBe(true);
                    const after = store.query_dashboard(q, status);
                    expect(after.current).toEqual(before.current);
                    expect(after.previous).toEqual(before.previous);
                    expect(after.chart_data).toEqual(before.chart_data);
                    expect(after.heatmap).toEqual(before.heatmap);
                    expect(after.sessions).toEqual(before.sessions);
                    store.close();
                });
            });
        }

        it("t387 AC-001: 同 session 跨多 directory rollup ready 汇总 == records 路径（不放大）", () => {
            with_temp_store((db_path) => {
                const store = create_token_stats_store(db_path);
                // 同 session s9 跨两 directory，各 1 条 record（calls=1+1=2）。
                store.upsert_records([
                    record({
                        message_id: "x1",
                        session_id: "s9",
                        directory: "/proj/a",
                        timestamp: t("2026-07-10T08:30:00"),
                    }),
                    record({
                        message_id: "x2",
                        session_id: "s9",
                        directory: "/proj/b",
                        timestamp: t("2026-07-10T09:30:00"),
                    }),
                ]);
                const query: TokenStatsDashboardQuery = {
                    agent: "all",
                    platform: "all",
                    start: S,
                    end: E,
                    metric: "tokens",
                    xaxis: "time",
                    gran: "hour",
                };
                const before = store.query_dashboard(query, status);
                store.backfill_hour_rollup();
                expect(store.is_hour_rollup_ready()).toBe(true);
                const after = store.query_dashboard(query, status);
                // 修复前 rollup ready 输出翻倍（JOIN 放大），修复后两路径一致。
                expect(after.current).toEqual(before.current);
                expect(after.current.calls).toBe(2);
                store.close();
            });
        });

        it("t387 AC-003: 同 session 跨多 directory 会话列表只出现一次", () => {
            with_temp_store((db_path) => {
                const store = create_token_stats_store(db_path);
                store.upsert_records([
                    record({
                        message_id: "x1",
                        session_id: "s9",
                        directory: "/proj/a",
                        timestamp: t("2026-07-10T08:30:00"),
                    }),
                    record({
                        message_id: "x2",
                        session_id: "s9",
                        directory: "/proj/b",
                        timestamp: t("2026-07-10T09:30:00"),
                    }),
                ]);
                store.backfill_hour_rollup();
                const query: TokenStatsDashboardQuery = {
                    agent: "all",
                    platform: "all",
                    start: S,
                    end: E,
                    metric: "tokens",
                    xaxis: "time",
                    gran: "hour",
                };
                const dto = store.query_dashboard(query, status);
                const sessions = dto.sessions.items.filter((s) => s.session_id === "s9");
                // 会话列表去重：s9 只出现一次（修复前两 directory 各一行重复）。
                expect(sessions).toHaveLength(1);
                // 跨 directory 聚合：calls=2（非单 directory 的部分值）。
                expect(sessions[0]?.calls).toBe(2);
                store.close();
            });
        });

        it("t430 AC-001: rollup ready 路径跨多 directory 会话 directory 取最新记录目录（与 records 路径一致）", () => {
            with_temp_store((db_path) => {
                const store = create_token_stats_store(db_path);
                // 同 session 跨两 directory：/aaa（字典序前）的记录时间更晚（最新）。
                // 修复前 rollup 路径 MAX(directory) 字典序 → /zzz（错）；修复后取最新
                // 记录目录 → /aaa，与 records 路径一致。
                store.upsert_records([
                    record({
                        message_id: "x1",
                        session_id: "s10",
                        directory: "/zzz",
                        timestamp: t("2026-07-10T08:30:00"),
                    }),
                    record({
                        message_id: "x2",
                        session_id: "s10",
                        directory: "/aaa",
                        timestamp: t("2026-07-10T09:30:00"),
                    }),
                ]);
                const query: TokenStatsDashboardQuery = {
                    agent: "all",
                    platform: "all",
                    start: S,
                    end: E,
                    metric: "tokens",
                    xaxis: "time",
                    gran: "hour",
                };
                // records 路径（backfill 前）：取最新记录目录 /aaa。
                // t430_test_f001 修复：hour_rollup_ready 持久化于 meta 表，重开连接
                // 仍走 rollup 路径——须同 store 内 backfill 前先查，才构成真对照。
                const before = store.query_dashboard(query, status);
                const session_before = before.sessions.items.find((s) => s.session_id === "s10");
                expect(session_before?.directory).toBe("/aaa");

                store.backfill_hour_rollup();
                expect(store.is_hour_rollup_ready()).toBe(true);
                const dto = store.query_dashboard(query, status);
                const session = dto.sessions.items.find((s) => s.session_id === "s10");
                expect(session?.directory).toBe("/aaa");
                // 两路径 directory 展示一致
                expect(session?.directory).toBe(session_before?.directory);
                store.close();
            });
        });

        it("t430 AC-002/AC-003: 单 directory 会话展示不变；分页计数不受影响", () => {
            with_temp_store((db_path) => {
                const store = create_token_stats_store(db_path);
                store.upsert_records([
                    record({
                        message_id: "p1",
                        session_id: "s-a",
                        directory: "/proj/one",
                        timestamp: S,
                    }),
                    record({
                        message_id: "p2",
                        session_id: "s-b",
                        directory: "/proj/two",
                        timestamp: S + 1000,
                    }),
                ]);
                store.backfill_hour_rollup();
                const query: TokenStatsDashboardQuery = {
                    agent: "all",
                    platform: "all",
                    start: S,
                    end: E,
                    metric: "tokens",
                    xaxis: "time",
                    gran: "hour",
                };
                const dto = store.query_dashboard(query, status);
                const sa = dto.sessions.items.find((s) => s.session_id === "s-a");
                expect(sa?.directory).toBe("/proj/one");
                expect(dto.sessions.total).toBe(2);
                store.close();
            });
        });

        it("union dual-source path filters every region by model after backfill (t204)", () => {
            with_temp_store((db_path) => {
                const store = create_token_stats_store(db_path);
                store.upsert_records(recs);
                store.backfill_hour_rollup();
                expect(store.is_hour_rollup_ready()).toBe(true);
                const query: TokenStatsDashboardQuery = {
                    agent: "all",
                    platform: "all",
                    start: S,
                    end: E,
                    metric: "tokens",
                    xaxis: "time",
                    gran: "hour",
                    model: "sonnet-4",
                };
                const result = store.query_dashboard(query, status);
                // KPI only counts sonnet-4 records (a1/a2/a3/d1/a4 = 5 calls).
                expect(result.current.calls).toBe(5);
                // Filtered sessions are exactly the sonnet-4 sessions (s1, s4).
                expect(result.sessions.items.map((s) => s.session_id).sort()).toEqual(["s1", "s4"]);
                // Chart/heatmap regions never carry other models.
                expect(result.chart_data.metric_buckets.every((b) => b.model === "sonnet-4")).toBe(
                    true,
                );
                expect(result.chart_data.rollup.every((r) => r.model === "sonnet-4")).toBe(true);
                store.close();
            });
        });

        it("t428 AC-004: rollup ready 后 union 路径 agent+model 组合过滤（双源均只返回匹配行）", () => {
            with_temp_store((db_path) => {
                const store = create_token_stats_store(db_path);
                // 5 条记录：正向/负向行覆盖 union 4 切片——
                // rollup×model（am6 非匹配）/ rollup×agent（am2 非匹配）/
                // records×model（am3 非匹配）/ records×agent（am5 非匹配）；
                // am4 落边缘带验证 records 源正向命中（t428_test_f002 修复）。
                store.upsert_records([
                    record({
                        message_id: "am1",
                        timestamp: t("2026-07-10T08:30:00"),
                        model: "sonnet-4",
                        agent: "claude-code",
                        session_id: "s-claude",
                    }),
                    record({
                        message_id: "am2",
                        timestamp: t("2026-07-10T09:30:00"),
                        model: "sonnet-4",
                        agent: "opencode",
                        session_id: "s-opencode",
                    }),
                    record({
                        message_id: "am3",
                        timestamp: t("2026-07-10T07:45:00"),
                        model: "grok-4.5",
                        agent: "claude-code",
                        session_id: "s-claude-2",
                    }),
                    record({
                        message_id: "am4",
                        timestamp: t("2026-07-10T07:50:00"),
                        model: "sonnet-4",
                        agent: "claude-code",
                        session_id: "s-claude-3",
                    }),
                    record({
                        message_id: "am5",
                        timestamp: t("2026-07-10T07:55:00"),
                        model: "sonnet-4",
                        agent: "opencode",
                        session_id: "s-opencode-2",
                    }),
                    record({
                        message_id: "am6",
                        timestamp: t("2026-07-10T09:00:00"),
                        model: "grok-4.5",
                        agent: "claude-code",
                        session_id: "s-claude-4",
                    }),
                ]);
                store.backfill_hour_rollup();
                expect(store.is_hour_rollup_ready()).toBe(true);
                const query: TokenStatsDashboardQuery = {
                    agent: "claude-code",
                    platform: "all",
                    start: S,
                    end: E,
                    metric: "tokens",
                    xaxis: "time",
                    gran: "hour",
                    model: "sonnet-4",
                };
                const result = store.query_dashboard(query, status);
                // 只命中 claude-code + sonnet-4 两条（am1/am4）；opencode 的 sonnet-4
                // 与 claude-code 的 grok-4.5 都被过滤。
                expect(result.current.calls).toBe(2);
                expect(result.sessions.items.map((s) => s.session_id).sort()).toEqual([
                    "s-claude",
                    "s-claude-3",
                ]);
                expect(result.chart_data.metric_buckets.every((b) => b.model === "sonnet-4")).toBe(
                    true,
                );
                expect(result.chart_data.rollup.every((r) => r.model === "sonnet-4")).toBe(true);
                store.close();
            });
        });

        it("t428 AC-005: rollup ready 后 union 路径跨 model 同 session 会话去重", () => {
            with_temp_store((db_path) => {
                const store = create_token_stats_store(db_path);
                // 同一 session s-multi 跨两个 model 各 1 条记录。
                store.upsert_records([
                    record({
                        message_id: "sm1",
                        timestamp: t("2026-07-10T08:30:00"),
                        model: "sonnet-4",
                        session_id: "s-multi",
                    }),
                    record({
                        message_id: "sm2",
                        timestamp: t("2026-07-10T09:30:00"),
                        model: "grok-4.5",
                        session_id: "s-multi",
                    }),
                    record({
                        message_id: "sm3",
                        timestamp: t("2026-07-10T10:30:00"),
                        model: "sonnet-4",
                        session_id: "s-other",
                    }),
                ]);
                store.backfill_hour_rollup();
                expect(store.is_hour_rollup_ready()).toBe(true);
                const query: TokenStatsDashboardQuery = {
                    agent: "all",
                    platform: "all",
                    start: S,
                    end: E,
                    metric: "tokens",
                    xaxis: "time",
                    gran: "hour",
                };
                const result = store.query_dashboard(query, status);
                // sessions 列表无重复 session：s-multi 只出现一次（跨 model 合并）。
                const session_ids = result.sessions.items.map((s) => s.session_id);
                expect(new Set(session_ids).size).toBe(session_ids.length);
                expect(session_ids.sort()).toEqual(["s-multi", "s-other"]);
                // KPI 按记录数计：3 条全命中。
                expect(result.current.calls).toBe(3);
                store.close();
            });
        });

        it("reports the committed data version in the DTO and bumps it once per batch (AC3)", () => {
            with_temp_store((db_path) => {
                const store = create_token_stats_store(db_path);
                const query: TokenStatsDashboardQuery = {
                    agent: "all",
                    platform: "all",
                    start: S,
                    end: E,
                    metric: "tokens",
                    xaxis: "time",
                    gran: "hour",
                };
                expect(store.query_dashboard(query, status).data_version).toBe(0);
                store.upsert_records([record({ message_id: "a1", timestamp: S })]);
                expect(store.query_dashboard(query, status).data_version).toBe(1);
                expect(store.query_dashboard(query, status).data_version).toBe(
                    store.get_data_version(),
                );
                store.upsert_records([record({ message_id: "a2", timestamp: S + 1000 })]);
                expect(store.query_dashboard(query, status).data_version).toBe(2);
                store.close();
            });
        });
    });

    describe("incremental test gaps (t202)", () => {
        const read_rollup = (db_path: string): Record<string, unknown>[] => {
            const raw = new Database(db_path, { readonly: true });
            try {
                return raw
                    .prepare(
                        "SELECT source, env, session_id, hour_start, model, directory, agent, calls, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens FROM token_stats_hour_rollup ORDER BY source, env, session_id, hour_start, model",
                    )
                    .all() as Record<string, unknown>[];
            } finally {
                raw.close();
            }
        };
        const oracle_rollup = (db_path: string): Record<string, unknown>[] => {
            const raw = new Database(db_path, { readonly: true });
            try {
                return raw
                    .prepare(
                        "SELECT source, env, session_id, (timestamp - ((timestamp + 28800000) % 3600000)) AS hour_start, model, directory, agent, COUNT(*) AS calls, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens, SUM(cache_read_tokens) AS cache_read_tokens, SUM(cache_write_tokens) AS cache_write_tokens FROM token_stats_records GROUP BY source, env, session_id, hour_start, model, directory, agent ORDER BY source, env, session_id, hour_start, model",
                    )
                    .all() as Record<string, unknown>[];
            } finally {
                raw.close();
            }
        };

        it("AC1 (p032): an incremental upsert of one session leaves the untouched session's rollup intact", () => {
            with_temp_store((db_path) => {
                const store = create_token_stats_store(db_path);
                store.upsert_records([
                    record({
                        message_id: "a1",
                        session_id: "s1",
                        timestamp: T0,
                        input_tokens: 100,
                    }),
                    record({ message_id: "b1", session_id: "s2", timestamp: T0, input_tokens: 50 }),
                ]);
                // Two sessions → two rollup rows on the incremental path (no
                // backfill yet).
                expect(read_rollup(db_path)).toHaveLength(2);

                // Touch only s1; s2's row must be preserved — a missing
                // session_id predicate on the incremental delete would clear it.
                store.upsert_records([
                    record({
                        message_id: "a2",
                        session_id: "s1",
                        timestamp: T0 + 60000,
                        input_tokens: 7,
                    }),
                ]);
                expect(read_rollup(db_path)).toEqual(oracle_rollup(db_path));
                store.close();
            });
        });

        it("AC2 (p033): a failing batch rolls back without advancing the version or the records", () => {
            with_temp_store((db_path) => {
                const store = create_token_stats_store(db_path);
                store.upsert_records([record({ message_id: "a1" })]);
                expect(store.get_data_version()).toBe(1);
                expect(store.query_records({ env: "linux" })).toHaveLength(1);

                // A NOT NULL violation (message_id is NOT NULL) mid-transaction
                // must roll the whole batch back: version and records stay at
                // their pre-batch values.
                expect(() => {
                    store.upsert_records([
                        record({ message_id: "ok-1" }),
                        {
                            ...record({ message_id: "bad-1" }),
                            message_id: undefined as unknown as string,
                        },
                    ]);
                }).toThrow();
                expect(store.get_data_version()).toBe(1);
                expect(store.query_records({ env: "linux" })).toHaveLength(1);
                store.close();
            });
        });

        it("AC5 (p036): a rollup-ready dashboard read scans the hour rollup, never the full records table", () => {
            with_temp_store((db_path) => {
                const store = create_token_stats_store(db_path);
                store.upsert_records([record({ message_id: "a1", timestamp: T0 })]);
                store.backfill_hour_rollup();
                expect(store.is_hour_rollup_ready()).toBe(true);

                const sqls: string[] = [];
                const traced = create_token_stats_store(db_path, { on_sql: (s) => sqls.push(s) });
                traced.query_dashboard(
                    {
                        agent: "all",
                        platform: "all",
                        start: T0,
                        end: T0 + 3 * 3600000,
                        metric: "tokens",
                        xaxis: "time",
                        gran: "hour",
                    },
                    { running: false, last_updated: null },
                );

                const materialize = sqls.find((s) => s.includes("CREATE TEMP TABLE window_rows"));
                expect(materialize).toBeTruthy();
                if (!materialize) throw new Error("expected materialize SQL");
                // The rollup-ready source reads the middle band from the hour
                // rollup and bounds the edge bands by @full_start/@full_end.
                expect(materialize).toContain("token_stats_hour_rollup");
                expect(materialize).toContain("timestamp >= @start AND timestamp < @full_start");
                // Structural EXPLAIN (values irrelevant, plan is shape-only): the
                // window must resolve through the hour rollup and never SCAN the
                // full records table (a SCAN would couple read scale to
                // per-message volume). Robust to the rollup side being either a
                // SCAN (no index) or a SEARCH (PK index) per planner choice.
                const plan = new Database(db_path, { readonly: true })
                    .prepare(`EXPLAIN QUERY PLAN ${materialize}`)
                    .all({
                        start: T0,
                        end: T0 + 3 * 3600000,
                        full_start: T0,
                        full_end: T0 + 3 * 3600000,
                    })
                    .map((r) => (r as { detail: string }).detail);
                expect(plan.some((d) => d.includes("token_stats_hour_rollup"))).toBe(true);
                expect(plan.some((d) => d.includes("SCAN token_stats_records"))).toBe(false);
                traced.close();
                store.close();
            });
        });

        it("AC6 (p037): the ready flag persists across reopen and incremental upserts stay consistent", () => {
            with_temp_store((db_path) => {
                const store1 = create_token_stats_store(db_path);
                store1.upsert_records([record({ message_id: "a1", timestamp: T0 })]);
                store1.backfill_hour_rollup();
                expect(store1.is_hour_rollup_ready()).toBe(true);
                store1.close();

                const store2 = create_token_stats_store(db_path);
                expect(store2.is_hour_rollup_ready()).toBe(true);
                store2.upsert_records([record({ message_id: "b1", timestamp: T0 + 60000 })]);
                expect(read_rollup(db_path)).toEqual(oracle_rollup(db_path));
                store2.close();
            });
        });

        describe("query_dashboard model alias mapping (t230)", () => {
            it("returns aliased model names in dashboard.models", () => {
                store.upsert_records([
                    record({
                        message_id: "a1",
                        timestamp: T0,
                        model: "claude-3-5-sonnet-20241022",
                    }),
                    record({ message_id: "a2", timestamp: T0, model: "opus" }),
                ]);
                const query: TokenStatsDashboardQuery = {
                    agent: "all",
                    platform: "all",
                    start: T0 - 3600000,
                    end: T0 + 3600000,
                    metric: "tokens",
                    xaxis: "time",
                    gran: "day",
                    model_aliases: [{ alias: "Sonnet", keys: ["claude-3-5-sonnet-20241022"] }],
                };
                const dto = store.query_dashboard(query, { running: false, last_updated: null });
                expect(dto.models).toEqual(["Sonnet", "opus"]);
            });

            it("t384 AC-002: 归并展开——选展示名命中整组（alias 与原始 key 记录都计入）", () => {
                store.upsert_records([
                    record({
                        message_id: "a1",
                        timestamp: T0,
                        model: "claude-3-5-sonnet-20241022",
                    }),
                    record({ message_id: "a2", timestamp: T0, model: "opus" }),
                ]);
                const query: TokenStatsDashboardQuery = {
                    agent: "all",
                    platform: "all",
                    start: T0 - 3600000,
                    end: T0 + 3600000,
                    metric: "tokens",
                    xaxis: "time",
                    gran: "day",
                    model_aliases: [{ alias: "Sonnet", keys: ["claude-3-5-sonnet-20241022"] }],
                };
                // 选展示名 Sonnet → 归并展开到 keys {Sonnet, claude-3-5-sonnet-20241022}
                const filtered = store.query_dashboard(
                    { ...query, model: "Sonnet" },
                    { running: false, last_updated: null },
                );
                expect(filtered.current.calls).toBe(1);
                // 原始 key 记录也被命中（归并），metric buckets 保留原始名
                expect(filtered.chart_data.metric_buckets.map((b) => b.model)).toEqual([
                    "claude-3-5-sonnet-20241022",
                ]);
                // 反向：选原始 key 同样展开整组
                const via_raw = store.query_dashboard(
                    { ...query, model: "claude-3-5-sonnet-20241022" },
                    { running: false, last_updated: null },
                );
                expect(via_raw.current.calls).toBe(1);
            });

            it("t384 AC-001: alias 名与真实 model 名碰撞时筛选有数据", () => {
                store.upsert_records([
                    record({ message_id: "a1", timestamp: T0, model: "deepseek-v4-flash" }),
                    record({ message_id: "a2", timestamp: T0, model: "__secondary__" }),
                ]);
                const query: TokenStatsDashboardQuery = {
                    agent: "all",
                    platform: "all",
                    start: T0 - 3600000,
                    end: T0 + 3600000,
                    metric: "tokens",
                    xaxis: "time",
                    gran: "day",
                    model_aliases: [{ alias: "deepseek-v4-flash", keys: ["__secondary__"] }],
                };
                // 展示名 deepseek-v4-flash 恰是真实 model 名：resolver(deepseek-v4-flash)
                // = deepseek-v4-flash（非 alias key 恒等），keys = {deepseek-v4-flash,
                // __secondary__}（resolver(__secondary__)=deepseek-v4-flash）
                const dto = store.query_dashboard(
                    { ...query, model: "deepseek-v4-flash" },
                    { running: false, last_updated: null },
                );
                // 两条记录都命中（碰撞修复，此前为 0）
                expect(dto.current.calls).toBe(2);
            });

            it("t384 AC-004: 归并不破坏 agent 过滤——agent 条件排除其它 agent 的 __secondary__", () => {
                store.upsert_records([
                    record({
                        message_id: "c1",
                        timestamp: T0,
                        model: "deepseek-v4-flash",
                        agent: "claude-code",
                    }),
                    record({
                        message_id: "k1",
                        timestamp: T0,
                        model: "__secondary__",
                        agent: "kimi-code",
                    }),
                ]);
                const query: TokenStatsDashboardQuery = {
                    agent: "claude-code",
                    platform: "all",
                    start: T0 - 3600000,
                    end: T0 + 3600000,
                    metric: "tokens",
                    xaxis: "time",
                    gran: "day",
                    model_aliases: [{ alias: "deepseek-v4-flash", keys: ["__secondary__"] }],
                };
                const dto = store.query_dashboard(
                    { ...query, model: "deepseek-v4-flash" },
                    { running: false, last_updated: null },
                );
                // agent=claude_code 排除 kimi_code 的 __secondary__，只命中 1 条
                expect(dto.current.calls).toBe(1);
            });

            it("t384 AC-005: 无 aliases 时单值相等过滤，行为不变", () => {
                store.upsert_records([
                    record({ message_id: "a1", timestamp: T0, model: "opus" }),
                    record({ message_id: "a2", timestamp: T0, model: "sonnet" }),
                ]);
                const query: TokenStatsDashboardQuery = {
                    agent: "all",
                    platform: "all",
                    start: T0 - 3600000,
                    end: T0 + 3600000,
                    metric: "tokens",
                    xaxis: "time",
                    gran: "day",
                };
                const dto = store.query_dashboard(
                    { ...query, model: "opus" },
                    { running: false, last_updated: null },
                );
                expect(dto.current.calls).toBe(1);
            });

            it("t384 AC-002: 归并展开在 rollup ready 后 union 路径同样生效", () => {
                store.upsert_records([
                    record({ message_id: "u1", timestamp: T0, model: "deepseek-v4-flash" }),
                    record({ message_id: "u2", timestamp: T0, model: "__secondary__" }),
                ]);
                store.backfill_hour_rollup();
                const query: TokenStatsDashboardQuery = {
                    agent: "all",
                    platform: "all",
                    start: T0 - 3600000,
                    end: T0 + 3600000,
                    metric: "tokens",
                    xaxis: "time",
                    gran: "day",
                    model_aliases: [{ alias: "deepseek-v4-flash", keys: ["__secondary__"] }],
                };
                const dto = store.query_dashboard(
                    { ...query, model: "deepseek-v4-flash" },
                    { running: false, last_updated: null },
                );
                expect(dto.current.calls).toBe(2);
            });

            it("t384: 多 key alias 展开整组（spec 风险区）", () => {
                store.upsert_records([
                    record({ message_id: "m1", timestamp: T0, model: "m1-raw" }),
                    record({ message_id: "m6", timestamp: T0, model: "m6-raw" }),
                    record({ message_id: "other", timestamp: T0, model: "unrelated" }),
                ]);
                const query: TokenStatsDashboardQuery = {
                    agent: "all",
                    platform: "all",
                    start: T0 - 3600000,
                    end: T0 + 3600000,
                    metric: "tokens",
                    xaxis: "time",
                    gran: "day",
                    model_aliases: [{ alias: "GroupX", keys: ["m1-raw", "m6-raw"] }],
                };
                const dto = store.query_dashboard(
                    { ...query, model: "GroupX" },
                    { running: false, last_updated: null },
                );
                // 两个 key 记录都命中，unrelated 排除
                expect(dto.current.calls).toBe(2);
            });

            it("t384: resolver 后写覆盖——同 key 多个 alias 组只按最后声明的别名展开", () => {
                store.upsert_records([
                    record({ message_id: "k1", timestamp: T0, model: "shared-key" }),
                ]);
                const query: TokenStatsDashboardQuery = {
                    agent: "all",
                    platform: "all",
                    start: T0 - 3600000,
                    end: T0 + 3600000,
                    metric: "tokens",
                    xaxis: "time",
                    gran: "day",
                    // shared-key 先属 A 后属 B（后写覆盖 → resolver 归到 B）
                    model_aliases: [
                        { alias: "AliasA", keys: ["shared-key"] },
                        { alias: "AliasB", keys: ["shared-key"] },
                    ],
                };
                // 选 AliasA：resolver(shared-key)=AliasB≠AliasA，shared-key 不在 A 组
                const via_a = store.query_dashboard(
                    { ...query, model: "AliasA" },
                    { running: false, last_updated: null },
                );
                expect(via_a.current.calls).toBe(0);
                // 选 AliasB：shared-key 命中
                const via_b = store.query_dashboard(
                    { ...query, model: "AliasB" },
                    { running: false, last_updated: null },
                );
                expect(via_b.current.calls).toBe(1);
            });
        });
    });
});
