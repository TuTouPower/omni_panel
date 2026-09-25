import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { load_manifest } from "../../../src/main/core/connector/manifest-loader";
import { run_connector } from "../../../src/main/core/connector/runtime";
import { is_auth_error } from "../../../src/shared/lib/auth-error";
import type { ConnectorContext } from "../../../src/main/core/connector/host-io";

const ROOT = join(process.cwd(), "connectors", "muse");

const fixture = async (name: string): Promise<string> => {
    return readFile(join(process.cwd(), "tests/fixtures/connector/muse", name), "utf8");
};

function context(
    body: string,
    cookie = "hatch_sess=test-session-token",
    status = 200,
): ConnectorContext {
    return {
        params: { SESSION_COOKIE: cookie },
        http: {
            get_raw: vi.fn().mockResolvedValue({
                status: 200,
                headers: {},
                body: '<script>var d = { deploymentId: "dpl_8qUvxpGTkFRhdjPKF4KXaVBdQCk3", actionId: "407c800bb93d1539e5152b02e7f8ed6a82a7729a86" };</script>',
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
            "next-action": "407c800bb93d1539e5152b02e7f8ed6a82a7729a86",
            Origin: "https://muse.ai",
            Referer: "https://muse.ai/",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Dest": "empty",
            "x-deployment-id": "dpl_8qUvxpGTkFRhdjPKF4KXaVBdQCk3",
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

    it("falls back to baseline action and deployment IDs when HTML does not contain them", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("muse manifest missing");

        const rscBody = await fixture("subscription_sample.txt");
        const ctx = context(rscBody);
        ctx.http.get_raw = vi.fn().mockResolvedValue({
            status: 200,
            headers: {},
            body: "<html><body>no ids here</body></html>",
        });

        const result = await run_connector(manifest, await code(), ctx);
        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(2);

        // eslint-disable-next-line @typescript-eslint/unbound-method, @typescript-eslint/no-non-null-assertion
        const post_raw = vi.mocked(ctx.http.post_raw!);
        expect(post_raw.mock.calls[0]?.[3]?.headers).toMatchObject({
            "next-action": "407c800bb93d1539e5152b02e7f8ed6a82a7729a86",
            "x-deployment-id": "dpl_8qUvxpGTkFRhdjPKF4KXaVBdQCk3",
        });
    });

    it("throws MUSE_ACTION_STALE when server rejects action ID with 404 or Invalid Server Action (A146 / AC-006)", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("muse manifest missing");

        const ctx = context("Invalid Server Action", "hatch_sess=valid", 404);
        const result = await run_connector(manifest, await code(), ctx);
        expect(result.error).toMatch(/MUSE_ACTION_STALE/);
        expect(result.observations).toHaveLength(0);
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
});
