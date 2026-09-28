import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { load_manifest } from "../../../src/main/core/connector/manifest-loader";
import { run_connector } from "../../../src/main/core/connector/runtime";
import { is_auth_error } from "../../../src/shared/lib/auth-error";
import type { ConnectorContext } from "../../../src/main/core/connector/host-io";
import { ctx_budget_stub, ctx_status } from "./_ctx_status";

const ROOT = join(process.cwd(), "connectors", "flowercloud");

const fixture = async (name: string): Promise<string> => {
    return readFile(join(process.cwd(), "tests/fixtures/connector/flowercloud", name), "utf8");
};

function create_ctx(options: {
    clientarea_body?: string;
    clientarea_status?: number;
    details_body?: string;
    details_status?: number;
    cookie?: string;
    reset_day?: string;
    get_raw?: ReturnType<typeof vi.fn>;
}): ConnectorContext {
    const {
        clientarea_body = "",
        clientarea_status = 200,
        details_body = "",
        details_status = 200,
        cookie = "WHMCSUID=12345; WHMCSPW=hash; PHPSESSID=session123",
        reset_day,
        get_raw = vi.fn().mockImplementation((_endpoint: string, path: string) => {
            if (path === "/clientarea.php") {
                return Promise.resolve({
                    status: clientarea_status,
                    headers: { "content-type": "text/html; charset=utf-8" },
                    body: clientarea_body,
                });
            }
            if (path.startsWith("/clientarea.php?action=productdetails")) {
                return Promise.resolve({
                    status: details_status,
                    headers: { "content-type": "text/html; charset=utf-8" },
                    body: details_body,
                });
            }
            return Promise.reject(new Error(`Unexpected path: ${path}`));
        }),
    } = options;

    return {
        ...ctx_budget_stub,
        params: {
            SESSION_COOKIE: cookie,
            ...(reset_day ? { RESET_DAY: reset_day } : {}),
        },
        http: {
            get_raw,
            post_raw: vi.fn(),
            post_json: vi.fn(),
            get_json: vi.fn(),
        },
        files: { read: vi.fn(), list: vi.fn() },
        log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        status: ctx_status,
        report_failed_account: vi.fn(),
    };
}

async function code(): Promise<string> {
    return readFile(join(ROOT, "connector.ts"), "utf8");
}

describe("flowercloud connector", () => {
    it("declares session web_login in manifest", async () => {
        const manifest = await load_manifest(ROOT);
        expect(manifest).not.toBeNull();
        expect(manifest?.capabilities).toContain("session");
        expect(manifest?.auth).toEqual({
            method: "web_login",
            secret_name: "SESSION_COOKIE",
            login_url: "https://api-flowercloud.com/clientarea.php",
        });
        expect(manifest?.loginDomains).toContain("api-flowercloud.com");
        expect(manifest?.cookieNames).toContain("*");
        expect(manifest?.parameters.some((p) => p.name === "RESET_DAY")).toBe(true);
    });

    it("parses clientarea main page with traffic ratio and next due date", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("flowercloud manifest missing");

        const html = await fixture("clientarea_sample.html");
        const ctx = create_ctx({ clientarea_body: html });

        const result = await run_connector(manifest, await code(), ctx);
        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(1);

        const obs = result.observations[0];
        expect(obs).toBeDefined();
        if (!obs) return;
        expect(obs).toMatchObject({
            provider: "flowercloud",
            metric_id: "flowercloud:traffic",
            raw_label: "monthly_traffic",
            normalized_label: "月流量",
            window: "month",
            account_label: "Global Acceleration Lite",
            used: 34.56,
            limit: 150,
            display_style: "ratio",
            status: "normal",
            source: "session",
        });
        expect(obs.reset_at).toBe(Date.parse("2026-10-18T00:00:00+08:00"));
    });

    it("parses real FlowerCloud dashboard live output with Global Acceleration Max and 2026/10/07 reset", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("flowercloud manifest missing");

        const live_html = await fixture("live_dashboard_sample.html");
        const ctx = create_ctx({ clientarea_body: live_html });

        const result = await run_connector(manifest, await code(), ctx);
        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(1);

        const obs = result.observations[0];
        expect(obs).toBeDefined();
        if (!obs) return;
        expect(obs).toMatchObject({
            provider: "flowercloud",
            metric_id: "flowercloud:traffic",
            raw_label: "monthly_traffic",
            normalized_label: "月流量",
            window: "month",
            account_label: "Global Acceleration Max",
            used: 297.11,
            limit: 1000,
            display_style: "ratio",
            status: "normal",
            source: "session",
        });
        expect(obs.reset_at).toBe(Date.parse("2026-10-07T00:00:00+08:00"));
    });

    it("follows product details link if clientarea overview lacks traffic statistics", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("flowercloud manifest missing");

        const overview_html = `
            <html><body>
                <h1>我的控制台</h1>
                <a href="clientarea.php?action=productdetails&id=999">查看详情</a>
            </body></html>
        `;
        const details_html = await fixture("productdetails_sample.html");
        const get_raw = vi.fn().mockImplementation((_endpoint: string, path: string) => {
            if (path === "/clientarea.php") {
                return Promise.resolve({
                    status: 200,
                    headers: { "content-type": "text/html; charset=utf-8" },
                    body: overview_html,
                });
            }
            if (path.startsWith("/clientarea.php?action=productdetails")) {
                return Promise.resolve({
                    status: 200,
                    headers: { "content-type": "text/html; charset=utf-8" },
                    body: details_html,
                });
            }
            return Promise.reject(new Error(`Unexpected path: ${path}`));
        });
        const ctx = create_ctx({
            get_raw,
        });

        const result = await run_connector(manifest, await code(), ctx);
        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(1);

        const obs = result.observations[0];
        expect(obs).toBeDefined();
        if (!obs) return;
        expect(obs).toMatchObject({
            provider: "flowercloud",
            metric_id: "flowercloud:traffic",
            account_label: "Global Acceleration Plus",
            used: 88.5,
            limit: 400,
            status: "normal",
        });
        expect(obs.reset_at).toBe(Date.parse("2026-11-05T00:00:00+08:00"));
        expect(get_raw).toHaveBeenCalledWith(
            "default",
            "/clientarea.php?action=productdetails&id=999",
            expect.anything(),
        );
    });

    it("uses optional RESET_DAY when nextduedate is absent from HTML", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("flowercloud manifest missing");

        const html = `
            <html><body>
                <p>已用流量：10.00 GB / 200.00 GB</p>
            </body></html>
        `;
        const ctx = create_ctx({
            clientarea_body: html,
            reset_day: "20",
        });

        const result = await run_connector(manifest, await code(), ctx);
        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(1);

        const obs = result.observations[0];
        expect(obs).toBeDefined();
        if (!obs) return;
        expect(obs.used).toBe(10);
        expect(obs.limit).toBe(200);
        expect(obs.reset_at).not.toBeNull();
        if (obs.reset_at !== null) {
            const reset_date = new Date(obs.reset_at);
            expect(reset_date.getDate()).toBe(20);
        }
    });

    it("uses session DOM directly", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("flowercloud manifest missing");

        const live_html = await fixture("live_dashboard_sample.html");
        const secret = JSON.stringify({
            cookie: "cf_clearance=abc; PHPSESSID=xyz",
            html: live_html,
        });

        const ctx = create_ctx({
            cookie: secret,
            clientarea_body: "Just a moment...",
            clientarea_status: 403,
        });

        const result = await run_connector(manifest, await code(), ctx);
        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(1);
        expect(result.observations[0]?.used).toBe(297.11);
        expect(result.observations[0]?.limit).toBe(1000);
    });

    it("throws challenge error when blocked by Cloudflare turnstile and no session DOM is provided", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("flowercloud manifest missing");

        const ctx = create_ctx({
            cookie: "cf_clearance=abc; PHPSESSID=xyz",
            clientarea_body: "Just a moment...",
            clientarea_status: 403,
        });

        const result = await run_connector(manifest, await code(), ctx);
        expect(result.error).not.toBeNull();
        expect(result.error).toContain("Cloudflare");
        if (result.error) {
            expect(is_auth_error(result.error)).toBe(true);
        }
    });

    it("throws recognized auth error when HTTP 401 is returned", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("flowercloud manifest missing");

        const ctx = create_ctx({
            clientarea_body: "Unauthorized",
            clientarea_status: 401,
        });

        const result = await run_connector(manifest, await code(), ctx);
        expect(result.error).not.toBeNull();
        if (result.error) {
            expect(is_auth_error(result.error)).toBe(true);
        }
    });

    it("throws recognized auth error when redirected to login page", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("flowercloud manifest missing");

        const html = await fixture("login_page.html");
        const ctx = create_ctx({ clientarea_body: html });

        const result = await run_connector(manifest, await code(), ctx);
        expect(result.error).not.toBeNull();
        expect(result.error).toContain("FlowerCloud 登录会话已失效");
        if (result.error) {
            expect(is_auth_error(result.error)).toBe(true);
        }
    });

    it("throws challenge error when blocked by Cloudflare turnstile", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("flowercloud manifest missing");

        const html = await fixture("cloudflare_challenge.html");
        const ctx = create_ctx({
            clientarea_body: html,
            clientarea_status: 403,
        });

        const result = await run_connector(manifest, await code(), ctx);
        expect(result.error).not.toBeNull();
        expect(result.error).toContain("Cloudflare");
        if (result.error) {
            expect(is_auth_error(result.error)).toBe(true);
        }
    });

    it("throws error when SESSION_COOKIE is missing", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("flowercloud manifest missing");

        const ctx = create_ctx({ cookie: "" });

        const result = await run_connector(manifest, await code(), ctx);
        expect(result.error).not.toBeNull();
        expect(result.error).toContain("SESSION_COOKIE");
    });
});
