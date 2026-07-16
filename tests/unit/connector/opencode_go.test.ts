import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { run_connector } from "../../../src/main/core/connector/runtime";
import { load_manifest } from "../../../src/main/core/connector/manifest-loader";
import type { ConnectorContext, RawHttpResponse } from "../../../src/main/core/connector/host-io";

const connector_dir = join(process.cwd(), "connectors", "opencode_go");
const hash = "a".repeat(64);
const other_hash = "b".repeat(64);
const checkout_hash = "c".repeat(64);

async function load_connector() {
    const manifest = await load_manifest(connector_dir);
    const script = await readFile(join(connector_dir, "connector.ts"), "utf8");
    if (!manifest) throw new Error("manifest missing");
    return { manifest, script };
}

function raw(status: number, body: string, headers: Record<string, string> = {}): RawHttpResponse {
    return { status, body, headers };
}

function create_ctx(
    handler: (
        path: string,
        opts?: { headers?: Record<string, string> },
    ) => RawHttpResponse | Promise<RawHttpResponse>,
    params: Record<string, string> = { SESSION_COOKIE: "session=secret" },
): ConnectorContext {
    return {
        log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        http: {
            get_json: () => Promise.resolve({}),
            post_json: () => Promise.resolve({}),
            get_raw: vi.fn(
                (_endpoint: string, path: string, opts?: { headers?: Record<string, string> }) =>
                    Promise.resolve(handler(path, opts)),
            ),
        },
        files: { read: () => Promise.resolve(""), list: () => Promise.resolve([]) },
        params,
        report_failed_account: () => undefined,
    };
}

describe("opencode_go connector", () => {
    it("emits rolling, weekly, and monthly observations from the server reference", async () => {
        const { manifest, script } = await load_connector();
        const ctx = create_ctx((path, opts) => {
            if (path === "/auth") {
                expect(opts?.headers?.["Cookie"]).toBe("session=secret");
                return raw(302, "", { location: "https://opencode.ai/workspace/ws_123" });
            }
            if (path === "/workspace/ws_123") {
                return raw(200, '<script src="/_build/assets/app.js"></script>');
            }
            if (path === "/workspace/ws_123/go") {
                return raw(200, '<script src="/_build/assets/go.js"></script>');
            }
            if (path === "/_build/assets/app.js") {
                return raw(200, `createServerReference("${other_hash}");`);
            }
            if (path === "/_build/assets/go.js") {
                return raw(
                    200,
                    `const checkout_reference = createServerReference("${checkout_hash}"); lite.subscription.get; const usage_reference = createServerReference("${hash}"); query(usage_reference, "lite.subscription.get");`,
                );
            }
            if (path.startsWith(`/_server?id=${hash}&args=`)) {
                expect(opts?.headers).toMatchObject({
                    Cookie: "session=secret",
                    Accept: "*/*",
                    Referer: "https://opencode.ai/workspace/ws_123",
                    "x-server-id": hash,
                    "x-server-instance": "server-fn:0",
                });
                const encoded_args = path.slice(path.indexOf("&args=") + "&args=".length);
                expect(JSON.parse(decodeURIComponent(encoded_args))).toEqual({
                    t: { t: 9, i: 0, l: 1, a: [{ t: 1, s: "ws_123" }], o: 0 },
                    f: 31,
                    m: [],
                });
                return raw(
                    200,
                    `;0x;(($R)=>{rollingUsage:$R[1]={usagePercent:12,resetInSec:60,status:"ok"},weeklyUsage:$R[2]={usagePercent:34,resetInSec:120,status:"ok"},monthlyUsage:$R[3]={usagePercent:56,resetInSec:180,status:"ok"}})($R["server-fn:0"])`,
                );
            }
            throw new Error(`unexpected path ${path}`);
        });

        const result = await run_connector(manifest, script, ctx);

        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(3);
        expect(result.observations.map((o) => o.raw_label)).toEqual([
            "rolling",
            "weekly",
            "monthly",
        ]);
        expect(result.observations).toEqual([
            expect.objectContaining({
                provider: "opencode_go",
                source: "session",
                account_id: "ws_123",
                account_label: "ws_123",
                metric_id: "opencode_go:rolling",
                normalized_label: "滚动",
                window: "second",
                used: 12,
                limit: 100,
                display_style: "percent",
                stale: false,
                last_error: null,
            }),
            expect.objectContaining({
                metric_id: "opencode_go:weekly",
                normalized_label: "一周",
                window: "day",
                used: 34,
                limit: 100,
            }),
            expect.objectContaining({
                metric_id: "opencode_go:monthly",
                normalized_label: "一月",
                window: "month",
                used: 56,
                limit: 100,
            }),
        ]);
        expect(result.observations[0]?.reset_at).toBe(
            (result.observations[0]?.observed_at ?? 0) + 60_000,
        );
        expect(result.observations[1]?.reset_at).toBe(
            (result.observations[1]?.observed_at ?? 0) + 120_000,
        );
        expect(result.observations[2]?.reset_at).toBe(
            (result.observations[2]?.observed_at ?? 0) + 180_000,
        );
    });

    it("deduplicates asset paths across workspace and go pages", async () => {
        // Regression: TLS handshake burst — when both pages reference the same
        // JS assets, the connector should deduplicate before fetching bundles.
        const { manifest, script } = await load_connector();
        const bundle_fetched_paths: string[] = [];
        const ctx = create_ctx((path) => {
            if (path === "/auth") {
                return raw(302, "", { location: "https://opencode.ai/workspace/ws_dedup" });
            }
            if (path === "/workspace/ws_dedup") {
                return raw(
                    200,
                    '<script src="/_build/assets/shared.js"></script><script src="/_build/assets/app.js"></script>',
                );
            }
            if (path === "/workspace/ws_dedup/go") {
                // go page references the same shared.js — should not be fetched twice
                return raw(
                    200,
                    '<script src="/_build/assets/shared.js"></script><script src="/_build/assets/go.js"></script>',
                );
            }
            if (path === "/_build/assets/shared.js") {
                bundle_fetched_paths.push(path);
                return raw(200, `createServerReference("${hash}"); lite.subscription.get;`);
            }
            if (path === "/_build/assets/app.js") {
                bundle_fetched_paths.push(path);
                return raw(200, "no reference here");
            }
            if (path === "/_build/assets/go.js") {
                bundle_fetched_paths.push(path);
                return raw(200, "no reference here either");
            }
            if (path.startsWith(`/_server?id=${hash}&args=`)) {
                return raw(
                    200,
                    `;0x;(($R)=>{rollingUsage:$R[1]={usagePercent:10,resetInSec:60,status:"ok"},weeklyUsage:$R[2]={usagePercent:20,resetInSec:120,status:"ok"},monthlyUsage:$R[3]={usagePercent:30,resetInSec:180,status:"ok"}})($R["server-fn:0"])`,
                );
            }
            throw new Error(`unexpected path ${path}`);
        });

        const result = await run_connector(manifest, script, ctx);

        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(3);
        // shared.js appears in both workspace and go page but should only be fetched once
        const shared_count = bundle_fetched_paths.filter(
            (p) => p === "/_build/assets/shared.js",
        ).length;
        expect(shared_count).toBe(1);
        // Total bundle fetches: shared.js + app.js + go.js = 3 (not 4)
        expect(bundle_fetched_paths).toHaveLength(3);
    });

    it("reports missing session cookie", async () => {
        const { manifest, script } = await load_connector();
        const ctx = create_ctx(() => raw(200, ""), {});

        const result = await run_connector(manifest, script, ctx);

        expect(result.observations).toEqual([]);
        expect(result.error).toContain("Missing required secret: SESSION_COOKIE");
    });

    it("reports a protocol change when no JS assets are found", async () => {
        const { manifest, script } = await load_connector();
        const ctx = create_ctx((path) => {
            if (path === "/auth") return raw(302, "", { location: "/workspace/ws_123" });
            if (path === "/workspace/ws_123" || path === "/workspace/ws_123/go") {
                return raw(200, "<html>No assets</html>");
            }
            throw new Error(`unexpected path ${path}`);
        });

        const result = await run_connector(manifest, script, ctx);

        expect(result.observations).toEqual([]);
        expect(result.error).toContain("OpenCode Go 页面协议可能已变更");
    });

    it("reports an expired cookie when auth does not redirect to workspace", async () => {
        const { manifest, script } = await load_connector();
        const ctx = create_ctx((path) => {
            if (path === "/auth") return raw(200, "login");
            throw new Error(`unexpected path ${path}`);
        });

        const result = await run_connector(manifest, script, ctx);

        expect(result.observations).toEqual([]);
        expect(result.error).toContain("Cookie 可能已失效，未跳转到 workspace");
    });

    it("reports a protocol change when no server hash is found", async () => {
        const { manifest, script } = await load_connector();
        const ctx = create_ctx((path) => {
            if (path === "/auth") return raw(302, "", { location: "/workspace/ws_123" });
            if (path === "/workspace/ws_123") {
                return raw(200, '<script src="/_build/assets/app.js"></script>');
            }
            if (path === "/workspace/ws_123/go") {
                return raw(200, '<script src="/_build/assets/go.js"></script>');
            }
            if (path === "/_build/assets/app.js" || path === "/_build/assets/go.js") {
                return raw(200, "lite.subscription.get without server reference");
            }
            throw new Error(`unexpected path ${path}`);
        });

        const result = await run_connector(manifest, script, ctx);

        expect(result.observations).toEqual([]);
        expect(result.error).toContain("OpenCode Go 页面协议可能已变更");
    });

    it("reports invalid usage response when a usage window is missing", async () => {
        const { manifest, script } = await load_connector();
        const ctx = create_ctx((path) => {
            if (path === "/auth") return raw(302, "", { location: "/workspace/ws_123" });
            if (path === "/workspace/ws_123" || path === "/workspace/ws_123/go") {
                return raw(200, '<script src="/_build/assets/go.js"></script>');
            }
            if (path === "/_build/assets/go.js") {
                return raw(200, `lite.subscription.get createServerReference("${hash}");`);
            }
            if (path.startsWith(`/_server?id=${hash}&args=`)) {
                return raw(200, `1:{"rollingUsage":{"usagePercent":12,"resetInSec":60}}`);
            }
            throw new Error(`unexpected path ${path}`);
        });

        const result = await run_connector(manifest, script, ctx);

        expect(result.observations).toEqual([]);
        expect(result.error).toContain("OpenCode Go usage response invalid");
    });

    it("reports invalid usage response when server response is not JSON-like", async () => {
        const { manifest, script } = await load_connector();
        const ctx = create_ctx((path) => {
            if (path === "/auth") return raw(302, "", { location: "/workspace/ws_123" });
            if (path === "/workspace/ws_123" || path === "/workspace/ws_123/go") {
                return raw(200, '<script src="/_build/assets/go.js"></script>');
            }
            if (path === "/_build/assets/go.js") {
                return raw(200, `lite.subscription.get createServerReference("${hash}");`);
            }
            if (path.startsWith(`/_server?id=${hash}&args=`)) return raw(200, "not json");
            throw new Error(`unexpected path ${path}`);
        });

        const result = await run_connector(manifest, script, ctx);

        expect(result.observations).toEqual([]);
        expect(result.error).toContain("OpenCode Go usage response invalid");
    });
});
