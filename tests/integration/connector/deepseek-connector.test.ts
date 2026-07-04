import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run_connector } from "../../../src/main/core/connector/runtime";
import type { ConnectorContext } from "../../../src/main/core/connector/host-io";
import type { Manifest } from "../../../src/shared/schemas/manifest";

const manifest: Manifest = {
    id: "deepseek",
    provider: "deepseek",
    capabilities: ["poll"],
    parameters: [
        {
            name: "API_KEY",
            type: "secret",
            required: true,
            exposeToScript: true,
        },
        {
            name: "LIMIT",
            type: "number",
            required: false,
            exposeToScript: true,
            default: "100",
        },
    ],
    endpoints: { default: "https://api.deepseek.com" },
    poll: {
        request: { endpoint: "default", path: "/user/balance", method: "GET" },
        map: {},
    },
    script: "connector.ts",
};

function create_ctx(balance_infos: unknown[]): ConnectorContext {
    return {
        log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        http: {
            get_json(endpoint_key, path, opts) {
                expect(endpoint_key).toBe("default");
                expect(path).toBe("/user/balance");
                expect(opts?.headers?.["Authorization"]).toBe("Bearer test-key");
                return Promise.resolve({ balance_infos });
            },
            post_json: () => Promise.resolve({}),
            get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
        },
        files: { read: () => Promise.resolve(""), list: () => Promise.resolve([]) },
        params: { API_KEY: "test-key", LIMIT: "100" },
    };
}

describe("deepseek connector", () => {
    it("queries balance and maps to observations with correct status", async () => {
        const script = await readFile(join("connectors", "deepseek", "connector.ts"), "utf8");
        const result = await run_connector(
            manifest,
            script,
            create_ctx([
                { currency: "CNY", total_balance: "45.6" },
                { currency: "USD", total_balance: "12.3" },
            ]),
        );

        expect(result.error).toBeNull();
        expect(result.observations).toEqual([
            expect.objectContaining({
                provider: "deepseek",
                account_id: "deepseek",
                metric_id: "deepseek:balance-CNY",
                raw_label: "balance-CNY",
                normalized_label: "余额",
                used: 45.6,
                limit: 100,
                display_style: "ratio",
                status: "normal",
            }),
            expect.objectContaining({
                metric_id: "deepseek:balance-USD",
                raw_label: "balance-USD",
                normalized_label: "余额 (USD)",
                used: 12.3,
                status: "warning",
            }),
        ]);
    });

    it("returns warning status when balance ratio is between 0.1 and 0.2", async () => {
        const script = await readFile(join("connectors", "deepseek", "connector.ts"), "utf8");
        const result = await run_connector(
            manifest,
            script,
            create_ctx([{ currency: "CNY", total_balance: "15" }]),
        );

        expect(result.observations[0]?.status).toBe("warning");
    });

    it("returns normal status when balance ratio is above 0.4", async () => {
        const script = await readFile(join("connectors", "deepseek", "connector.ts"), "utf8");
        const result = await run_connector(
            manifest,
            script,
            create_ctx([{ currency: "CNY", total_balance: "80" }]),
        );

        expect(result.observations[0]?.status).toBe("normal");
    });

    it("throws when API returns error code", async () => {
        const script = await readFile(join("connectors", "deepseek", "connector.ts"), "utf8");
        const ctx: ConnectorContext = {
            log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
            http: {
                get_json: () => Promise.resolve({ code: 401, message: "Unauthorized" }),
                post_json: () => Promise.resolve({}),
                get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
            },
            files: { read: () => Promise.resolve(""), list: () => Promise.resolve([]) },
            params: { API_KEY: "test-key", LIMIT: "100" },
        };
        const result = await run_connector(manifest, script, ctx);

        expect(result.error).not.toBeNull();
        expect(result.error).toContain("Unauthorized");
        expect(result.observations).toEqual([]);
    });

    it("throws when API response lacks balance_infos", async () => {
        const script = await readFile(join("connectors", "deepseek", "connector.ts"), "utf8");
        const ctx: ConnectorContext = {
            log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
            http: {
                get_json: () => Promise.resolve({ error: "invalid key" }),
                post_json: () => Promise.resolve({}),
                get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
            },
            files: { read: () => Promise.resolve(""), list: () => Promise.resolve([]) },
            params: { API_KEY: "test-key", LIMIT: "100" },
        };
        const result = await run_connector(manifest, script, ctx);

        expect(result.error).not.toBeNull();
        expect(result.error).toContain("balance_infos");
        expect(result.observations).toEqual([]);
    });
});
