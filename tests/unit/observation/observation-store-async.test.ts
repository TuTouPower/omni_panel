import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { create_observation_store } from "../../../src/main/core/observation/observation-store";
import {
    create_async_observation_store,
    wrap_sync_as_async,
} from "../../../src/main/core/observation/observation-store-async";
import type { Observation } from "../../../src/shared/types/observation";

let temp_dir: string;

function make_obs(overrides: Partial<Observation> = {}): Observation {
    return {
        provider: "test",
        source_instance_id: "test-instance",
        account_id: "acc-1",
        account_label: "Test Account",
        metric_id: "test:metric",
        raw_label: "test-metric",
        normalized_label: "Test Metric",
        window: "day",
        used: 42,
        limit: 100,
        display_style: "percent",
        reset_at: null,
        status: "normal",
        observed_at: Date.now(),
        source: "poll",
        stale: false,
        last_error: null,
        ...overrides,
    };
}

beforeAll(async () => {
    temp_dir = await mkdtemp(join(tmpdir(), "obs-store-async-test-"));
});

afterAll(async () => {
    await rm(temp_dir, { recursive: true, force: true });
});

describe("wrap_sync_as_async", () => {
    it("insert and get_latest round-trip", async () => {
        const db_path = join(temp_dir, "wrap-sync.db");
        const sync = create_observation_store(db_path);
        const store = wrap_sync_as_async(sync);

        const obs = make_obs();
        await store.insert(obs);

        const found = await store.get_latest("test", "acc-1", "test:metric", "test-instance");
        expect(found).not.toBeNull();
        expect(found?.provider).toBe("test");
        expect(found?.used).toBe(42);

        sync.close();
    });

    it("list_latest_by_provider returns inserted observations", async () => {
        const db_path = join(temp_dir, "wrap-list.db");
        const sync = create_observation_store(db_path);
        const store = wrap_sync_as_async(sync);

        await store.insert(make_obs({ provider: "alpha" }));
        await store.insert(make_obs({ provider: "beta" }));

        const alpha = await store.list_latest_by_provider("alpha");
        expect(alpha).toHaveLength(1);
        expect(alpha[0].provider).toBe("alpha");

        sync.close();
    });

    it("list_all_providers returns unique providers", async () => {
        const db_path = join(temp_dir, "wrap-providers.db");
        const sync = create_observation_store(db_path);
        const store = wrap_sync_as_async(sync);

        await store.insert(make_obs({ provider: "p1" }));
        await store.insert(make_obs({ provider: "p2" }));

        const providers = await store.list_all_providers();
        expect(providers).toContain("p1");
        expect(providers).toContain("p2");

        sync.close();
    });

    it("list_by_source_instance_id filters correctly", async () => {
        const db_path = join(temp_dir, "wrap-source.db");
        const sync = create_observation_store(db_path);
        const store = wrap_sync_as_async(sync);

        await store.insert(make_obs({ source_instance_id: "a" }));
        await store.insert(make_obs({ source_instance_id: "b" }));

        const items = await store.list_by_source_instance_id("a");
        expect(items).toHaveLength(1);
        expect(items[0].source_instance_id).toBe("a");

        sync.close();
    });

    it("prune removes old observations", async () => {
        const db_path = join(temp_dir, "wrap-prune.db");
        const sync = create_observation_store(db_path);
        const store = wrap_sync_as_async(sync);

        await store.insert(make_obs({ observed_at: 1000 }));
        await store.insert(make_obs({ observed_at: Date.now() }));

        const removed = await store.prune(Date.now() - 10_000);
        expect(removed).toBeGreaterThanOrEqual(1);

        sync.close();
    });

    it("all methods return Promises (regression: async wrapper must not throw synchronously)", async () => {
        const db_path = join(temp_dir, "wrap-promises.db");
        const sync = create_observation_store(db_path);
        const store = wrap_sync_as_async(sync);

        const obs = make_obs();
        const insertResult = store.insert(obs);
        expect(insertResult).toBeInstanceOf(Promise);
        await insertResult;

        const getLatestResult = store.get_latest("test", "acc-1", "test:metric", "test-instance");
        expect(getLatestResult).toBeInstanceOf(Promise);
        await getLatestResult;

        const listResult = store.list_latest_by_provider("test");
        expect(listResult).toBeInstanceOf(Promise);
        await listResult;

        const providersResult = store.list_all_providers();
        expect(providersResult).toBeInstanceOf(Promise);
        await providersResult;

        const sourceResult = store.list_by_source_instance_id("test-instance");
        expect(sourceResult).toBeInstanceOf(Promise);
        await sourceResult;

        const pruneResult = store.prune(0);
        expect(pruneResult).toBeInstanceOf(Promise);
        await pruneResult;

        const closeResult = store.close();
        expect(closeResult).toBeInstanceOf(Promise);
        await closeResult;
    });
});

describe("create_async_observation_store", () => {
    it("end-to-end: insert and retrieve observation (regression: worker broken in packaged app)", async () => {
        const db_path = join(temp_dir, "async-e2e.db");
        const store = create_async_observation_store(db_path);

        const obs = make_obs({
            provider: "deepseek",
            account_id: "deepseek",
            metric_id: "deepseek:balance-CNY",
            used: 88.5,
        });
        await store.insert(obs);

        const found = await store.get_latest(
            "deepseek",
            "deepseek",
            "deepseek:balance-CNY",
            "test-instance",
        );
        expect(found).not.toBeNull();
        expect(found?.used).toBe(88.5);
        expect(found?.provider).toBe("deepseek");

        await store.close();
    });
});
