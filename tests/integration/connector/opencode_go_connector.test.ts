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

const HASH = "a".repeat(64);
const SERVER_FN_BODY = JSON.stringify({
    rollingUsage: { total: 100, used: 40 },
    weeklyUsage: { total: 700, used: 210 },
    monthlyUsage: { total: 3000, used: 900 },
});

function make_ctx(get_raw: ConnectorContext["http"]["get_raw"]): ConnectorContext {
    return {
        log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        http: {
            get_raw,
            get_json: () => Promise.resolve({}),
            post_json: () => Promise.resolve({}),
        },
        files: { read: () => Promise.resolve(""), list: () => Promise.resolve([]) },
        params: { SESSION_COOKIE: "cookie-value" },
        status: {
            for_ratio: (used: number, limit: number) =>
                used / limit > 0.75 ? "critical" : used / limit > 0.5 ? "warning" : "normal",
            for_pct: () => "normal",
            for_balance: (used: number, limit: number) =>
                used / limit > 0.75 ? "critical" : "normal",
        } as unknown as ConnectorContext["status"],
        report_failed_account: () => undefined,
    };
}

describe("opencode_go connector", () => {
    it("tolerates a failing asset bundle in the server-fn fallback (t363 AC-003)", async () => {
        const script = await readFile(join("connectors", "opencode_go", "connector.ts"), "utf8");
        const asset_with_hash = `...lite.subscription.get... createServerReference("${HASH}") ...`;
        const get_raw = vi
            .fn<ConnectorContext["http"]["get_raw"]>()
            .mockImplementation((_endpoint: string, path: string) => {
                if (path === "/auth") {
                    // login redirect → workspace id
                    return Promise.resolve({
                        status: 302,
                        headers: { location: "https://opencode.ai/workspace/ws-1" },
                        body: "",
                    });
                }
                if (path === "/workspace/ws-1/go") {
                    // HTML 含 3 个 asset src（其中 chunk-2 将失败），触发 fallback bundle 拉取。
                    const assets_html = [
                        '"/_build/assets/chunk-1.js"',
                        '"/_build/assets/chunk-2.js"',
                        '"/_build/assets/chunk-3.js"',
                    ].join(",");
                    return Promise.resolve({
                        status: 200,
                        headers: {},
                        body: `<html><body>${assets_html}</body></html>`,
                    });
                }
                if (path === "/workspace/ws-1") {
                    return Promise.resolve({ status: 200, headers: {}, body: "" });
                }
                if (path.startsWith("/_build/assets/")) {
                    if (path.includes("chunk-2")) {
                        // 单个 bundle 失败——不得拖垮其它 bundle。
                        return Promise.reject(new Error("chunk-2 加载失败"));
                    }
                    return Promise.resolve({ status: 200, headers: {}, body: asset_with_hash });
                }
                if (path.includes("/_server")) {
                    return Promise.resolve({ status: 200, headers: {}, body: SERVER_FN_BODY });
                }
                return Promise.resolve({ status: 404, headers: {}, body: "" });
            });

        const result = await run_connector(manifest, script, make_ctx(get_raw));

        expect(result.error).toBeNull();
        // 单 bundle 失败不影响其余 bundle 产出的观测。
        expect(result.observations.length).toBeGreaterThan(0);
    });
});
