import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run_connector } from "../../../src/main/core/connector/runtime";
import type { ConnectorContext } from "../../../src/main/core/connector/host-io";
import type { Manifest } from "../../../src/shared/schemas/manifest";
import { manifest_schema } from "../../../src/shared/schemas/manifest";

const manifest_path = join("connectors", "kimi", "manifest.json");

function create_ctx(overrides?: Partial<ConnectorContext>): ConnectorContext {
    return {
        log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        http: {
            get_json: vi.fn().mockResolvedValue({
                usage: {
                    limit: "100",
                    used: "10",
                    remaining: "90",
                    resetTime: "2099-01-01T00:00:00Z",
                },
                limits: [
                    {
                        window: { duration: 300 },
                        detail: {
                            limit: "100",
                            used: "5",
                            remaining: "95",
                            resetTime: "2099-01-01T00:00:00Z",
                        },
                    },
                ],
            }),
            post_json: vi.fn().mockResolvedValue({}),
            get_raw: vi.fn().mockResolvedValue({ status: 200, headers: {}, body: "" }),
        },
        files: { read: () => Promise.resolve(""), list: () => Promise.resolve([]) },
        params: { API_KEY: "sk-kimi-test-key" },
        report_failed_account: () => undefined,
        ...overrides,
    };
}

describe("kimi connector", () => {
    it("manifest passes schema validation", async () => {
        const raw = JSON.parse(await readFile(manifest_path, "utf8")) as unknown;
        const result = manifest_schema.safeParse(raw);
        expect(result.success).toBe(true);
    });

    it("manifest declares provider as kimi", async () => {
        const raw = JSON.parse(await readFile(manifest_path, "utf8")) as Manifest;
        expect(raw.provider).toBe("kimi");
    });

    it("manifest declares poll capability", async () => {
        const raw = JSON.parse(await readFile(manifest_path, "utf8")) as Manifest;
        expect(raw.capabilities).toContain("poll");
    });

    it("manifest declares API_KEY parameter", async () => {
        const raw = JSON.parse(await readFile(manifest_path, "utf8")) as Manifest;
        const api_key_param = raw.parameters.find((p) => p.name === "API_KEY");
        expect(api_key_param).toBeDefined();
        expect(api_key_param?.type).toBe("secret");
        expect(api_key_param?.required).toBe(true);
    });

    it("connector script returns weekly and five_hour observations", async () => {
        const script = await readFile(join("connectors", "kimi", "connector.ts"), "utf8");
        const raw = JSON.parse(await readFile(manifest_path, "utf8")) as Manifest;
        const result = await run_connector(raw, script, create_ctx());
        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(2);
        const [weekly, five_hour] = result.observations;
        expect(weekly?.metric_id).toBe("kimi:weekly");
        expect(weekly?.used).toBe(10);
        expect(weekly?.limit).toBe(100);
        expect(five_hour?.metric_id).toBe("kimi:five_hour");
        expect(five_hour?.used).toBe(5);
        expect(five_hour?.limit).toBe(100);
    });

    it("cycleDurationMs is fixed full-period (not remaining to reset)", async () => {
        const script = await readFile(join("connectors", "kimi", "connector.ts"), "utf8");
        const raw = JSON.parse(await readFile(manifest_path, "utf8")) as Manifest;
        const result = await run_connector(raw, script, create_ctx());
        const [weekly, five_hour] = result.observations;
        // weekly = 7d（固定周期，非 reset_at - now）
        expect(weekly?.cycleDurationMs).toBe(7 * 24 * 60 * 60 * 1000);
        // 5h = 5h
        expect(five_hour?.cycleDurationMs).toBe(5 * 60 * 60 * 1000);
    });

    it("connector script uses Bearer auth header", async () => {
        const script = await readFile(join("connectors", "kimi", "connector.ts"), "utf8");
        const raw = JSON.parse(await readFile(manifest_path, "utf8")) as Manifest;
        const http_get_json = vi.fn().mockResolvedValue({
            usage: { limit: "100", used: "10", remaining: "90", resetTime: "2099-01-01T00:00:00Z" },
            limits: [
                {
                    window: { duration: 300 },
                    detail: {
                        limit: "100",
                        used: "5",
                        remaining: "95",
                        resetTime: "2099-01-01T00:00:00Z",
                    },
                },
            ],
        });
        const ctx = create_ctx({
            http: { get_json: http_get_json, post_json: vi.fn(), get_raw: vi.fn() },
        });
        await run_connector(raw, script, ctx);
        expect(http_get_json).toHaveBeenCalled();
        const [endpoint_key, path, opts] = http_get_json.mock.calls[0] as [
            string,
            string,
            { headers: Record<string, string> },
        ];
        expect(endpoint_key).toBe("default");
        expect(path).toBe("coding/v1/usages");
        expect(opts.headers["Authorization"]).toBe("Bearer sk-kimi-test-key");
        expect(opts.headers["User-Agent"]).toBe("KimiCLI/1.6");
    });

    it("connector script throws on missing API_KEY", async () => {
        const script = await readFile(join("connectors", "kimi", "connector.ts"), "utf8");
        const raw = JSON.parse(await readFile(manifest_path, "utf8")) as Manifest;
        const result = await run_connector(raw, script, create_ctx({ params: {} }));
        expect(result.error).toBeTruthy();
    });
});
