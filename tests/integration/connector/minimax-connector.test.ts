import { readFile } from "node:fs/promises";
import { ctx_status } from "./_ctx_status";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run_connector } from "../../../src/main/core/connector/runtime";
import type { ConnectorContext } from "../../../src/main/core/connector/host-io";
import type { Manifest } from "../../../src/shared/schemas/manifest";

const manifest: Manifest = {
    id: "minimax",
    provider: "minimax",
    capabilities: ["poll"],
    parameters: [
        {
            name: "API_KEY",
            type: "secret",
            required: true,
            exposeToScript: true,
        },
    ],
    endpoints: { default: "https://www.minimaxi.com" },
    poll: {
        request: { endpoint: "default", path: "/v1/token_plan/remains", method: "GET" },
        map: {},
    },
    script: "connector.ts",
};

function create_ctx(model_remains: unknown[], base_resp?: unknown): ConnectorContext {
    return {
        log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        http: {
            get_json(endpoint_key, path, opts) {
                expect(endpoint_key).toBe("default");
                expect(path).toBe("/v1/token_plan/remains");
                expect(opts?.headers?.["Authorization"]).toBe("Bearer test-key");
                return Promise.resolve({
                    base_resp: base_resp ?? { status_code: 0 },
                    model_remains,
                });
            },
            post_json: () => Promise.resolve({}),
            get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
        },
        files: { read: () => Promise.resolve(""), list: () => Promise.resolve([]) },
        params: { API_KEY: "test-key" },
        status: ctx_status,
        report_failed_account: () => undefined,
    };
}

describe("minimax connector", () => {
    it("maps model remains into interval + weekly observations sorted by model and period", async () => {
        const script = await readFile(join("connectors", "minimax", "connector.ts"), "utf8");
        const result = await run_connector(
            manifest,
            script,
            create_ctx([
                {
                    model_name: "MiniMax-M*",
                    start_time: 1000,
                    end_time: 1000 + 4 * 3600 * 1000,
                    current_interval_total_count: 100,
                    current_interval_usage_count: 40,
                    remains_time: 3600_000,
                    weekly_start_time: 1000,
                    weekly_end_time: 1000 + 7 * 24 * 3600 * 1000,
                    current_weekly_total_count: 700,
                    current_weekly_usage_count: 200,
                    weekly_remains_time: 86400_000,
                },
                {
                    model_name: "image-01",
                    start_time: 1000,
                    end_time: 1000 + 24 * 3600 * 1000,
                    current_interval_total_count: 50,
                    current_interval_usage_count: 10,
                    remains_time: 3600_000,
                },
            ]),
        );

        expect(result.error).toBeNull();
        const ids = result.observations.map((o) => o.metric_id);
        expect(ids).toContain("minimax:minimax-m*-interval");
        expect(ids).toContain("minimax:minimax-m*-week");
        expect(ids).toContain("minimax:image-01-interval");

        const text_interval = result.observations.find(
            (o) => o.metric_id === "minimax:minimax-m*-interval",
        );
        expect(text_interval).toEqual(
            expect.objectContaining({
                raw_label: "minimax-m*-interval",
                normalized_label: "文本 (5小时)",
                used: 40,
                limit: 100,
                display_style: "ratio",
            }),
        );
        expect(text_interval?.reset_at).not.toBeNull();
        // cycleDurationMs = end_time - start_time（4h，非剩余）
        expect(text_interval?.cycleDurationMs).toBe(4 * 3600 * 1000);
    });

    it("cycleDurationMs clamps negative end-start to 0", async () => {
        const script = await readFile(join("connectors", "minimax", "connector.ts"), "utf8");
        const result = await run_connector(
            manifest,
            script,
            create_ctx([
                {
                    model_name: "MiniMax-M*",
                    start_time: 2000,
                    end_time: 1000, // end < start -> 负值
                    current_interval_total_count: 100,
                    current_interval_usage_count: 40,
                    remains_time: 3600_000,
                },
            ]),
        );
        const interval = result.observations.find(
            (o) => o.metric_id === "minimax:minimax-m*-interval",
        );
        expect(interval?.cycleDurationMs).toBe(0);
    });

    it("throws when base_resp status_code is non-zero", async () => {
        const script = await readFile(join("connectors", "minimax", "connector.ts"), "utf8");
        const result = await run_connector(
            manifest,
            script,
            create_ctx([], { status_code: 2049, status_msg: "invalid api key" }),
        );

        expect(result.error).not.toBeNull();
        expect(result.observations).toEqual([]);
    });

    it("reports failed_account when model_remains empty", async () => {
        const script = await readFile(join("connectors", "minimax", "connector.ts"), "utf8");
        const result = await run_connector(manifest, script, create_ctx([]));

        expect(result.observations).toEqual([]);
        expect(result.failed_accounts).toHaveLength(1);
        expect(result.failed_accounts[0]?.provider).toBe("minimax");
    });

    it("returns null reset_at when remains_time would produce a reset over 1 year away", async () => {
        const script = await readFile(join("connectors", "minimax", "connector.ts"), "utf8");
        // 400 days in milliseconds — exceeds 1-year sanity threshold
        const huge_remains = 400 * 24 * 3600 * 1000;
        const result = await run_connector(
            manifest,
            script,
            create_ctx([
                {
                    model_name: "MiniMax-M*",
                    start_time: 1000,
                    end_time: 1000 + 4 * 3600 * 1000,
                    current_interval_total_count: 100,
                    current_interval_usage_count: 40,
                    remains_time: huge_remains,
                },
            ]),
        );

        expect(result.error).toBeNull();
        const obs = result.observations.find((o) => o.metric_id === "minimax:minimax-m*-interval");
        expect(obs).toBeDefined();
        expect(obs?.reset_at).toBeNull();
    });

    it("returns empty when no model_remains provided", async () => {
        const script = await readFile(join("connectors", "minimax", "connector.ts"), "utf8");
        const result = await run_connector(manifest, script, create_ctx([]));

        expect(result.error).toBeNull();
        expect(result.observations).toEqual([]);
    });
});
