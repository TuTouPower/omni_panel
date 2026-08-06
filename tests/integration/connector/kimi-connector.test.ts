import { readFile } from "node:fs/promises";
import { ctx_status } from "./_ctx_status";
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
        status: ctx_status,
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

    it("manifest declares OAUTH_TOKEN and optional API_KEY parameters", async () => {
        const raw = JSON.parse(await readFile(manifest_path, "utf8")) as Manifest;
        const oauth_param = raw.parameters.find((p) => p.name === "OAUTH_TOKEN");
        expect(oauth_param).toBeDefined();
        expect(oauth_param?.type).toBe("secret");
        expect(oauth_param?.exposeToScript).toBe(true);
        const api_key_param = raw.parameters.find((p) => p.name === "API_KEY");
        expect(api_key_param).toBeDefined();
        expect(api_key_param?.type).toBe("secret");
        // API_KEY is an optional fallback now that OAuth device-code login exists.
        expect(api_key_param?.required).toBe(false);
        expect(api_key_param?.exposeToScript).toBe(true);
    });

    it("manifest declares oauth_device auth descriptor", async () => {
        const raw = JSON.parse(await readFile(manifest_path, "utf8")) as Manifest;
        expect(raw.auth?.method).toBe("oauth_device");
        expect(raw.auth?.secret_name).toBe("OAUTH_TOKEN");
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

    it("connector prefers OAUTH_TOKEN over API_KEY when both present", async () => {
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
            params: { OAUTH_TOKEN: "oauth-token-xyz", API_KEY: "sk-kimi-test-key" },
        });
        await run_connector(raw, script, ctx);
        const [, , opts] = http_get_json.mock.calls[0] as [
            string,
            string,
            { headers: Record<string, string> },
        ];
        // OAuth token wins over API key.
        expect(opts.headers["Authorization"]).toBe("Bearer oauth-token-xyz");
    });

    it("connector succeeds with OAUTH_TOKEN only (no API_KEY)", async () => {
        const script = await readFile(join("connectors", "kimi", "connector.ts"), "utf8");
        const raw = JSON.parse(await readFile(manifest_path, "utf8")) as Manifest;
        const result = await run_connector(
            raw,
            script,
            create_ctx({ params: { OAUTH_TOKEN: "oauth-only-token" } }),
        );
        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(2);
    });

    it("parses boosterWallet balance as yuan when status is active", async () => {
        const script = await readFile(join("connectors", "kimi", "connector.ts"), "utf8");
        const raw = JSON.parse(await readFile(manifest_path, "utf8")) as Manifest;
        const ctx = create_ctx({
            http: {
                get_json: vi.fn().mockResolvedValue({
                    usage: {
                        limit: "100",
                        used: "10",
                        remaining: "90",
                        resetTime: "2099-01-01T00:00:00Z",
                    },
                    boosterWallet: {
                        status: "STATUS_ACTIVE",
                        balance: { amountLeft: "315250700" }, // 1e-8 yuan -> 3.152507
                    },
                }),
                post_json: vi.fn(),
                get_raw: vi.fn(),
            },
        });
        const result = await run_connector(raw, script, ctx);
        expect(result.error).toBeNull();
        const booster = result.observations.find((o) => o.metric_id === "kimi:booster_balance");
        expect(booster).toBeDefined();
        expect(booster?.display_style).toBe("ratio");
        // 315250700 / 1e8 = 3.152507, clamped >= 0
        expect(booster?.used).toBeCloseTo(3.152507, 5);
        expect(booster?.normalized_label).toBe("加油包余额");
    });

    it("reports booster balance as 0 when wallet is not enabled", async () => {
        const script = await readFile(join("connectors", "kimi", "connector.ts"), "utf8");
        const raw = JSON.parse(await readFile(manifest_path, "utf8")) as Manifest;
        const ctx = create_ctx({
            http: {
                get_json: vi.fn().mockResolvedValue({
                    usage: {
                        limit: "100",
                        used: "10",
                        remaining: "90",
                        resetTime: "2099-01-01T00:00:00Z",
                    },
                    boosterWallet: {
                        status: "STATUS_UNKNOWN",
                        // Misleading value (monthly limit - used), must be ignored.
                        balance: { amountLeft: "7500000000" }, // would be 75 yuan if trusted
                    },
                }),
                post_json: vi.fn(),
                get_raw: vi.fn(),
            },
        });
        const result = await run_connector(raw, script, ctx);
        const booster = result.observations.find((o) => o.metric_id === "kimi:booster_balance");
        expect(booster).toBeDefined();
        expect(booster?.used).toBe(0);
    });

    it("treats STATUS_ENABLED as active for booster balance", async () => {
        const script = await readFile(join("connectors", "kimi", "connector.ts"), "utf8");
        const raw = JSON.parse(await readFile(manifest_path, "utf8")) as Manifest;
        const ctx = create_ctx({
            http: {
                get_json: vi.fn().mockResolvedValue({
                    usage: {
                        limit: "100",
                        used: "10",
                        remaining: "90",
                        resetTime: "2099-01-01T00:00:00Z",
                    },
                    boosterWallet: {
                        status: "STATUS_ENABLED",
                        balance: { amountLeft: "500000000" }, // 1e-8 yuan -> 5
                    },
                }),
                post_json: vi.fn(),
                get_raw: vi.fn(),
            },
        });
        const result = await run_connector(raw, script, ctx);
        const booster = result.observations.find((o) => o.metric_id === "kimi:booster_balance");
        expect(booster).toBeDefined();
        expect(booster?.used).toBeCloseTo(5, 5);
    });

    it("status stays normal when limit is 0 (guarded against division by zero)", async () => {
        const script = await readFile(join("connectors", "kimi", "connector.ts"), "utf8");
        const raw = JSON.parse(await readFile(manifest_path, "utf8")) as Manifest;
        // used>0、limit=0：无 guard 时 (10/0)*100 = Infinity -> for_pct = "critical"，
        // guard 使其为 "normal"——测试具备判别力。
        const ctx = create_ctx({
            http: {
                get_json: vi.fn().mockResolvedValue({
                    usage: {
                        limit: "0",
                        used: "10",
                        remaining: "0",
                        resetTime: "2099-01-01T00:00:00Z",
                    },
                }),
                post_json: vi.fn(),
                get_raw: vi.fn(),
            },
        });
        const result = await run_connector(raw, script, ctx);
        for (const obs of result.observations) {
            expect(obs.status).toBe("normal");
        }
    });

    it("carries user.membership.level into account_label", async () => {
        const script = await readFile(join("connectors", "kimi", "connector.ts"), "utf8");
        const raw = JSON.parse(await readFile(manifest_path, "utf8")) as Manifest;
        const ctx = create_ctx({
            http: {
                get_json: vi.fn().mockResolvedValue({
                    usage: {
                        limit: "100",
                        used: "10",
                        remaining: "90",
                        resetTime: "2099-01-01T00:00:00Z",
                    },
                    user: { membership: { level: "PRO" } },
                }),
                post_json: vi.fn(),
                get_raw: vi.fn(),
            },
        });
        const result = await run_connector(raw, script, ctx);
        // Every observation carries the membership-decorated account label.
        for (const obs of result.observations) {
            expect(obs.account_label).toBe("Kimi（PRO）");
        }
    });
});
