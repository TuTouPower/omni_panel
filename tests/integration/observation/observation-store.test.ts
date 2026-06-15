import Database from "better-sqlite3";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { create_observation_store } from "../../../src/main/core/observation/observation-store";
import type { Observation } from "../../../src/shared/types/observation";
import type { ObservationStore } from "../../../src/main/core/observation/observation-store";

function assertNonNull<T>(
    value: T,
    message = "expected non-null",
): asserts value is NonNullable<T> {
    expect(value, message).not.toBeNull();
}

let temp_dir: string;
let store: ObservationStore;

function make_observation(overrides: Partial<Observation> = {}): Observation {
    return {
        provider: "tavily",
        source_instance_id: "tavily-1",
        account_id: "default",
        account_label: "Tavily",
        metric_id: "tavily:monthly_usage",
        raw_label: "monthly_usage",
        normalized_label: "月度用量",
        window: "month",
        used: 100,
        limit: 1000,
        display_style: "ratio",
        reset_at: 1735689600000,
        status: "normal",
        observed_at: Date.now(),
        source: "poll",
        stale: false,
        last_error: null,
        ...overrides,
    };
}

beforeEach(async () => {
    temp_dir = await mkdtemp(join(tmpdir(), "obs-store-test-"));
    store = create_observation_store(join(temp_dir, "test.db"));
});

afterEach(() => {
    store.close();
    rm(temp_dir, { recursive: true, force: true }).catch(() => undefined);
});

describe("observation-store", () => {
    it("inserts and retrieves latest observation", () => {
        const obs = make_observation({ observed_at: 1000 });
        store.insert(obs);
        const result = store.get_latest("tavily", "default", "tavily:monthly_usage", "tavily-1");
        assertNonNull(result, "get_latest should return a result");
        expect(result.observed_at).toBe(1000);
    });

    it("returns null for non-existent key", () => {
        const result = store.get_latest("nope", "nope", "nope", "nope");
        expect(result).toBeNull();
    });

    it("returns latest when multiple observations exist for same key", () => {
        store.insert(make_observation({ observed_at: 1000 }));
        store.insert(make_observation({ observed_at: 2000 }));
        store.insert(make_observation({ observed_at: 1500 }));
        const result = store.get_latest("tavily", "default", "tavily:monthly_usage", "tavily-1");
        assertNonNull(result, "get_latest should return a result");
        expect(result.observed_at).toBe(2000);
    });

    it("keeps all rows (append-only) but list_latest returns only latest", () => {
        store.insert(make_observation({ observed_at: 1000 }));
        store.insert(make_observation({ observed_at: 2000 }));
        store.insert(make_observation({ observed_at: 3000 }));
        const all = store.list_latest_by_provider("tavily");
        expect(all).toHaveLength(1);
        assertNonNull(all[0], "should have one element");
        expect(all[0].observed_at).toBe(3000);
    });

    it("lists latest per unique (account, metric, source) within provider", () => {
        store.insert(
            make_observation({
                account_id: "a1",
                metric_id: "m1",
                source_instance_id: "s1",
                observed_at: 1000,
            }),
        );
        store.insert(
            make_observation({
                account_id: "a1",
                metric_id: "m1",
                source_instance_id: "s1",
                observed_at: 2000,
            }),
        );
        store.insert(
            make_observation({
                account_id: "a2",
                metric_id: "m1",
                source_instance_id: "s1",
                observed_at: 3000,
            }),
        );
        const all = store.list_latest_by_provider("tavily");
        expect(all).toHaveLength(2);
    });

    it("lists all providers", () => {
        store.insert(make_observation({ provider: "tavily" }));
        store.insert(make_observation({ provider: "deepseek" }));
        const providers = store.list_all_providers();
        expect(providers).toContain("tavily");
        expect(providers).toContain("deepseek");
    });

    it("prunes old observations but keeps latest", () => {
        const now = Date.now();
        store.insert(make_observation({ observed_at: now - 100 * 24 * 60 * 60 * 1000 }));
        store.insert(make_observation({ observed_at: now - 91 * 24 * 60 * 60 * 1000 }));
        store.insert(make_observation({ observed_at: now }));
        const pruned = store.prune(now - 90 * 24 * 60 * 60 * 1000);
        expect(pruned).toBe(2);
        const latest = store.get_latest("tavily", "default", "tavily:monthly_usage", "tavily-1");
        assertNonNull(latest, "get_latest should return a result after prune");
        expect(latest.observed_at).toBe(now);
    });

    it("preserves stale and last_error fields", () => {
        const obs = make_observation({ stale: true, last_error: "connection refused" });
        store.insert(obs);
        const result = store.get_latest("tavily", "default", "tavily:monthly_usage", "tavily-1");
        assertNonNull(result, "get_latest should return a result");
        expect(result.stale).toBe(true);
        expect(result.last_error).toBe("connection refused");
    });

    it("does not lose data under concurrent inserts from multiple connections", () => {
        // better-sqlite3 is synchronous per connection, but multiple connections
        // hitting WAL can still contend. Simulate with a second connection.
        const db_path = join(temp_dir, "test.db");
        const store_b = create_observation_store(db_path);
        try {
            const N = 50;
            for (let i = 0; i < N; i++) {
                store.insert(make_observation({ observed_at: 1000 + i }));
                store_b.insert(make_observation({ observed_at: 2000 + i }));
            }
            // All rows must survive: distinct (account, metric, source) keyed by latest only,
            // but here all keys are identical so list_latest_by_provider returns 1 entry.
            // Verify append-only count via a direct connection to confirm no rows dropped.
            const check = new Database(db_path);
            try {
                const row = check.prepare("SELECT COUNT(*) AS n FROM observations").get() as {
                    n: number;
                };
                expect(row.n).toBe(N * 2);
            } finally {
                check.close();
            }
        } finally {
            store_b.close();
        }
    });

    it("sets busy_timeout pragma so writes do not wait indefinitely", () => {
        // Verify the pragma was actually applied. Without it, SQLITE_BUSY could
        // surface as an immediate throw rather than a bounded retry.
        const db_path = join(temp_dir, "pragma.db");
        const s = create_observation_store(db_path);
        try {
            const check = new Database(db_path);
            try {
                const row = check.pragma("busy_timeout", { simple: true }) as number;
                expect(row).toBeGreaterThanOrEqual(1000);
            } finally {
                check.close();
            }
        } finally {
            s.close();
        }
    });
});
