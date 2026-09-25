import { createServer } from "node:http";
import { ctx_status } from "../../integration/connector/_ctx_status";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execute_probe } from "../../../src/main/core/connector/probe-executor";
import type { ConnectorContext } from "../../../src/main/core/connector/host-io";
import type { Manifest } from "../../../src/shared/schemas/manifest";

let server_port: number;
let server: ReturnType<typeof createServer>;

function create_manifest(
    headers: string[] = ["x-ratelimit-remaining", "x-ratelimit-limit"],
): Manifest {
    return {
        id: "test-probe",
        provider: "claude",
        capabilities: ["observe"],
        parameters: [],
        endpoints: { default: `http://127.0.0.1:${String(server_port)}` },
        observe: {
            headers,
            probe: {
                endpoint: "default",
                path: "/probe",
            },
        },
    };
}

function create_ctx(): ConnectorContext {
    return {
        log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        http: {
            get_json: () => Promise.resolve({}),
            post_json: () => Promise.resolve({}),
            get_raw(_endpoint_key, path, opts) {
                const url = new URL(path, `http://127.0.0.1:${String(server_port)}`);
                return fetch(url.toString(), {
                    method: "GET",
                    headers: opts?.headers ?? {},
                }).then(async (res) => {
                    if (res.status >= 400) {
                        const text = await res.text();
                        throw new Error(`HTTP ${String(res.status)}: ${text.slice(0, 200)}`);
                    }
                    const headers: Record<string, string> = {};
                    res.headers.forEach((value, key) => {
                        headers[key] = value;
                    });
                    return {
                        status: res.status,
                        headers,
                        body: await res.text(),
                    };
                });
            },
        },
        files: { read: () => Promise.resolve(""), list: () => Promise.resolve([]) },
        params: {},
        status: ctx_status,
        report_failed_account: () => undefined,
    };
}

beforeAll(async () => {
    server = createServer((req, res) => {
        const url = new URL(req.url ?? "/", `http://127.0.0.1:${String(server_port)}`);

        if (url.pathname === "/probe") {
            res.writeHead(200, {
                "Content-Type": "application/json",
                "x-ratelimit-remaining": "100",
                "x-ratelimit-limit": "1000",
            });
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        if (url.pathname === "/probe-remaining") {
            res.writeHead(200, {
                "Content-Type": "application/json",
                "x-ratelimit-remaining": "50",
                "x-ratelimit-limit": "100",
            });
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        if (url.pathname === "/probe-no-numeric") {
            res.writeHead(200, {
                "Content-Type": "application/json",
                "x-request-id": "abc-123",
            });
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        if (url.pathname === "/probe-error") {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "internal" }));
            return;
        }

        res.writeHead(404);
        res.end();
    });

    await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            const addr = server.address();
            if (addr && typeof addr === "object") server_port = addr.port;
            resolve();
        });
    });
});

afterAll(async () => {
    await new Promise<void>((resolve) => {
        server.close(() => {
            resolve();
        });
    });
});

describe("probe-executor", () => {
    it("extracts numeric headers and creates observation", async () => {
        const manifest = create_manifest();
        const ctx = create_ctx();
        const observations = await execute_probe(manifest, ctx);

        expect(observations).toHaveLength(1);
        expect(observations[0]).toEqual(
            expect.objectContaining({
                provider: "claude",
                account_id: "default",
                metric_id: "test-probe:usage",
                window: "month",
                display_style: "ratio",
                source: "probe",
                status: "normal",
                stale: false,
                last_error: null,
            }),
        );
        const first1 = observations[0];
        if (!first1) return;
        expect(first1.used).toBe(900);
        expect(first1.limit).toBe(1000);
        expect(first1.observed_at).toBeGreaterThan(0);
        // conventions.md §5：观测用 raw_label + normalized_label，不再带废弃的 name 字段
        expect(first1).not.toHaveProperty("name");
    });

    it("computes used = limit - remaining from headers", async () => {
        const manifest = {
            ...create_manifest(),
            observe: {
                headers: ["x-ratelimit-remaining", "x-ratelimit-limit"],
                probe: { endpoint: "default", path: "/probe-remaining" },
            },
        };
        const ctx = create_ctx();
        const observations = await execute_probe(manifest, ctx);

        expect(observations).toHaveLength(1);
        // remaining=50, limit=100 → used = 100 - 50 = 50
        const first2 = observations[0];
        if (!first2) return;
        expect(first2.used).toBe(50);
        expect(first2.limit).toBe(100);
    });

    // A30: 旧测试「无数值头静默返回空数组」语义由 A30 废弃并升级为显式抛错与 failed_accounts 上报
    it("throws explicit error and reports failed account when no numeric headers found (A30)", async () => {
        const manifest = {
            ...create_manifest(),
            observe: {
                headers: ["x-request-id"],
                probe: { endpoint: "default", path: "/probe-no-numeric" },
            },
        };
        const failed_accounts: { provider: string; account_id: string; error: string }[] = [];
        const ctx = {
            ...create_ctx(),
            report_failed_account: (
                provider: string,
                account_id: string,
                _account_label: string,
                error: string,
            ) => {
                failed_accounts.push({ provider, account_id, error });
            },
        };

        await expect(execute_probe(manifest, ctx)).rejects.toThrow("Probe 无可用 metric");
        expect(failed_accounts).toHaveLength(1);
        expect(failed_accounts[0]?.error).toContain("Probe 无可用 metric");
    });

    it("throws error when probe request fails", async () => {
        const manifest = {
            ...create_manifest(),
            observe: {
                headers: ["x-ratelimit-remaining"],
                probe: { endpoint: "default", path: "/probe-error" },
            },
        };
        const ctx = create_ctx();

        await expect(execute_probe(manifest, ctx)).rejects.toThrow();
    });

    it("throws error when manifest has no observe.probe config", async () => {
        const manifest: Manifest = {
            id: "test-no-probe",
            provider: "claude",
            capabilities: ["observe"],
            parameters: [],
            observe: { headers: ["x-ratelimit-remaining"] },
        };
        const ctx = create_ctx();

        await expect(execute_probe(manifest, ctx)).rejects.toThrow("has no observe.probe config");
    });

    // A30: 缺失全部关注头时，抛出明确错误而非静默返回空
    it("throws explicit error when configured headers are missing (A30)", async () => {
        const manifest = {
            ...create_manifest(),
            observe: {
                headers: ["x-missing-header", "x-another-missing"],
                probe: { endpoint: "default", path: "/probe" },
            },
        };
        const ctx = create_ctx();
        await expect(execute_probe(manifest, ctx)).rejects.toThrow("Probe 无可用 metric");
    });

    it("throws explicit error when header not present in response (A30)", async () => {
        const manifest = {
            ...create_manifest(),
            observe: {
                headers: ["x-custom-count"],
                probe: { endpoint: "default", path: "/probe" },
            },
        };
        const ctx = create_ctx();
        await expect(execute_probe(manifest, ctx)).rejects.toThrow("Probe 无可用 metric");
    });

    it("does not fabricate `used` from a numeric header not in the observe list and throws (A30)", async () => {
        // Server sends an unlisted numeric header; manifest only whitelists x-ratelimit-remaining.
        const manifest = create_manifest(["x-definitely-not-sent-by-server"]);
        const ctx = create_ctx();
        await expect(execute_probe(manifest, ctx)).rejects.toThrow("Probe 无可用 metric");
    });

    it("logs debug when multiple headers match the same metric type (A44)", async () => {
        const manifest = {
            ...create_manifest(),
            observe: {
                headers: ["x-ratelimit-limit", "x-rate-limit"],
                probe: { endpoint: "default", path: "/probe-duplicate" },
            },
        };
        // 模拟返回两个同属 limit 的头
        const debug_spy = vi.fn();
        const ctx = {
            ...create_ctx(),
            log: { ...create_ctx().log, debug: debug_spy },
            http: {
                ...create_ctx().http,
                get_raw: () =>
                    Promise.resolve({
                        status: 200,
                        headers: {
                            "x-ratelimit-limit": "1000",
                            "x-rate-limit": "1200",
                        },
                        body: "{}",
                    }),
            },
        };

        const obs = await execute_probe(manifest, ctx);
        expect(obs).toHaveLength(1);
        expect(obs[0]?.limit).toBe(1000);
        expect(debug_spy).toHaveBeenCalledWith(
            expect.stringContaining('duplicate for "limit", using first match'),
        );
    });
});
