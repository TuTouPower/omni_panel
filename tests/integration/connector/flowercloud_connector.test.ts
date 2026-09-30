import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { load_manifest } from "../../../src/main/core/connector/manifest-loader";
import { run_connector } from "../../../src/main/core/connector/runtime";
import { compose_flower_sections } from "../../../src/main/core/session/flowercloud_dom";
import { is_auth_error } from "../../../src/shared/lib/auth-error";
import { FLOWERCLOUD_SNAPSHOT_FRESH_MS } from "../../../src/shared/constants";
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
    get_raw?: ReturnType<typeof vi.fn>;
    /** 需要断言日志时注入，避免直接引用 ctx.log.warn（unbound-method）。 */
    warn?: ReturnType<typeof vi.fn>;
}): ConnectorContext {
    const {
        clientarea_body = "",
        clientarea_status = 200,
        details_body = "",
        details_status = 200,
        cookie = "WHMCSUID=12345; WHMCSPW=hash; PHPSESSID=session123",
        warn = vi.fn(),
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
        },
        http: {
            get_raw,
            post_raw: vi.fn(),
            post_json: vi.fn(),
            get_json: vi.fn(),
        },
        files: { read: vi.fn(), list: vi.fn() },
        log: { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() },
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
        expect(manifest?.parameters.some((p) => p.name === "RESET_DAY")).toBe(false);
    });

    it("parses clientarea main page traffic ratio; keyword-only dates are ignored", async () => {
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
        // 列表卡无 plan-next-reset 专属元素：关键词日期不采信，reset_at 为 null（UI 隐藏重置列）。
        expect(obs.reset_at).toBeNull();
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
        // t537 gen_f001：单服务（HTTP 路径）保持 flowercloud_default。
        expect(obs.account_id).toBe("flowercloud_default");
        expect(get_raw).toHaveBeenCalledWith(
            "default",
            "/clientarea.php?action=productdetails&id=999",
            expect.anything(),
        );
    });

    it("prefers the plan-next-reset element over keyword dates", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("flowercloud manifest missing");

        // 真实快照结构：专属元素优先，即使关键词日期指向另一天也不被覆盖。
        const html = `
            <html><body>
                <p>已用流量：10.00 GB / 200.00 GB</p>
                <p class="plan-expires">到期日: 2026/12/01</p>
                <p class="plan-expires plan-next-reset">下次重置日: 2026/10/07</p>
            </body></html>
        `;
        const ctx = create_ctx({ clientarea_body: html });

        const result = await run_connector(manifest, await code(), ctx);
        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(1);
        expect(result.observations[0]?.reset_at).toBe(Date.parse("2026-10-07T00:00:00+08:00"));
    });

    it("ignores non-reset dates and returns null reset_at instead of fabricating", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("flowercloud manifest missing");

        // 真实快照含「最近使用」日期与弹窗到期日：都不是重置日，必须一律无视。
        const html = `
            <html><body>
                <p>已用流量：10.00 GB / 200.00 GB</p>
                <div class="usage-details"><div class="last-used"><span>最近使用: 2026-09-30</span></div></div>
                <div class="custom-modal-body"><p>当前周期：月付，到期日 2026-10-07</p></div>
            </body></html>
        `;
        const ctx = create_ctx({ clientarea_body: html });

        const result = await run_connector(manifest, await code(), ctx);
        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(1);
        const obs = result.observations[0];
        expect(obs).toBeDefined();
        if (!obs) return;
        expect(obs.used).toBe(10);
        expect(obs.limit).toBe(200);
        expect(obs.reset_at).toBeNull();
    });

    it("uses session DOM directly", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("flowercloud manifest missing");

        const live_html = await fixture("live_dashboard_sample.html");
        // captured_at 为必填语义（无捕获时间的旧载荷按过期处理，见下一条用例）。
        const secret = JSON.stringify({
            cookie: "cf_clearance=abc; PHPSESSID=xyz",
            html: live_html,
            captured_at: Date.now(),
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
        expect(result.observations[0]?.stale).toBe(false);
        // t537 gen_f001：单服务退化契约——历史序列连续性靠 flowercloud_default 锁定。
        expect(result.observations[0]?.account_id).toBe("flowercloud_default");
    });

    it("marks a stored flowercloud DOM stale when the snapshot is old", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("flowercloud manifest missing");

        const live_html = await fixture("live_dashboard_sample.html");
        const secret = JSON.stringify({
            cookie: "cf_clearance=abc; PHPSESSID=xyz",
            html: live_html,
            captured_at: Date.now() - 60 * 60 * 1000,
        });
        const ctx = create_ctx({
            cookie: secret,
            clientarea_body: "Just a moment...",
            clientarea_status: 403,
        });

        const result = await run_connector(manifest, await code(), ctx);
        expect(result.error).toBeNull();
        expect(result.observations[0]?.used).toBe(297.11);
        expect(result.observations[0]?.stale).toBe(true);
    });

    it("A6: marks a future-dated snapshot stale instead of forever fresh", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("flowercloud manifest missing");

        const live_html = await fixture("live_dashboard_sample.html");
        // 时钟回拨 / 迁移旧载荷：captured_at 在未来 → 负年龄 → 按过期处理。
        const secret = JSON.stringify({
            cookie: "cf_clearance=abc; PHPSESSID=xyz",
            html: live_html,
            captured_at: Date.now() + 60_000,
        });
        const ctx = create_ctx({
            cookie: secret,
            clientarea_body: "Just a moment...",
            clientarea_status: 403,
        });

        const result = await run_connector(manifest, await code(), ctx);
        expect(result.error).toBeNull();
        expect(result.observations[0]?.used).toBe(297.11);
        expect(result.observations[0]?.stale).toBe(true);
    });

    it("marks a stored flowercloud DOM stale when it has no capture time", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("flowercloud manifest missing");

        const live_html = await fixture("live_dashboard_sample.html");
        // 旧格式载荷（无 captured_at）：年龄未知，按过期处理而不是当成实时数据。
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
        expect(result.observations[0]?.used).toBe(297.11);
        expect(result.observations[0]?.stale).toBe(true);
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

    it("keeps the connector snapshot freshness aligned with the host constant", async () => {
        // connector 是独立脚本，不能 import 宿主常量，只能靠这份契约测试盯住漂移。
        const source = await code();
        const match = /const SNAPSHOT_FRESH_MS\s*=\s*([0-9_\s*]+);/.exec(source);
        const expression = match?.[1];
        if (!expression) throw new Error("SNAPSHOT_FRESH_MS not found in connector source");
        const connector_value = expression
            .split("*")
            .map((factor) => Number(factor.replaceAll("_", "").trim()))
            .reduce((product, factor) => product * factor, 1);

        expect(connector_value).toBe(FLOWERCLOUD_SNAPSHOT_FRESH_MS);
    });

    it("AC-001: multi-service list snapshot emits one observation per service without HTTP", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("flowercloud manifest missing");

        const html = await fixture("clientarea_multi_sample.html");
        const get_raw = vi.fn();
        const ctx = create_ctx({
            cookie: JSON.stringify({ cookie: "WHMCS=kept", html, captured_at: Date.now() }),
            clientarea_body: "Just a moment...",
            clientarea_status: 403,
            get_raw,
        });

        const result = await run_connector(manifest, await code(), ctx);

        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(3);
        expect(result.observations.map((obs) => obs.account_id)).toEqual([
            "flowercloud_service_8848",
            "flowercloud_service_8849",
            "flowercloud_service_8850",
        ]);
        expect(result.observations.map((obs) => obs.account_label)).toEqual([
            "Global Acceleration Lite",
            "Global Acceleration Plus",
            "Global Acceleration Max",
        ]);
        expect(result.observations.map((obs) => [obs.used, obs.limit])).toEqual([
            [34.56, 150],
            [77.1, 400],
            [1228.8, 2048],
        ]);
        // metric_id 同为月流量，但 (account_id, metric_id) 组合唯一、标签可读。
        const pairs = result.observations.map((obs) => `${obs.account_id}|${obs.metric_id}`);
        expect(new Set(pairs).size).toBe(3);
        expect(result.observations.every((obs) => obs.metric_id === "flowercloud:traffic")).toBe(
            true,
        );
        expect(result.observations.every((obs) => !obs.stale)).toBe(true);
        // 列表卡无专属元素：用量照常解析，重置日为 null（抓不到就抓不到，不编造）。
        expect(result.observations.every((obs) => obs.reset_at === null)).toBe(true);
        // 快照已含全部服务用量 → 零网络请求（clientarea 403 不会被碰到）。
        expect(get_raw).not.toHaveBeenCalled();
    });

    it("AC-001: composite snapshot sections map to per-service observations", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("flowercloud manifest missing");

        // 宿主 compose_flower_sections 的分段格式（沙箱边界：connector 复刻解析）。
        const composite = [
            '<!--omni-flower id=8848--><p>流量使用 10.00GB / 100GB</p><span class="product-name">Global Acceleration Lite</span><p>下次付款日期：2026-10-18 (月付)</p><!--/omni-flower-->',
            '<!--omni-flower id=8849--><p>流量使用 20.00GB / 200GB</p><span class="product-name">Global Acceleration Plus</span><!--/omni-flower-->',
        ].join("\n");
        const get_raw = vi.fn();
        const ctx = create_ctx({
            cookie: JSON.stringify({
                cookie: "WHMCS=kept",
                html: composite,
                captured_at: Date.now(),
            }),
            get_raw,
        });

        const result = await run_connector(manifest, await code(), ctx);

        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(2);
        expect(result.observations.map((obs) => obs.account_id)).toEqual([
            "flowercloud_service_8848",
            "flowercloud_service_8849",
        ]);
        expect(result.observations.map((obs) => [obs.used, obs.limit])).toEqual([
            [10, 100],
            [20, 200],
        ]);
        expect(get_raw).not.toHaveBeenCalled();
    });

    it("A2: host compose_flower_sections output round-trips through the real connector", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("flowercloud manifest missing");

        // 宿主真实输出（非手写字面量）：两侧分段格式漂移时本用例变红。
        const composite = compose_flower_sections([
            {
                id: "8848",
                html: '<p>流量使用 10.00GB / 100GB</p><span class="product-name">Global Acceleration Lite</span>',
            },
            {
                id: "8850",
                error: "花云要求完成人机验证（Cloudflare 质询），本轮未取到新数据",
            },
        ]);
        const get_raw = vi.fn();
        const ctx = create_ctx({
            cookie: JSON.stringify({
                cookie: "WHMCS=kept",
                html: composite,
                captured_at: Date.now(),
            }),
            get_raw,
        });

        const result = await run_connector(manifest, await code(), ctx);

        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(1);
        expect(result.observations[0]?.account_id).toBe("flowercloud_service_8848");
        expect(result.observations[0]?.used).toBe(10);
        expect(result.failed_accounts).toHaveLength(1);
        expect(result.failed_accounts[0]?.account_id).toBe("flowercloud_service_8850");
        expect(result.failed_accounts[0]?.error).toContain("人机验证");
        expect(get_raw).not.toHaveBeenCalled();
    });

    it("AC-002: failed service in composite is reported without blocking the others", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("flowercloud manifest missing");

        const composite = [
            '<!--omni-flower id=8848--><p>流量使用 10.00GB / 100GB</p><span class="product-name">Global Acceleration Lite</span><!--/omni-flower-->',
            '<!--omni-flower id=8850 error="花云要求完成人机验证（Cloudflare 质询），本轮未取到新数据"--><!--/omni-flower-->',
        ].join("\n");
        const ctx = create_ctx({
            cookie: JSON.stringify({
                cookie: "WHMCS=kept",
                html: composite,
                captured_at: Date.now(),
            }),
        });

        const result = await run_connector(manifest, await code(), ctx);

        // 整体不失败：健康服务照常输出，失败服务走既有 failed_accounts 语义
        //（runtime 用 wrapper 收集，ctx 上的 spy 不会被调用，断言走 result）。
        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(1);
        expect(result.observations[0]?.account_id).toBe("flowercloud_service_8848");
        expect(result.failed_accounts).toHaveLength(1);
        const composite_failed = result.failed_accounts[0];
        expect(composite_failed?.provider).toBe("flowercloud");
        expect(composite_failed?.account_id).toBe("flowercloud_service_8850");
        expect(composite_failed?.account_label).toBe("服务 8850");
        expect(composite_failed?.error).toContain("人机验证");
    });

    it("AC-003: list-only snapshot fetches each service details page; fetch failure isolates (AC-002)", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("flowercloud manifest missing");

        // 快照只有服务列表：无任何用量数字，靠逐服务 HTTP 详情页取数。
        const list_only = [
            '<a href="clientarea.php?action=productdetails&amp;id=9601">Global Acceleration Lite</a>',
            '<a href="clientarea.php?action=productdetails&amp;id=9602">Global Acceleration Plus</a>',
        ].join("\n");
        const details_ok =
            "<li>产品/服务：Global Acceleration Lite</li><li>下次付款日期：2026-10-18 (月付)</li>" +
            "<header>用量图表 (带宽：150.00 GB)</header><p>已用 (34.56 GB)</p>";
        const get_raw = vi.fn().mockImplementation((_endpoint: string, path: string) => {
            if (path.includes("id=9601")) {
                return Promise.resolve({
                    status: 200,
                    headers: { "content-type": "text/html; charset=utf-8" },
                    body: details_ok,
                });
            }
            if (path.includes("id=9602")) {
                return Promise.resolve({
                    status: 403,
                    headers: { "content-type": "text/html; charset=utf-8" },
                    body: "<title>Just a moment...</title><div class='cf-challenge'></div>",
                });
            }
            if (path === "/clientarea.php") {
                return Promise.resolve({
                    status: 200,
                    headers: { "content-type": "text/html; charset=utf-8" },
                    body: list_only,
                });
            }
            return Promise.reject(new Error(`Unexpected path: ${path}`));
        });
        const ctx = create_ctx({
            cookie: JSON.stringify({ cookie: "WHMCS=kept", html: list_only, captured_at: 1 }),
            get_raw,
        });

        const result = await run_connector(manifest, await code(), ctx);

        expect(result.error).toBeNull();
        // 9601 补数成功（HTTP 当场取到 → 不标 stale）；9602 质询失败 → 显式登记。
        expect(result.observations).toHaveLength(1);
        expect(result.observations[0]).toMatchObject({
            account_id: "flowercloud_service_9601",
            account_label: "Global Acceleration Lite",
            used: 34.56,
            limit: 150,
            stale: false,
        });
        expect(get_raw).toHaveBeenCalledWith(
            "default",
            "/clientarea.php?action=productdetails&id=9601",
            expect.anything(),
        );
        expect(get_raw).toHaveBeenCalledWith(
            "default",
            "/clientarea.php?action=productdetails&id=9602",
            expect.anything(),
        );
        expect(result.failed_accounts).toHaveLength(1);
        const fetch_failed = result.failed_accounts[0];
        expect(fetch_failed?.provider).toBe("flowercloud");
        expect(fetch_failed?.account_id).toBe("flowercloud_service_9602");
        expect(typeof fetch_failed?.account_label).toBe("string");
        expect(fetch_failed?.error).toContain("人机验证");
    });

    it("AC-002/s041: any incomplete card window discards all window results and refetches", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("flowercloud manifest missing");

        // 链接在卡首（结构错位）：卡窗切片会把 7701 的用量错配给 7702（s041 实测）。
        // 生产规则：任一窗口不完整 → 整体丢弃窗口结果，逐服务 HTTP 详情页补数。
        const link_first = [
            '<div class="card"><a href="clientarea.php?action=productdetails&amp;id=7701">管理</a>',
            '<span class="product-name">Global Acceleration Lite</span>',
            "<p>已用流量：10.00 GB / 150.00 GB</p></div>",
            '<div class="card"><a href="clientarea.php?action=productdetails&amp;id=7702">管理</a>',
            '<span class="product-name">Global Acceleration Plus</span>',
            "<p>已用流量：20.00 GB / 400.00 GB</p></div>",
        ].join("\n");
        const get_raw = vi.fn().mockImplementation((_endpoint: string, path: string) => {
            const details = path.includes("id=7701")
                ? "<li>产品/服务：Global Acceleration Lite</li><li>下次付款日期：2026-10-18 (月付)</li><header>带宽：150.00 GB</header><p>已用 (55.00 GB)</p>"
                : "<li>产品/服务：Global Acceleration Plus</li><header>带宽：400.00 GB</header><p>已用 (66.00 GB)</p>";
            return Promise.resolve({
                status: 200,
                headers: { "content-type": "text/html; charset=utf-8" },
                body: details,
            });
        });
        const ctx = create_ctx({
            cookie: JSON.stringify({
                cookie: "WHMCS=kept",
                html: link_first,
                captured_at: Date.now(),
            }),
            get_raw,
        });

        const result = await run_connector(manifest, await code(), ctx);

        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(2);
        // 断言取自详情页补数而非错配的卡窗值（7702 绝不能是 10/150）。
        expect(result.observations.map((obs) => [obs.account_id, obs.used, obs.limit])).toEqual([
            ["flowercloud_service_7701", 55, 150],
            ["flowercloud_service_7702", 66, 400],
        ]);
        expect(get_raw).toHaveBeenCalledWith(
            "default",
            "/clientarea.php?action=productdetails&id=7701",
            expect.anything(),
        );
        expect(get_raw).toHaveBeenCalledWith(
            "default",
            "/clientarea.php?action=productdetails&id=7702",
            expect.anything(),
        );
    });
});
