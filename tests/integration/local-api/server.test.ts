import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { create_local_api_server } from "../../../src/main/core/local-api/server";
import { create_observation_store } from "../../../src/main/core/observation/observation-store";
import { create_token_stats_store } from "../../../src/main/core/token-stats/token-stats-store";
import type { LocalAPIServer } from "../../../src/main/core/local-api/server";
import type { ObservationStore } from "../../../src/main/core/observation/observation-store";
import type { TokenStatsStore } from "../../../src/main/core/token-stats/token-stats-store";
import type { ConfigIpcDeps } from "../../../src/main/ipc/config-ipc";

let temp_dir: string;
let sync_store: ObservationStore;
let store: ObservationStore;
let api: LocalAPIServer;
let token_stats_store: TokenStatsStore;
let config_deps: ConfigIpcDeps;

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
    api = create_local_api_server(store, { port: 0, token_stats_store, config_deps });
});

afterEach(async () => {
    await api.stop();
    store.close();
    token_stats_store.close();
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

    it("web read endpoints do not require bearer auth", async () => {
        await api.start();
        for (const path of ["/v1/records", "/v1/sessions", "/v1/buckets", "/v1/status"]) {
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
});
