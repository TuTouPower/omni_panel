import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { load_manifest } from "../../../src/main/core/connector/manifest-loader";
import { run_connector } from "../../../src/main/core/connector/runtime";
import { is_auth_error } from "../../../src/shared/lib/auth-error";
import type {
    ConnectorContext,
    ConnectorDiscoveryEntry,
} from "../../../src/main/core/connector/host-io";
import { create_execution_budget } from "../../../src/main/core/connector/execution-budget";
import { ctx_budget_stub } from "./_ctx_status";

const ROOT = join(process.cwd(), "connectors", "muse");

const fixture = async (name: string): Promise<string> => {
    return readFile(join(process.cwd(), "tests/fixtures/connector/muse", name), "utf8");
};

function context(
    body: string,
    cookie = "hatch_sess=test-session-token",
    status = 200,
    discovery_map = new Map<string, ConnectorDiscoveryEntry>(),
): ConnectorContext {
    return {
        ...ctx_budget_stub,
        discovery: {
            get: (key: string) => Promise.resolve(discovery_map.get(key) ?? null),
            set: (key: string, entry: ConnectorDiscoveryEntry) => {
                discovery_map.set(key, entry);
                return Promise.resolve();
            },
            delete: (key: string) => {
                discovery_map.delete(key);
                return Promise.resolve();
            },
        },
        params: { SESSION_COOKIE: cookie },
        http: {
            get_raw: vi.fn().mockResolvedValue({
                status: 200,
                headers: {},
                body: '<div data-dpl-id="dpl_CNQdEujmyWKVYPuVmTaSE1y33cfy" actionId="4012d49305cf4c3246eb4b75085a93bbe92fe7cec7"></div>',
            }),
            post_raw: vi.fn().mockResolvedValue({
                status,
                headers: { "content-type": "text/x-component" },
                body,
            }),
            post_json: vi.fn(),
            get_json: vi.fn(),
        },
        files: { read: vi.fn(), list: vi.fn() },
        log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        status: {
            for_pct: (n) => (n >= 90 ? "critical" : n >= 70 ? "warning" : "normal"),
            for_ratio: () => "normal",
            for_balance: () => "normal",
        },
        report_failed_account: vi.fn(),
    };
}

async function code() {
    return readFile(join(ROOT, "connector.ts"), "utf8");
}

describe("muse connector", () => {
    it("declares session web_login in manifest", async () => {
        const manifest = await load_manifest(ROOT);
        expect(manifest).not.toBeNull();
        expect(manifest?.capabilities).toContain("session");
        expect(manifest?.auth).toEqual({
            method: "web_login",
            secret_name: "SESSION_COOKIE",
            login_url: "https://muse.ai/",
        });
        expect(manifest?.loginDomains).toContain("muse.ai");
        expect(manifest?.cookieNames).toContain("hatch_sess");
    });

    it("parses RSC response and outputs weekly usage and extra tokens", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("muse manifest missing");

        const rscBody = await fixture("subscription_sample.txt");
        const ctx = context(rscBody);

        const result = await run_connector(manifest, await code(), ctx);
        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(2);

        const [weekly, extra] = result.observations;
        expect(weekly).toMatchObject({
            provider: "muse",
            metric_id: "muse:weekly",
            raw_label: "weekly",
            normalized_label: "每周限额",
            window: "week",
            used: 13,
            limit: 100,
            display_style: "percent",
            reset_at: 1790757971000,
            status: "normal",
        });

        expect(extra).toMatchObject({
            provider: "muse",
            metric_id: "muse:extra",
            raw_label: "extra",
            normalized_label: "额外额度",
            window: "total",
            used: 0,
            limit: 100,
            display_style: "percent",
            status: "normal",
        });

        // 验证调用的请求头与入参
        // eslint-disable-next-line @typescript-eslint/unbound-method, @typescript-eslint/no-non-null-assertion
        const post_raw = vi.mocked(ctx.http.post_raw!);
        expect(post_raw).toHaveBeenCalledTimes(1);
        expect(post_raw.mock.calls[0]?.[0]).toBe("default");
        expect(post_raw.mock.calls[0]?.[1]).toBe("/");
        expect(post_raw.mock.calls[0]?.[3]?.headers).toMatchObject({
            Accept: "text/x-component",
            "next-action": "4012d49305cf4c3246eb4b75085a93bbe92fe7cec7",
            Origin: "https://muse.ai",
            Referer: "https://muse.ai/",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Dest": "empty",
            "x-deployment-id": "dpl_CNQdEujmyWKVYPuVmTaSE1y33cfy",
            Cookie: "hatch_sess=test-session-token",
        });
    });

    it("throws auth error when session is invalid or expired", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("muse manifest missing");

        const ctx = context('{"error":"Authentication required"}', "hatch_sess=expired", 401);
        const result = await run_connector(manifest, await code(), ctx);

        expect(result.observations).toHaveLength(0);
        expect(result.error).toBeTruthy();
        expect(result.error).toMatch(/Muse 会话已失效|Authentication required/i);
        if (result.error) {
            expect(is_auth_error(result.error)).toBe(true);
        }
    });

    it("throws error when SESSION_COOKIE parameter is missing", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("muse manifest missing");

        const ctx = context("{}", "");
        const result = await run_connector(manifest, await code(), ctx);

        expect(result.observations).toHaveLength(0);
        expect(result.error).toMatch(/SESSION_COOKIE/);
    });

    // [t530 删除旧测试理由]: 删除原 baseline 静默回退测试，按 AC-008 改为验证发现失败且无显式手动参数时以 DISCOVERY_EMPTY 显式失败
    it("AC-008: throws DISCOVERY_EMPTY when discovery fails and no manual params provided (no silent baseline fallback)", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("muse manifest missing");

        const rscBody = await fixture("subscription_sample.txt");
        const ctx = context(rscBody);
        ctx.http.get_raw = vi.fn().mockResolvedValue({
            status: 200,
            headers: {},
            body: "<html><body>no ids and no scripts here</body></html>",
        });

        const result = await run_connector(manifest, await code(), ctx);
        expect(result.error).toMatch(/DISCOVERY_EMPTY/);
        expect(result.observations).toHaveLength(0);
    });

    it("AC-002: dynamically resolves action ID from manifest chunks when deployment and chunk names change", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("muse manifest missing");

        const rscBody = await fixture("subscription_sample.txt");
        const ctx = context(rscBody);

        // 模拟全新版本：dpl 变更为 dpl_FUTURE_V99，chunk 名称全为随机哈希
        ctx.http.get_raw = vi.fn().mockImplementation((_endpoint, path: string) => {
            if (path === "/") {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: [
                        "<html><head>",
                        '<div data-dpl-id="dpl_FUTURE_V99"></div>',
                        '<script src="/_next/static/chunks/app-settings-random123.js"></script>',
                        '<script src="/_next/static/chunks/turbopack-manifest-random456.js"></script>',
                        "</head><body></body></html>",
                    ].join(""),
                });
            }
            if (path.includes("app-settings-random123.js")) {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: "var x = e.A(555666).then(function(m){ return { default: m.HatchSettingsDialogContent }; });",
                });
            }
            if (path.includes("turbopack-manifest-random456.js")) {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: '555666, s => { s.v(t => Promise.all(["static/chunks/sub-action-arbitrary789.js","static/chunks/other-chunk.js"].map(t=>s.l(t))).then(()=>t(999))) }',
                });
            }
            if (path.includes("sub-action-arbitrary789.js")) {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: 'var fn = (0, O.createServerReference)("8888ffff00001111222233334444555566667777aa", O.callServer, void 0, O.map, "fetchSubscriptionAction");',
                });
            }
            return Promise.resolve({ status: 200, headers: {}, body: "{}" });
        });

        const result = await run_connector(manifest, await code(), ctx);
        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(2);

        // eslint-disable-next-line @typescript-eslint/unbound-method, @typescript-eslint/no-non-null-assertion
        const post_raw = vi.mocked(ctx.http.post_raw!);
        expect(post_raw).toHaveBeenCalledTimes(1);
        expect(post_raw.mock.calls[0]?.[3]?.headers).toMatchObject({
            "next-action": "8888ffff00001111222233334444555566667777aa",
            "x-deployment-id": "dpl_FUTURE_V99",
        });
    });

    it("AC-002: does not mistakenly pick a preceding unrelated async import when locating HatchSettingsDialogContent", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("muse manifest missing");

        const rscBody = await fixture("subscription_sample.txt");
        const ctx = context(rscBody);

        ctx.http.get_raw = vi.fn().mockImplementation((_endpoint, path: string) => {
            if (path === "/") {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: [
                        "<html><head>",
                        '<div data-dpl-id="dpl_CHAIN_TEST"></div>',
                        '<script src="/_next/static/chunks/app-bundle.js"></script>',
                        '<script src="/_next/static/chunks/manifest-bundle.js"></script>',
                        "</head><body></body></html>",
                    ].join(""),
                });
            }
            if (path.includes("app-bundle.js")) {
                // 设置组件前存在前置的无关异步导入（111222）
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: [
                        "var u = e.A(111222).then(function(m){ return { default: m.UserProfileDialogContent }; });",
                        "var s = e.A(862035).then(function(m){ return { default: m.HatchSettingsDialogContent }; });",
                    ].join(" "),
                });
            }
            if (path.includes("manifest-bundle.js")) {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: [
                        '111222, s => { s.v(t => Promise.all(["static/chunks/wrong-unrelated.js"]).map(t=>s.l(t)).then(()=>t(111))) },',
                        '862035, s => { s.v(t => Promise.all(["static/chunks/correct-settings.js"]).map(t=>s.l(t)).then(()=>t(862))) }',
                    ].join("\n"),
                });
            }
            if (path.includes("wrong-unrelated.js")) {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: 'var fn = (0, O.createServerReference)("1111111111111111111111111111111111111111", O.callServer, void 0, O.map, "fetchSubscriptionAction");',
                });
            }
            if (path.includes("correct-settings.js")) {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: 'var fn = (0, O.createServerReference)("2222222222222222222222222222222222222222", O.callServer, void 0, O.map, "fetchSubscriptionAction");',
                });
            }
            return Promise.resolve({ status: 200, headers: {}, body: "{}" });
        });

        const result = await run_connector(manifest, await code(), ctx);
        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(2);

        // eslint-disable-next-line @typescript-eslint/unbound-method, @typescript-eslint/no-non-null-assertion
        const post_raw = vi.mocked(ctx.http.post_raw!);
        expect(post_raw).toHaveBeenCalledTimes(1);
        expect(post_raw.mock.calls[0]?.[3]?.headers).toMatchObject({
            "next-action": "2222222222222222222222222222222222222222",
            "x-deployment-id": "dpl_CHAIN_TEST",
        });
    });

    it("AC-001 / AC-002 (p266): falls back to subsequent settings module candidates when the first candidate does not yield action ID", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("muse manifest missing");

        const rscBody = await fixture("subscription_sample.txt");
        const ctx = context(rscBody);

        ctx.http.get_raw = vi.fn().mockImplementation((_endpoint, path: string) => {
            if (path === "/") {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: [
                        "<html><head>",
                        '<div data-dpl-id="dpl_MULTI_CANDIDATE"></div>',
                        '<script src="/_next/static/chunks/chunk-a-wrong.js"></script>',
                        '<script src="/_next/static/chunks/chunk-b-right.js"></script>',
                        '<script src="/_next/static/chunks/manifest-bundle.js"></script>',
                        "</head><body></body></html>",
                    ].join(""),
                });
            }
            if (path.includes("chunk-a-wrong.js")) {
                // 候选 273187（错误候选，关联分包无目标 Action）
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: "var s = e.A(273187).then(function(m){ return { default: m.HatchSettingsDialogContent }; });",
                });
            }
            if (path.includes("chunk-b-right.js")) {
                // 候选 862035（正确候选，关联分包含目标 Action）
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: "var s = e.A(862035).then(function(m){ return { default: m.HatchSettingsDialogContent }; });",
                });
            }
            if (path.includes("manifest-bundle.js")) {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: [
                        '273187, s => { s.v(t => Promise.all(["static/chunks/empty-sub.js"]).map(t=>s.l(t)).then(()=>t(273))) },',
                        '862035, s => { s.v(t => Promise.all(["static/chunks/real-sub.js"]).map(t=>s.l(t)).then(()=>t(862))) }',
                    ].join("\n"),
                });
            }
            if (path.includes("empty-sub.js")) {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: "function UnrelatedComponent() { return 'no action here'; }",
                });
            }
            if (path.includes("real-sub.js")) {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: 'var fn = (0, O.createServerReference)("9999888877776666555544443333222211110000", O.callServer, void 0, O.map, "fetchSubscriptionAction");',
                });
            }
            return Promise.resolve({ status: 200, headers: {}, body: "{}" });
        });

        const result = await run_connector(manifest, await code(), ctx);
        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(2);

        // eslint-disable-next-line @typescript-eslint/unbound-method, @typescript-eslint/no-non-null-assertion
        const post_raw = vi.mocked(ctx.http.post_raw!);
        expect(post_raw).toHaveBeenCalledTimes(1);
        expect(post_raw.mock.calls[0]?.[3]?.headers).toMatchObject({
            "next-action": "9999888877776666555544443333222211110000",
            "x-deployment-id": "dpl_MULTI_CANDIDATE",
        });
    });

    it("AC-002 (p266): reversed script order still deterministically resolves action ID", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("muse manifest missing");

        const rscBody = await fixture("subscription_sample.txt");
        const ctx = context(rscBody);

        ctx.http.get_raw = vi.fn().mockImplementation((_endpoint, path: string) => {
            if (path === "/") {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: [
                        "<html><head>",
                        '<div data-dpl-id="dpl_REVERSED_ORDER"></div>',
                        '<script src="/_next/static/chunks/chunk-b-right.js"></script>',
                        '<script src="/_next/static/chunks/chunk-a-wrong.js"></script>',
                        '<script src="/_next/static/chunks/manifest-bundle.js"></script>',
                        "</head><body></body></html>",
                    ].join(""),
                });
            }
            if (path.includes("chunk-a-wrong.js")) {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: "var s = e.A(273187).then(function(m){ return { default: m.HatchSettingsDialogContent }; });",
                });
            }
            if (path.includes("chunk-b-right.js")) {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: "var s = e.A(862035).then(function(m){ return { default: m.HatchSettingsDialogContent }; });",
                });
            }
            if (path.includes("manifest-bundle.js")) {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: [
                        '273187, s => { s.v(t => Promise.all(["static/chunks/empty-sub.js"]).map(t=>s.l(t)).then(()=>t(273))) },',
                        '862035, s => { s.v(t => Promise.all(["static/chunks/real-sub.js"]).map(t=>s.l(t)).then(()=>t(862))) }',
                    ].join("\n"),
                });
            }
            if (path.includes("empty-sub.js")) {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: "function UnrelatedComponent() { return 'no action here'; }",
                });
            }
            if (path.includes("real-sub.js")) {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: 'var fn = (0, O.createServerReference)("9999888877776666555544443333222211110000", O.callServer, void 0, O.map, "fetchSubscriptionAction");',
                });
            }
            return Promise.resolve({ status: 200, headers: {}, body: "{}" });
        });

        const result = await run_connector(manifest, await code(), ctx);
        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(2);

        // eslint-disable-next-line @typescript-eslint/unbound-method, @typescript-eslint/no-non-null-assertion
        const post_raw = vi.mocked(ctx.http.post_raw!);
        expect(post_raw).toHaveBeenCalledTimes(1);
        expect(post_raw.mock.calls[0]?.[3]?.headers).toMatchObject({
            "next-action": "9999888877776666555544443333222211110000",
            "x-deployment-id": "dpl_REVERSED_ORDER",
        });
    });

    it("AC-003 (p266): logs structured diagnostic info and throws DISCOVERY_EMPTY when all settings candidates fail to yield target", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("muse manifest missing");

        const rscBody = await fixture("subscription_sample.txt");
        const ctx = context(rscBody);

        ctx.http.get_raw = vi.fn().mockImplementation((_endpoint, path: string) => {
            if (path === "/") {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: [
                        "<html><head>",
                        '<div data-dpl-id="dpl_ALL_FAIL"></div>',
                        '<script src="/_next/static/chunks/chunk-a-wrong.js"></script>',
                        '<script src="/_next/static/chunks/chunk-b-wrong.js"></script>',
                        '<script src="/_next/static/chunks/manifest-bundle.js"></script>',
                        "</head><body></body></html>",
                    ].join(""),
                });
            }
            if (path.includes("chunk-a-wrong.js")) {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: "var s = e.A(111111).then(function(m){ return { default: m.HatchSettingsDialogContent }; });",
                });
            }
            if (path.includes("chunk-b-wrong.js")) {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: "var s = e.A(222222).then(function(m){ return { default: m.HatchSettingsDialogContent }; });",
                });
            }
            if (path.includes("manifest-bundle.js")) {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: [
                        '111111, s => { s.v(t => Promise.all(["static/chunks/empty-1.js"]).map(t=>s.l(t)).then(()=>t(111))) },',
                        '222222, s => { s.v(t => Promise.all(["static/chunks/empty-2.js"]).map(t=>s.l(t)).then(()=>t(222))) }',
                    ].join("\n"),
                });
            }
            if (path.includes("empty-1.js") || path.includes("empty-2.js")) {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: "function EmptyComponent() { return 'nothing'; }",
                });
            }
            return Promise.resolve({ status: 200, headers: {}, body: "{}" });
        });

        const result = await run_connector(manifest, await code(), ctx);
        expect(result.error).toMatch(/DISCOVERY_EMPTY/);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const log_error = vi.mocked(ctx.log.error);
        expect(log_error).toHaveBeenCalledWith(expect.stringMatching(/checked 2 candidates/i));
    });

    it("AC-002: accurately enforces module ID boundaries in manifest to avoid matching prefix numbers", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("muse manifest missing");

        const rscBody = await fixture("subscription_sample.txt");
        const ctx = context(rscBody);

        ctx.http.get_raw = vi.fn().mockImplementation((_endpoint, path: string) => {
            if (path === "/") {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: [
                        "<html><head>",
                        '<div data-dpl-id="dpl_PREFIX_TEST"></div>',
                        '<script src="/_next/static/chunks/app-bundle.js"></script>',
                        '<script src="/_next/static/chunks/manifest-bundle.js"></script>',
                        "</head><body></body></html>",
                    ].join(""),
                });
            }
            if (path.includes("app-bundle.js")) {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: "var s = e.A(555666).then(function(m){ return { default: m.HatchSettingsDialogContent }; });",
                });
            }
            if (path.includes("manifest-bundle.js")) {
                // 清单中存在包含 555666 作为后缀的前缀 ID（1555666）
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: [
                        '1555666, s => { s.v(t => Promise.all(["static/chunks/wrong-prefix.js"]).map(t=>s.l(t)).then(()=>t(111))) },',
                        '9999999, s => { s.v(t => Promise.all(["static/chunks/wrong-prefix.js"]).map(t=>s.l(t)).then(()=>t(999))) },',
                        '555666, s => { s.v(t => Promise.all(["static/chunks/correct-bounded.js"]).map(t=>s.l(t)).then(()=>t(555))) }',
                    ].join("\n"),
                });
            }
            if (path.includes("wrong-prefix.js")) {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: 'var fn = (0, O.createServerReference)("3333333333333333333333333333333333333333", O.callServer, void 0, O.map, "fetchSubscriptionAction");',
                });
            }
            if (path.includes("correct-bounded.js")) {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: 'var fn = (0, O.createServerReference)("4444444444444444444444444444444444444444", O.callServer, void 0, O.map, "fetchSubscriptionAction");',
                });
            }
            return Promise.resolve({ status: 200, headers: {}, body: "{}" });
        });

        const result = await run_connector(manifest, await code(), ctx);
        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(2);

        // eslint-disable-next-line @typescript-eslint/unbound-method, @typescript-eslint/no-non-null-assertion
        const post_raw = vi.mocked(ctx.http.post_raw!);
        expect(post_raw).toHaveBeenCalledTimes(1);
        expect(post_raw.mock.calls[0]?.[3]?.headers).toMatchObject({
            "next-action": "4444444444444444444444444444444444444444",
            "x-deployment-id": "dpl_PREFIX_TEST",
        });
    });

    it("does not false-trigger session expiration when 200 OK HTML contains forbidden router metadata", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("muse manifest missing");

        const rscBody = await fixture("subscription_sample.txt");
        const ctx = context(rscBody);
        ctx.http.get_raw = vi.fn().mockResolvedValue({
            status: 200,
            headers: {},
            body: '<html><head><div data-dpl-id="dpl_test" actionId="4012d49305cf4c3246eb4b75085a93bbe92fe7cec7"></div></head><script>self.__next_f.push([1,"{\\"notFound\\":\\"$undefined\\",\\"forbidden\\":\\"$undefined\\"}"])</script></html>',
        });

        const result = await run_connector(manifest, await code(), ctx);
        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(2);
    });

    it("supports ACTION_ID and DEPLOYMENT_ID overrides from parameters", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("muse manifest missing");

        const rscBody = await fixture("subscription_sample.txt");
        const ctx = context(rscBody);
        ctx.params["ACTION_ID"] = "custom_action_hash_override";
        ctx.params["DEPLOYMENT_ID"] = "dpl_custom_override";

        const result = await run_connector(manifest, await code(), ctx);
        expect(result.error).toBeNull();

        // eslint-disable-next-line @typescript-eslint/unbound-method, @typescript-eslint/no-non-null-assertion
        const post_raw = vi.mocked(ctx.http.post_raw!);
        expect(post_raw.mock.calls[0]?.[3]?.headers).toMatchObject({
            "next-action": "custom_action_hash_override",
            "x-deployment-id": "dpl_custom_override",
        });
    });

    it("throws ACTION_STALE when server rejects action ID with 404 or Invalid Server Action (A146 / AC-005)", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("muse manifest missing");

        const discovery_map = new Map<string, ConnectorDiscoveryEntry>();
        discovery_map.set("muse_subscription_action", {
            signature: "sig",
            action_id: "stale_id",
            deployment_id: "dpl_test",
            discovered_at: 1,
        });

        const ctx = context("Invalid Server Action", "hatch_sess=valid", 404, discovery_map);
        const result = await run_connector(manifest, await code(), ctx);
        expect(result.error).toMatch(/ACTION_STALE/);
        expect(result.observations).toHaveLength(0);
        // Cache must have been cleared
        expect(discovery_map.has("muse_subscription_action")).toBe(false);
    });

    it("rejects cookie with CRLF injection characters (A48 / AC-007)", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("muse manifest missing");

        const ctx = context("{}", "hatch_sess=val\r\nSet-Cookie: evil=1");
        const get_raw = vi.fn();
        const post_raw = vi.fn();
        ctx.http.get_raw = get_raw;
        ctx.http.post_raw = post_raw;

        const result = await run_connector(manifest, await code(), ctx);

        expect(result.error).toMatch(/CRLF/);
        expect(result.observations).toHaveLength(0);
        expect(get_raw).not.toHaveBeenCalled();
        expect(post_raw).not.toHaveBeenCalled();
    });

    it("reports failed account when percentUsed is missing instead of defaulting to 0 (A46 / AC-005)", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("muse manifest missing");

        // subscription 中的 usage 没有 percentUsed
        const raw_rsc =
            '1:{"subscription":{"tier":{"name":"Muse Pro"},"usage":{"state":"active"}}}';
        const ctx = context(raw_rsc);

        const result = await run_connector(manifest, await code(), ctx);
        expect(result.error).toBeNull();
        // 缺少 percentUsed 时不生成 weekly 假正常指标，而是上报 failed_accounts
        expect(result.observations.find((o) => o.metric_id === "muse:weekly")).toBeUndefined();
        expect(result.failed_accounts).toHaveLength(1);
        expect(result.failed_accounts[0]?.provider).toBe("muse");
        expect(result.failed_accounts[0]?.account_label).toBe("Muse Pro");
        expect(result.failed_accounts[0]?.error).toContain("percentUsed");
    });

    it("A138 / AC-003: handles empty subscription gracefully without throwing unhandled error", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("muse manifest missing");

        const raw_rsc = '1:{"subscription":null}';
        const ctx = context(raw_rsc);

        const result = await run_connector(manifest, await code(), ctx);
        expect(result.error).toContain("未能找到 subscription 节点");
        expect(result.observations).toHaveLength(0);
    });

    it("A138 / AC-003: handles truncated/malformed RSC stream gracefully", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("muse manifest missing");

        const malformed_rsc = '1:{"subscription":{"tier":{"name":"Broken';
        const ctx = context(malformed_rsc);

        const result = await run_connector(manifest, await code(), ctx);
        expect(result.error).toContain("未能找到 subscription 节点");
        expect(result.observations).toHaveLength(0);
    });

    it("AC-001: stops downloading subsequent chunks immediately when an earlier chunk matches target action", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("muse manifest missing");

        const rscBody = await fixture("subscription_sample.txt");
        const ctx = context(rscBody);

        const fetched_paths: string[] = [];
        ctx.http.get_raw = vi.fn().mockImplementation(async (_ep: string, path: string) => {
            fetched_paths.push(path);
            if (path === "/") {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: [
                        "<html><head>",
                        '<div data-dpl-id="dpl_STOP_ON_HIT"></div>',
                        '<script src="/_next/static/chunks/chunk_01.js"></script>',
                        '<script src="/_next/static/chunks/chunk_02.js"></script>',
                        '<script src="/_next/static/chunks/chunk_03.js"></script>',
                        '<script src="/_next/static/chunks/chunk_04.js"></script>',
                        '<script src="/_next/static/chunks/chunk_05.js"></script>',
                        '<script src="/_next/static/chunks/chunk_06.js"></script>',
                        '<script src="/_next/static/chunks/chunk_07.js"></script>',
                        '<script src="/_next/static/chunks/chunk_08.js"></script>',
                        '<script src="/_next/static/chunks/chunk_09.js"></script>',
                        '<script src="/_next/static/chunks/chunk_10.js"></script>',
                        "</head><body></body></html>",
                    ].join(""),
                });
            }
            if (path.includes("chunk_01.js")) {
                return Promise.resolve({ status: 200, headers: {}, body: "var a = 1;" });
            }
            if (path.includes("chunk_02.js")) {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: 'var fn = (0, O.createServerReference)("999900001111222233334444555566667777888899", O.callServer, void 0, O.map, "fetchSubscriptionAction");',
                });
            }
            await new Promise((r) => setTimeout(r, 20));
            return Promise.resolve({ status: 200, headers: {}, body: "var other = 999;" });
        });

        const result = await run_connector(manifest, await code(), ctx);
        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(2);

        // chunk_02 matched; later chunks like chunk_10 should not have been requested
        expect(fetched_paths.some((p) => p.includes("chunk_02.js"))).toBe(true);
        expect(fetched_paths.some((p) => p.includes("chunk_10.js"))).toBe(false);
    });

    it("AC-003 & AC-004: reuses discovery cache with 0 chunk downloads on matching signature and invalidates on signature drift", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("muse manifest missing");

        const rscBody = await fixture("subscription_sample.txt");
        const discovery_map = new Map<string, ConnectorDiscoveryEntry>();

        // 1. Initial run: discovers and saves to cache
        const ctx1 = context(rscBody, "hatch_sess=token", 200, discovery_map);
        let chunk_get_count = 0;
        ctx1.http.get_raw = vi.fn().mockImplementation((_ep: string, path: string) => {
            if (path === "/") {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: [
                        "<html><head>",
                        '<div data-dpl-id="dpl_CACHE_TEST"></div>',
                        '<script src="/_next/static/chunks/target.js"></script>',
                        "</head><body></body></html>",
                    ].join(""),
                });
            }
            chunk_get_count++;
            return Promise.resolve({
                status: 200,
                headers: {},
                body: 'var fn = (0, O.createServerReference)("aaaaaaaa11112222333344445555666677778888bb", O.callServer, void 0, O.map, "fetchSubscriptionAction");',
            });
        });

        const res1 = await run_connector(manifest, await code(), ctx1);
        expect(res1.error).toBeNull();
        expect(chunk_get_count).toBe(1);
        expect(discovery_map.has("muse_subscription_action")).toBe(true);

        // 2. Second run: same signature -> chunk downloads = 0
        const ctx2 = context(rscBody, "hatch_sess=token", 200, discovery_map);
        let run2_chunk_get_count = 0;
        ctx2.http.get_raw = vi.fn().mockImplementation((_ep: string, path: string) => {
            if (path === "/") {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: [
                        "<html><head>",
                        '<div data-dpl-id="dpl_CACHE_TEST"></div>',
                        '<script src="/_next/static/chunks/target.js"></script>',
                        "</head><body></body></html>",
                    ].join(""),
                });
            }
            run2_chunk_get_count++;
            return Promise.resolve({ status: 200, headers: {}, body: "" });
        });

        const res2 = await run_connector(manifest, await code(), ctx2);
        expect(res2.error).toBeNull();
        expect(res2.observations).toHaveLength(2);
        expect(run2_chunk_get_count).toBe(0); // 0 chunk GETs on cache hit!

        // 3. Third run: deployment changes -> cache invalidates and re-discovers
        const ctx3 = context(rscBody, "hatch_sess=token", 200, discovery_map);
        let run3_chunk_get_count = 0;
        ctx3.http.get_raw = vi.fn().mockImplementation((_ep: string, path: string) => {
            if (path === "/") {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: [
                        "<html><head>",
                        '<div data-dpl-id="dpl_NEW_DEPLOYMENT_V2"></div>',
                        '<script src="/_next/static/chunks/target_v2.js"></script>',
                        "</head><body></body></html>",
                    ].join(""),
                });
            }
            run3_chunk_get_count++;
            return Promise.resolve({
                status: 200,
                headers: {},
                body: 'var fn = (0, O.createServerReference)("cccccccc11112222333344445555666677778888dd", O.callServer, void 0, O.map, "fetchSubscriptionAction");',
            });
        });

        const res3 = await run_connector(manifest, await code(), ctx3);
        expect(res3.error).toBeNull();
        expect(run3_chunk_get_count).toBe(1); // Re-discovered!
    });

    it("AC-006: completes discovery and usage collection under 107 simulated chunks within budget", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("muse manifest missing");

        const rscBody = await fixture("subscription_sample.txt");
        const ctx = context(rscBody);

        const all_107_scripts = Array.from(
            { length: 107 },
            (_, i) =>
                `<script src="/_next/static/chunks/chunk_${String(i).padStart(3, "0")}.js"></script>`,
        ).join("");

        ctx.http.get_raw = vi.fn().mockImplementation((_ep: string, path: string) => {
            if (path === "/") {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: `<html><head><div data-dpl-id="dpl_107_TEST"></div>${all_107_scripts}</head><body></body></html>`,
                });
            }
            if (path.includes("chunk_003.js")) {
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    body: 'var fn = (0, O.createServerReference)("7777777711112222333344445555666677778888ee", O.callServer, void 0, O.map, "fetchSubscriptionAction");',
                });
            }
            return Promise.resolve({ status: 200, headers: {}, body: "var dummy = 123;" });
        });

        const budget = create_execution_budget(5000);
        const result = await run_connector(manifest, await code(), ctx, budget);
        expect(result.error).toBeNull();
        expect(result.observations.length).toBeGreaterThanOrEqual(2);
    });
});
