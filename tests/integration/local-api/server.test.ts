import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
