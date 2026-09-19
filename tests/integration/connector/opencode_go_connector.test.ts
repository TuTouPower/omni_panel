import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { run_connector } from "../../../src/main/core/connector/runtime";
import type { ConnectorContext } from "../../../src/main/core/connector/host-io";
import type { Manifest } from "../../../src/shared/schemas/manifest";

const manifest: Manifest = {
    id: "opencode_go",
    provider: "opencode_go",
    capabilities: ["session"],
    parameters: [{ name: "SESSION_COOKIE", type: "secret", required: true, exposeToScript: true }],
    endpoints: { default: "https://opencode.ai" },
    script: "connector.ts",
};

function make_ctx(get_json: ConnectorContext["http"]["get_json"]): ConnectorContext {
    return {
        log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        http: {
            get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
            get_json,
            post_json: () => Promise.resolve({}),
        },
        files: { read: () => Promise.resolve(""), list: () => Promise.resolve([]) },
        params: { SESSION_COOKIE: "__Host-console_session=valid-session" },
        status: {
            for_ratio: (used: number, limit: number) =>
                used / limit > 0.75 ? "critical" : used / limit > 0.5 ? "warning" : "normal",
            for_pct: () => "normal",
            for_balance: (balance: number) => (balance <= 0 ? "warning" : "normal"),
        } as unknown as ConnectorContext["status"],
        report_failed_account: () => undefined,
    };
}

describe("opencode_go connector (t506 console REST API)", () => {
    it("fetches orgs and maps 24h, 7d, 30d usage summaries and billing status to observations", async () => {
        const script = await readFile(join("connectors", "opencode_go", "connector.ts"), "utf8");
        const get_json = vi
            .fn<ConnectorContext["http"]["get_json"]>()
            .mockImplementation((_endpoint: string, path: string) => {
                if (path === "/console/api/orgs") {
                    return Promise.resolve([
                        { id: "wrk_01KVAJY3W1421VAB7X1F6KR1JA", name: "Default" },
                    ]);
                }
                if (path.includes("/console/api/usage/summary?range=24h")) {
                    return Promise.resolve({
                        totalRequests: "979",
                        totalCostMicroCents: "118281096",
                    });
                }
                if (path.includes("/console/api/usage/summary?range=7d")) {
                    return Promise.resolve({
                        totalRequests: "4363",
                        totalCostMicroCents: "459555987",
                    });
                }
                if (path.includes("/console/api/usage/summary?range=30d")) {
                    return Promise.resolve({
                        totalRequests: "4363",
                        totalCostMicroCents: "459555987",
                    });
                }
                if (path === "/console/api/billing/status") {
                    return Promise.resolve({
                        billingMode: "prepaid",
                        mode: "pay-as-you-go",
                        balanceMicroCents: "500000000",
                        availableMicroCents: "500000000",
                    });
                }
                return Promise.reject(new Error(`Unexpected path: ${path}`));
            });

        const result = await run_connector(manifest, script, make_ctx(get_json));

        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(4);

        const rolling = result.observations.find((o) => o.metric_id === "opencode_go:rolling");
        expect(rolling).toMatchObject({
            provider: "opencode_go",
            account_id: "wrk_01KVAJY3W1421VAB7X1F6KR1JA",
            account_label: "Default",
            raw_label: "rolling",
            normalized_label: "滚动",
            used: 1.18,
            display_style: "ratio",
            status: "normal",
        });

        const weekly = result.observations.find((o) => o.metric_id === "opencode_go:weekly");
        expect(weekly).toMatchObject({
            raw_label: "weekly",
            normalized_label: "一周",
            used: 4.6,
            display_style: "ratio",
        });

        const monthly = result.observations.find((o) => o.metric_id === "opencode_go:monthly");
        expect(monthly).toMatchObject({
            raw_label: "monthly",
            normalized_label: "一月",
            used: 4.6,
            display_style: "ratio",
        });

        const balance = result.observations.find((o) => o.metric_id === "opencode_go:balance");
        expect(balance).toMatchObject({
            raw_label: "balance",
            normalized_label: "余额",
            used: 5.0,
            display_style: "ratio",
            status: "normal",
        });
    });

    it("throws session expired error when orgs request fails with 401 Unauthorized", async () => {
        const script = await readFile(join("connectors", "opencode_go", "connector.ts"), "utf8");
        const get_json = vi
            .fn<ConnectorContext["http"]["get_json"]>()
            .mockRejectedValue(new Error("HTTP 401: Unauthorized (45 bytes)"));

        const result = await run_connector(manifest, script, make_ctx(get_json));
        expect(result.error).toMatch(/OpenCode 会话已失效，请重新登录/);
    });

    it("throws error when no organizations returned", async () => {
        const script = await readFile(join("connectors", "opencode_go", "connector.ts"), "utf8");
        const get_json = vi.fn<ConnectorContext["http"]["get_json"]>().mockResolvedValue([]);

        const result = await run_connector(manifest, script, make_ctx(get_json));
        expect(result.error).toMatch(/未找到可用组织或工作区/);
    });
});
