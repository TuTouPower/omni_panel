import { createServer } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create_local_api_server } from "../../../src/main/core/local-api/server";
import { create_observation_store } from "../../../src/main/core/observation/observation-store";
import { create_token_stats_store } from "../../../src/main/core/token-stats/token-stats-store";
import { createRuntimeStore } from "../../../src/main/core/scheduler/runtime-store";
import type { RuntimeStore } from "../../../src/main/core/scheduler/runtime-store";
import type { LocalAPIServer } from "../../../src/main/core/local-api/server";
import type { ObservationStore } from "../../../src/main/core/observation/observation-store";
import type { TokenStatsStore } from "../../../src/main/core/token-stats/token-stats-store";
import type { ConfigIpcDeps } from "../../../src/main/ipc/config-ipc";
import type { ConnectorIpcDeps } from "../../../src/main/ipc/connector-ipc";
import type {
    QueryResult,
    SessionHistorySubscriptionService,
    SessionRow,
    SessionsProvider,
} from "../../../src/main/core/session-history/subscription-service";
import { clear_resolution_cache } from "../../../src/main/core/session-history/session-locator";

let temp_dir: string;
let sync_store: ObservationStore;
let store: ObservationStore;
let api: LocalAPIServer;
let token_stats_store: TokenStatsStore;
let config_deps: ConfigIpcDeps;
let connector_deps: ConnectorIpcDeps;
let runtime_store: RuntimeStore;
let web_root: string;

function assert_non_null<T>(
    value: T,
    message = "expected non-null",
): asserts value is NonNullable<T> {
    expect(value, message).not.toBeNull();
}

function valid_ingest_body() {
    return {
        provider: "tavily",
        source_instance_id: "tavily-1",
        account_id: "default",
        account_label: "Tavily",
        metric_id: "tavily:monthly",
        raw_label: "monthly",
        normalized_label: "Monthly",
        window: "month",
        used: 100,
        limit: 1000,
        display_style: "ratio",
        reset_at: null,
        status: "normal",
        source: "wrapper",
    };
}

beforeEach(async () => {
    temp_dir = await mkdtemp(join(tmpdir(), "local-api-test-"));
    sync_store = create_observation_store(join(temp_dir, "test.db"));
    store = sync_store;
    token_stats_store = create_token_stats_store(":memory:");
    web_root = await mkdtemp(join(tmpdir(), "local-api-web-"));
    await writeFile(join(web_root, "index.html"), "<html>web panel</html>");
    config_deps = {
        configStore: {
            load: () =>
                Promise.resolve({
                    schemaVersion: 1,
                    language: "zh-Hans",
                    plugins: [{ instanceId: "inst-1" }] as never[],
                    launchAtLogin: false,
                }),
            save: () => Promise.resolve(),
            scheduleSave: () => undefined,
            flushPendingSave: () => Promise.resolve(),
            hasPendingSave: () => false,
            prune_unhealthy_plugins: () =>
                Promise.resolve({
                    schemaVersion: 1,
                    language: "zh-Hans",
                    plugins: [{ instanceId: "inst-1" }] as never[],
                    launchAtLogin: false,
                }),
        },
        secretsStore: {
            get: () => Promise.resolve("sk-plain"),
            set: () => Promise.resolve(),
            delete: () => Promise.resolve(),
            exportAll: () => Promise.resolve({}),
            importAll: () => Promise.resolve(),
        },
        secretParamKeys: new Map([["inst-1", new Set(["apiKey"])]]),
    };
    runtime_store = createRuntimeStore();
    connector_deps = {
        configStore: config_deps.configStore,
        runtimeStore: runtime_store,
        refreshService: {
            refresh: () => Promise.resolve(),
            refreshAll: () => Promise.resolve(),
        },
        definitions: [],
    };
    api = create_local_api_server(store, {
        port: 0,
        token_stats_store,
        config_deps,
        connector_deps,
        web_root,
    });
});

afterEach(async () => {
    await api.stop();
    store.close();
    token_stats_store.close();
    await rm(web_root, { recursive: true, force: true });
    await rm(temp_dir, { recursive: true, force: true });
});

describe("local-api", () => {
    it("health endpoint works without auth", async () => {
        await api.start();
        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/health`);
        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toMatchObject({ status: "ok" });
    });

    it("ingest rejects without auth", async () => {
        await api.start();
        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/ingest`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(valid_ingest_body()),
        });
        expect(res.status).toBe(401);
    });

    it("ingest accepts valid observation", async () => {
        await api.start();
        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/ingest`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${api.get_token()}`,
            },
            body: JSON.stringify(valid_ingest_body()),
        });
        expect(res.status).toBe(200);

        const stored = sync_store.get_latest("tavily", "default", "tavily:monthly", "tavily-1");
        assert_non_null(stored);
        expect(stored.used).toBe(100);
        expect(stored.stale).toBe(false);
        expect(stored.last_error).toBeNull();
    });

    it("ingest rejects invalid JSON", async () => {
        await api.start();
        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/ingest`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${api.get_token()}`,
            },
            body: "{",
        });
        expect(res.status).toBe(400);
    });

    it("ingest rejects oversized body", async () => {
        await api.start();
        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/ingest`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${api.get_token()}`,
            },
            body: "x".repeat(1024 * 1024 + 1),
        });
        expect(res.status).toBe(413);
    });

    it("ingest rejects invalid body", async () => {
        await api.start();
        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/ingest`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${api.get_token()}`,
            },
            body: JSON.stringify({ provider: "" }),
        });
        expect(res.status).toBe(400);
    });

    it("returns 404 for unknown authenticated routes", async () => {
        await api.start();
        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/missing`, {
            headers: { Authorization: `Bearer ${api.get_token()}` },
        });
        expect(res.status).toBe(404);
    });

    it("falls back to random port when requested port is occupied", async () => {
        const occupied = createServer((_, res) => {
            res.end("occupied");
        });
        const occupied_port = await new Promise<number>((resolve) => {
            occupied.listen(0, "0.0.0.0", () => {
                const addr = occupied.address();
                if (addr && typeof addr === "object") resolve(addr.port);
            });
        });

        await api.stop();
        api = create_local_api_server(store, { port: occupied_port });
        const started = await api.start();
        expect(started.port).not.toBe(occupied_port);
        expect(started.port).toBeGreaterThan(0);

        await new Promise<void>((resolve) => {
            occupied.close(() => {
                resolve();
            });
        });
    });
});

describe("local-api web read endpoints", () => {
    it("GET /v1/dashboard returns one bounded DTO without auth", async () => {
        const start = Date.now() - 3600000;
        const end = Date.now() + 1000;
        token_stats_store.upsert_records([
            {
                source: "claude_code",
                env: "win",
                session_id: "dashboard-session",
                title: "Dashboard",
                directory: "/project",
                slug: null,
                version: null,
                parent_session_id: null,
                message_id: "dashboard-message",
                role: "assistant",
                timestamp: start + 1000,
                model: "sonnet",
                input_tokens: 10,
                output_tokens: 1,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                agent: "claude-code",
            },
        ]);

        await api.start();
        const params = new URLSearchParams({
            agent: "all",
            platform: "all",
            start: String(start),
            end: String(end),
            metric: "tokens",
            xaxis: "time",
            gran: "hour",
        });
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/dashboard?${params.toString()}`,
        );
        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toMatchObject({
            current: { tokens: 11, sessions: 1, calls: 1 },
            sessions: { total: 1, has_more: false },
            freshness: { stale: false },
        });
    });

    it("GET /v1/dashboard routes through the isolated dispatcher when provided (AC2)", async () => {
        const dispatcher = {
            request_dashboard: vi.fn(),
            is_running: vi.fn(() => false),
            stop: vi.fn(),
        };
        api = create_local_api_server(store, {
            port: 0,
            token_stats_store,
            token_stats_running: () => false,
            token_stats_query_dispatcher: dispatcher,
            config_deps,
            connector_deps,
            web_root,
        });
        const start = Date.now() - 3600000;
        const end = Date.now() + 1000;
        const params = new URLSearchParams({
            agent: "all",
            platform: "all",
            start: String(start),
            end: String(end),
            metric: "tokens",
            xaxis: "time",
            gran: "hour",
        });
        const expected_dto = {
            query: {
                agent: "all",
                platform: "all",
                start,
                end,
                metric: "tokens",
                xaxis: "time",
                gran: "hour",
            },
            current: {
                tokens: 0,
                sessions: 0,
                calls: 0,
                input_tokens: 0,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                agent_totals: [],
                model_token_totals: [],
                model_call_totals: [],
                project_session_totals: [],
            },
            previous: {
                tokens: 0,
                sessions: 0,
                calls: 0,
                input_tokens: 0,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                agent_totals: [],
                model_token_totals: [],
                model_call_totals: [],
                project_session_totals: [],
            },
            chart_data: {
                axis: { labels: [], bucket_starts: [] },
                metric_buckets: [],
                session_buckets: [],
                rollup: [],
            },
            heatmap: [],
            models: [],
            sessions: { items: [], total: 0, has_more: false },
            status: { running: false, last_updated: null },
            freshness: { queried_at: 3, stale: false },
            data_version: 0,
        };
        dispatcher.request_dashboard.mockResolvedValue(expected_dto);
        await api.start();
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/dashboard?${params.toString()}`,
        );
        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toEqual(expected_dto);
        expect(dispatcher.request_dashboard).toHaveBeenCalledWith(
            expect.objectContaining({ agent: "all", xaxis: "time" }),
            expect.objectContaining({ running: false }),
        );
    });

    it("GET /v1/dashboard forwards an optional model filter (t204)", async () => {
        const dispatcher = {
            request_dashboard: vi.fn(),
            is_running: vi.fn(() => false),
            stop: vi.fn(),
        };
        api = create_local_api_server(store, {
            port: 0,
            token_stats_store,
            token_stats_running: () => false,
            token_stats_query_dispatcher: dispatcher,
            config_deps,
            connector_deps,
            web_root,
        });
        const expected_dto = {
            query: {
                agent: "all",
                platform: "all",
                start: 1,
                end: 2,
                metric: "tokens",
                xaxis: "time",
                gran: "hour",
                model: "sonnet",
            },
            current: {
                tokens: 0,
                sessions: 0,
                calls: 0,
                input_tokens: 0,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                agent_totals: [],
                model_token_totals: [],
                model_call_totals: [],
                project_session_totals: [],
            },
            previous: {
                tokens: 0,
                sessions: 0,
                calls: 0,
                input_tokens: 0,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                agent_totals: [],
                model_token_totals: [],
                model_call_totals: [],
                project_session_totals: [],
            },
            chart_data: {
                axis: { labels: [], bucket_starts: [] },
                metric_buckets: [],
                session_buckets: [],
                rollup: [],
            },
            heatmap: [],
            models: ["sonnet"],
            sessions: { items: [], total: 0, has_more: false },
            status: { running: false, last_updated: null },
            freshness: { queried_at: 3, stale: false },
            data_version: 0,
        };
        dispatcher.request_dashboard.mockResolvedValue(expected_dto);
        await api.start();
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/dashboard?agent=all&platform=all&start=1&end=2&metric=tokens&xaxis=time&gran=hour&model=sonnet`,
        );
        expect(res.status).toBe(200);
        expect(dispatcher.request_dashboard).toHaveBeenCalledWith(
            expect.objectContaining({ model: "sonnet" }),
            expect.anything(),
        );
    });

    it("GET /v1/dashboard rejects an invalid query", async () => {
        await api.start();
        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/dashboard`);
        expect(res.status).toBe(400);
    });

    it("GET /v1/dashboard applies alias and session pagination query params", async () => {
        const start = Date.now() - 3600000;
        const end = Date.now() + 1000;
        token_stats_store.upsert_records([
            {
                source: "claude_code",
                env: "win",
                session_id: "alias-session",
                title: "Dashboard",
                directory: "/project",
                slug: null,
                version: null,
                parent_session_id: null,
                message_id: "alias-message",
                role: "assistant",
                timestamp: start + 1000,
                model: "sonnet",
                input_tokens: 10,
                output_tokens: 1,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                agent: "claude-code",
            },
        ]);

        await api.start();
        const params = new URLSearchParams({
            agent: "all",
            platform: "all",
            start: String(start),
            end: String(end),
            metric: "tokens",
            xaxis: "time",
            gran: "hour",
            session_offset: "100",
        });
        params.set("model_aliases", JSON.stringify([{ alias: "X", keys: ["sonnet"] }]));
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/dashboard?${params.toString()}`,
        );
        expect(res.status).toBe(200);
        const data = (await res.json()) as {
            current: { model_token_totals: { key: string; value: number }[] };
            query: { session_offset: number };
        };
        expect(data.current.model_token_totals).toContainEqual({ key: "X", value: 11 });
        expect(data.query.session_offset).toBe(100);
    });

    it("GET /v1/dashboard rejects malformed alias JSON", async () => {
        await api.start();
        const params = new URLSearchParams({
            agent: "all",
            platform: "all",
            start: "1",
            end: "2",
            metric: "tokens",
            xaxis: "time",
            gran: "hour",
        });
        params.set("model_aliases", "{bad");
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/dashboard?${params.toString()}`,
        );
        expect(res.status).toBe(400);
    });

    it("GET /v1/records returns records without auth", async () => {
        token_stats_store.upsert_records([
            {
                source: "claude_code",
                env: "win",
                session_id: "s1",
                title: null,
                directory: null,
                slug: null,
                version: null,
                parent_session_id: null,
                message_id: "m1",
                role: "assistant",
                timestamp: Date.now(),
                model: "sonnet",
                input_tokens: 10,
                output_tokens: 1,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                agent: "claude-code",
            },
        ]);
        await api.start();
        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/records`);
        expect(res.status).toBe(200);
        const data = (await res.json()) as unknown[];
        expect(data).toHaveLength(1);
        expect(data[0]).toMatchObject({ message_id: "m1", agent: "claude-code" });
    });

    it("GET /v1/heatmap returns weekday×hour aggregate cells without auth", async () => {
        // 2026-07-06 09:00 UTC+8 = Monday (strftime %w=1), hour 9.
        const ts = Date.parse("2026-07-06T09:00:00+08:00");
        token_stats_store.upsert_records([
            {
                source: "claude_code",
                env: "win",
                session_id: "s1",
                title: null,
                directory: null,
                slug: null,
                version: null,
                parent_session_id: null,
                message_id: "m1",
                role: "assistant",
                timestamp: ts,
                model: "sonnet",
                input_tokens: 10,
                output_tokens: 1,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                agent: "claude-code",
            },
        ]);
        await api.start();
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/heatmap?env=win&start=${String(
                ts - 1,
            )}&end=${String(ts + 1)}`,
        );
        expect(res.status).toBe(200);
        const data = (await res.json()) as {
            weekday: number;
            hour: number;
            calls: number;
            tokens: number;
        }[];
        expect(data).toHaveLength(1);
        expect(data[0]).toMatchObject({ weekday: 1, hour: 9, calls: 1, tokens: 11 });
    });

    it("GET /v1/hourBuckets returns hour×model aggregates without auth (t173)", async () => {
        // 2026-07-06 09:00 UTC+8 is an exact local whole hour.
        const ts = Date.parse("2026-07-06T09:00:00+08:00");
        token_stats_store.upsert_records([
            {
                source: "claude_code",
                env: "win",
                session_id: "s1",
                title: null,
                directory: null,
                slug: null,
                version: null,
                parent_session_id: null,
                message_id: "m1",
                role: "assistant",
                timestamp: ts,
                model: "sonnet",
                input_tokens: 10,
                output_tokens: 1,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                agent: "claude-code",
            },
        ]);
        await api.start();
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/hourBuckets?env=win&start=${String(
                ts - 1,
            )}&end=${String(ts + 1)}`,
        );
        expect(res.status).toBe(200);
        const data = (await res.json()) as {
            hour_start: number;
            model: string;
            calls: number;
            sessions: number;
            tokens: number;
        }[];
        expect(data).toHaveLength(1);
        expect(data[0]).toMatchObject({
            hour_start: ts,
            model: "sonnet",
            calls: 1,
            sessions: 1,
            tokens: 11,
        });
    });

    it("GET /v1/{dashboard/sessions,heatmap,hourBuckets,rollup} forward model to the store (t206 AC3)", async () => {
        await api.start();
        const base = `http://127.0.0.1:${String(api.get_port())}`;
        // sessions requires agent+platform; the other three accept them too.
        const win = `agent=all&platform=all&start=1&end=2&model=sonnet`;

        const sessions_spy = vi.spyOn(token_stats_store, "query_dashboard_sessions");
        const res_sess = await fetch(`${base}/v1/dashboard/sessions?${win}`);
        expect(res_sess.status).toBe(200);
        expect(sessions_spy).toHaveBeenCalledWith(expect.objectContaining({ model: "sonnet" }));

        const heat_spy = vi.spyOn(token_stats_store, "query_heatmap");
        const res_heat = await fetch(`${base}/v1/heatmap?${win}`);
        expect(res_heat.status).toBe(200);
        expect(heat_spy).toHaveBeenCalledWith(expect.objectContaining({ model: "sonnet" }));

        const hour_spy = vi.spyOn(token_stats_store, "query_hour_buckets");
        const res_hour = await fetch(`${base}/v1/hourBuckets?${win}`);
        expect(res_hour.status).toBe(200);
        expect(hour_spy).toHaveBeenCalledWith(expect.objectContaining({ model: "sonnet" }));

        const rollup_spy = vi.spyOn(token_stats_store, "query_range_rollup");
        const res_roll = await fetch(`${base}/v1/rollup?${win}`);
        expect(res_roll.status).toBe(200);
        expect(rollup_spy).toHaveBeenCalledWith(expect.objectContaining({ model: "sonnet" }));
    });

    it("web read endpoints do not require bearer auth", async () => {
        await api.start();
        for (const path of [
            "/v1/records",
            "/v1/sessions",
            "/v1/buckets",
            "/v1/heatmap",
            "/v1/hourBuckets",
            "/v1/status",
        ]) {
            const res = await fetch(`http://127.0.0.1:${String(api.get_port())}${path}`);
            expect(res.status, path).toBe(200);
        }
    });

    it("GET /v1/config returns config without auth", async () => {
        await api.start();
        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/config`);
        expect(res.status).toBe(200);
        const data = (await res.json()) as { config: { language: string } };
        expect(data.config.language).toBe("zh-Hans");
    });

    it("GET /v1/secrets returns plaintext secret without auth", async () => {
        await api.start();
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/secrets?instanceId=inst-1`,
        );
        expect(res.status).toBe(200);
        const data = (await res.json()) as Record<string, string>;
        expect(data["apiKey"]).toBe("sk-plain");
    });

    it("GET / serves the web index.html without auth", async () => {
        await api.start();
        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/`);
        expect(res.status).toBe(200);
        expect(await res.text()).toContain("web panel");
    });

    it("GET /v1/connectors returns list without auth", async () => {
        await api.start();
        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/connectors`);
        expect(res.status).toBe(200);
        const data = (await res.json()) as unknown[];
        expect(Array.isArray(data)).toBe(true);
    });

    it("GET /v1/trend requires sourceInstanceId (t214)", async () => {
        await api.start();
        const url = `http://127.0.0.1:${String(api.get_port())}/v1/trend?provider=tavily&accountId=tavily&metricId=tavily:total-month`;
        const res = await fetch(url);
        expect(res.status).toBe(400);
    });

    it("GET /v1/trend filters by source_instance_id (t214 multi-account isolation)", async () => {
        // 同 (provider, account_id, metric_id) 双实例，web 端点按实例过滤
        const now = Date.now();
        const base = {
            provider: "tavily",
            account_id: "tavily",
            metric_id: "tavily:total-month",
            raw_label: "total-month",
            normalized_label: "月用量",
            account_label: "Tavily",
            window: "month" as const,
            cycleDurationMs: 30 * 24 * 3_600_000,
            display_style: "ratio" as const,
            reset_at: null,
            status: "normal" as const,
            source: "poll" as const,
            stale: false,
            last_error: null,
        };
        store.insert({
            ...base,
            source_instance_id: "inst-a",
            used: 100,
            limit: 1000,
            observed_at: now,
        });
        store.insert({
            ...base,
            source_instance_id: "inst-b",
            used: 500,
            limit: 1000,
            observed_at: now,
        });

        await api.start();
        const base_url = `http://127.0.0.1:${String(api.get_port())}/v1/trend`;
        const res_a = await fetch(
            `${base_url}?provider=tavily&accountId=tavily&metricId=tavily:total-month&sourceInstanceId=inst-a`,
        );
        expect(res_a.status).toBe(200);
        const series_a = (await res_a.json()) as ({ percent: number } | null)[];
        const points_a = series_a.filter((p) => p !== null);
        expect(points_a.length).toBe(1);
        // inst-a: used 100/1000 = 10%
        expect(points_a[0]?.percent).toBe(10);

        const res_b = await fetch(
            `${base_url}?provider=tavily&accountId=tavily&metricId=tavily:total-month&sourceInstanceId=inst-b`,
        );
        const series_b = (await res_b.json()) as ({ percent: number } | null)[];
        const points_b = series_b.filter((p) => p !== null);
        // inst-b: used 500/1000 = 50%，不串 inst-a 的 10%
        expect(points_b[0]?.percent).toBe(50);
    });
});

describe("local-api session history endpoints (t259)", () => {
    let session_home: string;

    function make_session_row(overrides: Partial<SessionRow> = {}): SessionRow {
        return {
            id: "sess-1",
            source: "claude_code",
            env: "win",
            title: "Test Session",
            model: null,
            started_at: 0,
            ended_at: 1000,
            session: {
                id: "sess-1",
                source: "claude_code",
                env: "win",
                model: "sonnet",
                title: "Test Session",
                directory: "/proj",
                input_tokens: 100,
                output_tokens: 50,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                calls: 3,
                started_at: 0,
                ended_at: 1000,
            },
            ...overrides,
        };
    }

    function base_session_service() {
        return {
            query: vi.fn(
                (): QueryResult => ({
                    messages: [{ id: "m1", role: "user" as const, text: "hello", timestamp: 100 }],
                    next_cursor: null,
                }),
            ),
            searchContent: vi.fn(() => Promise.resolve(new Set(["claude_code|win|sess-1"]))),
            searchContentWithAbort: vi.fn<
                (locs: unknown[], keyword: string, abortSignal: AbortSignal) => Promise<Set<string>>
            >(() => Promise.resolve(new Set(["claude_code|win|sess-1"]))),
            summaries: vi.fn(() => Promise.resolve({ "claude_code|win|sess-1": "hello world" })),
        };
    }

    beforeEach(async () => {
        clear_resolution_cache();
        session_home = await mkdtemp(join(tmpdir(), "session-history-home-"));
        await mkdir(join(session_home, ".claude", "projects"), { recursive: true });
        // claude_code 快速路径：文件名 === session_id.jsonl。
        await writeFile(
            join(session_home, ".claude", "projects", "sess-1.jsonl"),
            '{"sessionId":"sess-1"}\n',
        );
    });

    afterEach(async () => {
        await api.stop();
        await rm(session_home, { recursive: true, force: true });
        clear_resolution_cache();
    });

    function setup_session_api(
        service: ReturnType<typeof base_session_service>,
        provider: SessionsProvider,
    ): void {
        api = create_local_api_server(store, {
            port: 0,
            token_stats_store,
            config_deps,
            connector_deps,
            web_root,
            session_history_deps: {
                service: service as unknown as SessionHistorySubscriptionService,
                sessions_provider: provider,
                locator_paths: {
                    win_home: session_home,
                    wsl_distro: "Ubuntu-22.04",
                    wsl_user: "",
                },
            },
        });
    }

    it("GET /v1/sessionHistory 带完整 source/env 返回消息 (t259 AC1)", async () => {
        const service = base_session_service();
        const provider: SessionsProvider = vi.fn(() => [make_session_row()]);
        setup_session_api(service, provider);
        await api.start();
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/sessionHistory?id=sess-1&source=claude_code&env=win&limit=10`,
        );
        expect(res.status).toBe(200);
        const data = (await res.json()) as { messages: unknown[]; next_cursor: unknown };
        expect(data.messages).toHaveLength(1);
        expect(data.messages[0]).toMatchObject({ id: "m1", role: "user", text: "hello" });
        expect(data.next_cursor).toBeNull();
        expect(service.query).toHaveBeenCalledWith(
            expect.objectContaining({ source: "claude_code", env: "win", session_id: "sess-1" }),
            expect.objectContaining({ limit: 10 }),
        );
    });

    it("GET /v1/sessionHistory 缺 source/env 返回 400，不再全量枚举 (t263)", async () => {
        const service = base_session_service();
        const provider: SessionsProvider = vi.fn(() => [make_session_row()]);
        setup_session_api(service, provider);
        await api.start();
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/sessionHistory?id=sess-1&limit=10`,
        );
        expect(res.status).toBe(400);
        // id-only 不再触发 sessions_provider 全量枚举反查。
        expect(provider).not.toHaveBeenCalled();
        expect(service.query).not.toHaveBeenCalled();
    });

    it("GET /v1/sessionHistory maps string before_cursor to a pagination cursor", async () => {
        const service = base_session_service();
        service.query.mockReturnValue({
            messages: [{ id: "m2", role: "assistant" as const, text: "prev", timestamp: 200 }],
            next_cursor: { kind: "pagination", end_index: 5 },
        });
        setup_session_api(
            service,
            vi.fn(() => [make_session_row()]),
        );
        await api.start();
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/sessionHistory?id=sess-1&source=claude_code&env=win&limit=10&before_cursor=20`,
        );
        expect(res.status).toBe(200);
        const data = (await res.json()) as { next_cursor: unknown };
        // HTTP 边界游标序列化为字符串（与 web query 的 before_cursor 编码一致）。
        expect(data.next_cursor).toBe("5");
        expect(service.query).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                limit: 10,
                before_cursor: { kind: "pagination", end_index: 20 },
            }),
        );
    });

    it("GET /v1/sessionHistory returns 400 when id is missing", async () => {
        setup_session_api(
            base_session_service(),
            vi.fn(() => []),
        );
        await api.start();
        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/sessionHistory`);
        expect(res.status).toBe(400);
    });

    it("GET /v1/sessionHistory returns 404 for an unresolvable session", async () => {
        setup_session_api(
            base_session_service(),
            vi.fn(() => []),
        );
        await api.start();
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/sessionHistory?id=missing&source=claude_code&env=win`,
        );
        expect(res.status).toBe(404);
    });

    it("POST /v1/sessionHistory/searchContent returns hits and sessions (t259 AC1)", async () => {
        const service = base_session_service();
        setup_session_api(
            service,
            vi.fn(() => [make_session_row()]),
        );
        await api.start();
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/sessionHistory/searchContent`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filters: { sources: ["claude_code"] }, keyword: "hello" }),
            },
        );
        expect(res.status).toBe(200);
        const data = (await res.json()) as {
            hits: string[];
            sessions: { id: string; source: string }[];
        };
        expect(data.hits).toEqual(["claude_code|win|sess-1"]);
        expect(data.sessions).toHaveLength(1);
        expect(data.sessions[0]).toMatchObject({ id: "sess-1", source: "claude_code" });
        expect(service.searchContentWithAbort).toHaveBeenCalledWith(
            [expect.objectContaining({ session_id: "sess-1" })],
            "hello",
            expect.any(AbortSignal),
        );
    });

    it("POST /v1/sessionHistory/searchContent 客户端断连时中止底层搜索 (t263)", async () => {
        const service = base_session_service();
        // 挂起搜索直到 abort signal 触发，模拟长时间扫盘。
        service.searchContentWithAbort.mockImplementation(
            (_locs: unknown[], _keyword: string, signal: AbortSignal) =>
                new Promise<Set<string>>((resolve) => {
                    signal.addEventListener("abort", () => {
                        resolve(new Set<string>());
                    });
                }),
        );
        setup_session_api(
            service,
            vi.fn(() => [make_session_row()]),
        );
        await api.start();

        const controller = new AbortController();
        const req = fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/sessionHistory/searchContent`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filters: { sources: ["claude_code"] }, keyword: "hello" }),
                signal: controller.signal,
            },
        );
        await vi.waitFor(() => {
            expect(service.searchContentWithAbort).toHaveBeenCalled();
        });
        // 客户端断连 → 服务端 res close → abort 底层扫描。
        controller.abort();
        const calls = service.searchContentWithAbort.mock.calls as unknown as [
            unknown[],
            string,
            AbortSignal,
        ][];
        const signal = calls[0]?.[2];
        await vi.waitFor(() => {
            expect(signal?.aborted).toBe(true);
        });
        await req.catch(() => {
            /* 客户端已 abort，fetch 拒绝符合预期 */
        });
    });

    it("POST /v1/sessionHistory/searchContent returns 400 for malformed bodies (t259 f001)", async () => {
        const service = base_session_service();
        setup_session_api(
            service,
            vi.fn(() => [make_session_row()]),
        );
        await api.start();
        const port = String(api.get_port());
        const bad_bodies: unknown[] = [
            { keyword: "x" }, // 缺 filters
            { filters: {}, keyword: 5 }, // keyword 非 string
            { filters: { sources: 5 }, keyword: "x" }, // sources 非数组
            { filters: { search: 5 }, keyword: "x" }, // search 非 string
            { locs: "str", keyword: "x" }, // legacy locs 非数组
            { locs: [{ source: "a" }], keyword: "x" }, // legacy loc 缺字段
        ];
        for (const body of bad_bodies) {
            const res = await fetch(`http://127.0.0.1:${port}/v1/sessionHistory/searchContent`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            expect(res.status).toBe(400);
        }
        expect(service.searchContent).not.toHaveBeenCalled();
    });

    it("POST /v1/sessionHistory/summaries returns 400 for non-array locs", async () => {
        const service = base_session_service();
        setup_session_api(
            service,
            vi.fn(() => []),
        );
        await api.start();
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/sessionHistory/summaries`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ locs: "nope" }),
            },
        );
        expect(res.status).toBe(400);
        // 畸形 loc 条目被跳过而非 500。
        const res2 = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/sessionHistory/summaries`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    locs: [null, { source: "claude_code", env: "win", session_id: "sess-1" }],
                }),
            },
        );
        expect(res2.status).toBe(200);
        expect(service.summaries).toHaveBeenCalled();
    });

    it("POST /v1/sessionHistory/searchContent supports legacy locs form (t259 f002)", async () => {
        const service = base_session_service();
        setup_session_api(
            service,
            vi.fn(() => [make_session_row()]),
        );
        await api.start();
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/sessionHistory/searchContent`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    locs: [{ source: "claude_code", env: "win", session_id: "sess-1" }],
                    keyword: "hello",
                }),
            },
        );
        expect(res.status).toBe(200);
        expect(service.searchContentWithAbort).toHaveBeenCalled();
    });

    it("POST /v1/sessionHistory/summaries returns per-loc summaries (t259 AC1)", async () => {
        const service = base_session_service();
        setup_session_api(
            service,
            vi.fn(() => []),
        );
        await api.start();
        const res = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/sessionHistory/summaries`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    locs: [
                        { source: "claude_code", env: "win", session_id: "sess-1" },
                        { source: "claude_code", env: "win", session_id: "missing" },
                    ],
                }),
            },
        );
        expect(res.status).toBe(200);
        const data = (await res.json()) as { summaries: Record<string, string> };
        expect(data.summaries).toEqual({ "claude_code|win|sess-1": "hello world" });
        expect(service.summaries).toHaveBeenCalledWith([
            expect.objectContaining({ session_id: "sess-1" }),
        ]);
    });
});

describe("local-api SSE events", () => {
    it("GET /v1/events streams state changes as text/event-stream", async () => {
        await api.start();
        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/events`);
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toContain("text/event-stream");
        const reader = res.body?.getReader();
        if (!reader) throw new Error("no response body");
        runtime_store.updateState("inst-sse-1", { status: "idle" });
        const { value } = await reader.read();
        const text = new TextDecoder().decode(value);
        expect(text).toContain("data:");
        expect(text).toContain("inst-sse-1");
        await reader.cancel();
    });

    it("SSE connection unsubscribes on client disconnect", async () => {
        await api.start();
        let subscribe_count = 0;
        let unsub_count = 0;
        const real_subscribe = runtime_store.subscribe.bind(runtime_store);
        const spy = vi.spyOn(runtime_store, "subscribe").mockImplementation((listener) => {
            subscribe_count += 1;
            const unsub = real_subscribe(listener);
            return () => {
                unsub_count += 1;
                unsub();
            };
        });

        const res = await fetch(`http://127.0.0.1:${String(api.get_port())}/v1/events`);
        const reader = res.body?.getReader();
        if (!reader) throw new Error("no response body");
        runtime_store.updateState("inst-sse-1", { status: "idle" });
        await reader.read();
        expect(subscribe_count).toBeGreaterThanOrEqual(1);
        expect(unsub_count).toBe(0);

        await reader.cancel();
        await new Promise((resolve) => {
            setTimeout(resolve, 80);
        });
        // Every SSE subscription must be cleaned up on disconnect. cleanup may
        // fire more than once (req + res close) and undici may open >1 transport;
        // both are idempotent, so require every subscription to be unsubscribed
        // at least once — catches a missing-cleanup leak (unsub_count stays 0).
        expect(subscribe_count).toBeGreaterThanOrEqual(1);
        expect(unsub_count).toBeGreaterThanOrEqual(subscribe_count);
        spy.mockRestore();
    });
});
