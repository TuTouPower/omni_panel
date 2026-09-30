import { describe, expect, it, vi } from "vitest";
import {
    compose_flower_sections,
    flower_failure_reason,
    flower_service_ids,
    is_flowercloud_snapshot_fresh,
    run_flowercloud_snapshot,
    seed_partition_cookies,
    write_flowercloud_html,
} from "../../../src/main/core/session/flowercloud_dom";
import type {
    SessionController,
    SessionWindow,
} from "../../../src/main/core/session/session-types";
import type { VaultBackend } from "../../../src/main/core/vault/vault-backend";

const LOGIN_URL = "https://api-flowercloud.com/clientarea.php";
const KEY = "flower-1:SESSION_COOKIE";
const USAGE_HTML = "<p>流量使用 331.40GB / 1000GB</p>";
const OLD_SECRET = JSON.stringify({
    cookie: "WHMCS=kept",
    html: "<p>流量使用 1GB / 1000GB</p>",
    captured_at: 1,
});

/**
 * 假窗口带三个「前台化」探针：抓取路径若调用它们，计数即可暴露回归
 * （AC-001：采集窗不得 show / showInactive / setOpacity）。
 */
type ProbedWindow = SessionWindow & {
    closed: boolean;
    shown: number;
    shown_inactive: number;
    opacity_calls: number;
    readonly loaded_urls: string[];
    // SessionWindow 已不声明前台化方法；这里显式挂上探针，任何调用都会被计数。
    show(): void;
    showInactive(): void;
    setOpacity(value: number): void;
};

function create_window(html: string): ProbedWindow {
    const win: ProbedWindow = {
        closed: false,
        shown: 0,
        shown_inactive: 0,
        opacity_calls: 0,
        loaded_urls: [],
        loadURL: vi.fn(() => Promise.resolve()),
        close(): void {
            win.closed = true;
        },
        isDestroyed(): boolean {
            return win.closed;
        },
        on(): ProbedWindow {
            return win;
        },
        read_html: () => Promise.resolve(html),
        show(): void {
            win.shown += 1;
        },
        showInactive(): void {
            win.shown_inactive += 1;
        },
        setOpacity(): void {
            win.opacity_calls += 1;
        },
    };
    return win;
}

function create_vault(): VaultBackend & {
    values: Map<string, string>;
    set_mock: ReturnType<typeof vi.fn>;
} {
    const values = new Map<string, string>();
    const set_mock = vi.fn((key: string, value: string) => {
        values.set(key, value);
        return Promise.resolve();
    });
    return {
        values,
        set_mock,
        get: vi.fn((key: string) => Promise.resolve(values.get(key) ?? null)),
        set: set_mock,
        delete: vi.fn((key: string) => {
            values.delete(key);
            return Promise.resolve();
        }),
        has: vi.fn((key: string) => Promise.resolve(values.has(key))),
        list_keys: vi.fn((prefix?: string) =>
            Promise.resolve([...values.keys()].filter((key) => !prefix || key.startsWith(prefix))),
        ),
        replaceAll: vi.fn((entries: Record<string, string>) => {
            values.clear();
            for (const [key, value] of Object.entries(entries)) values.set(key, value);
            return Promise.resolve();
        }),
    };
}

function create_session(): SessionController {
    return {
        on_before_send_headers: vi.fn(),
        get_cookies: vi.fn(() => Promise.resolve([{ name: "WHMCSUserID", value: "42" }])),
    };
}

/**
 * t537：可导航窗口——loadURL 按路由切换 html；未登记的 URL 落到 fallback
 * （默认无用量页），模拟「页面没渲染出用量」而不是沿用上一页（避免假捕获）。
 */
function create_nav_window(
    routes: Record<string, string>,
    start_html: string,
    fallback_html = "<html><body>加载中…</body></html>",
): ProbedWindow {
    const win = create_window(start_html);
    let current = start_html;
    win.read_html = () => Promise.resolve(current);
    win.loadURL = vi.fn((url: string) => {
        win.loaded_urls.push(url);
        current = routes[url] ?? fallback_html;
        return Promise.resolve();
    });
    return win;
}

describe("flowercloud_dom", () => {
    describe("write_flowercloud_html", () => {
        it("refuses to write once the refresh has been cancelled", async () => {
            const vault = create_vault();
            await vault.set(KEY, OLD_SECRET);

            const written = await write_flowercloud_html(vault, "flower-1", USAGE_HTML, null, {
                is_cancelled: () => true,
            });

            expect(written).toBe(false);
            expect(vault.set_mock).toHaveBeenCalledTimes(1); // 只有测试自己的预置写入
            expect(vault.values.get(KEY)).toBe(OLD_SECRET);
        });

        it("refuses to overwrite a session that changed while capturing", async () => {
            const vault = create_vault();
            const fresh_secret = JSON.stringify({
                cookie: "WHMCS=new",
                html: "<p>流量使用 400GB / 1000GB</p>",
                captured_at: Date.now(),
            });
            let gets = 0;
            vault.get = vi.fn(() => {
                gets += 1;
                // 第一次读旧值，落盘前复核时读到新登录/新快照写入的值。
                return Promise.resolve(gets === 1 ? OLD_SECRET : fresh_secret);
            });

            const written = await write_flowercloud_html(vault, "flower-1", USAGE_HTML, null);

            expect(written).toBe(false);
            expect(vault.set_mock).not.toHaveBeenCalled();
        });

        it("A4: skips the write when the vault changed after the capture started", async () => {
            const vault = create_vault();
            await vault.set(KEY, OLD_SECRET);
            const fresh_secret = JSON.stringify({
                cookie: "WHMCS=new",
                html: "<p>流量使用 400GB / 1000GB</p>",
                captured_at: Date.now(),
            });
            // 捕获起点基线是 OLD_SECRET；写入前 vault 已被外部更新为 fresh_secret。
            vault.get = vi.fn(() => Promise.resolve(fresh_secret));

            const written = await write_flowercloud_html(vault, "flower-1", USAGE_HTML, null, {
                expected_vault_value: OLD_SECRET,
            });

            expect(written).toBe(false);
            expect(vault.set_mock).toHaveBeenCalledTimes(1); // 只有测试自己的预置写入
        });

        it("A4: writes when the vault still matches the capture-start baseline", async () => {
            const vault = create_vault();
            await vault.set(KEY, OLD_SECRET);

            const written = await write_flowercloud_html(vault, "flower-1", USAGE_HTML, null, {
                expected_vault_value: OLD_SECRET,
            });

            expect(written).toBe(true);
            expect(vault.values.get(KEY)).toContain("331.40GB");
        });

        it("A6: treats a negative-age snapshot as expired", () => {
            const fresh = {
                cookie: "WHMCS=kept",
                html: "<p>流量使用 1GB / 1000GB</p>",
                captured_at: Date.now(),
            };
            expect(is_flowercloud_snapshot_fresh(fresh)).toBe(true);
            // 时钟回拨 / 迁移旧载荷：captured_at 在未来 → 负年龄 → 过期。
            expect(
                is_flowercloud_snapshot_fresh({ ...fresh, captured_at: Date.now() + 60_000 }),
            ).toBe(false);
            // 远古快照（年龄超新鲜期）同样过期。
            expect(is_flowercloud_snapshot_fresh({ ...fresh, captured_at: 1 })).toBe(false);
            expect(is_flowercloud_snapshot_fresh({ cookie: "WHMCS=kept" })).toBe(false);
        });

        it("writes when neither cancellation nor a concurrent change happened", async () => {
            const vault = create_vault();
            await vault.set(KEY, OLD_SECRET);

            const written = await write_flowercloud_html(vault, "flower-1", USAGE_HTML, null, {
                is_cancelled: () => false,
            });

            expect(written).toBe(true);
            expect(vault.values.get(KEY)).toContain("331.40GB");
        });
    });

    describe("seed_partition_cookies", () => {
        function create_seeding_session(): SessionController & {
            readonly seeded: { url: string; name: string; value: string }[];
        } {
            const seeded: { url: string; name: string; value: string }[] = [];
            return {
                seeded,
                on_before_send_headers: vi.fn(),
                get_cookies: vi.fn(() => Promise.resolve([])),
                set_cookie: vi.fn((url: string, name: string, value: string) => {
                    seeded.push({ url, name, value });
                    return Promise.resolve();
                }),
            };
        }

        it("A1: skips cookie parts that fail the safety check", async () => {
            const vault = create_vault();
            await vault.set(KEY, "WHMCS=ok; evil=bad\r\nvalue; cf_clearance=abc");
            const session = create_seeding_session();

            await seed_partition_cookies(session, vault, "flower-1", LOGIN_URL);

            const names = session.seeded.map((s) => s.name);
            expect(names).toContain("WHMCS");
            expect(names).toContain("cf_clearance");
            expect(names).not.toContain("evil");
        });

        it("A13: seeds nothing when the payload is a broken JSON without cookie", async () => {
            const vault = create_vault();
            await vault.set(KEY, '{"nonsense": 1}');
            const session = create_seeding_session();

            await seed_partition_cookies(session, vault, "flower-1", LOGIN_URL);

            expect(session.seeded).toHaveLength(0);
        });
    });

    describe("run_flowercloud_snapshot", () => {
        it("does not write when the window is closed while reading cookies", async () => {
            const vault = create_vault();
            await vault.set(KEY, OLD_SECRET);
            const session = create_session();
            let cancelled = false;
            let calls = 0;
            session.get_cookies = vi.fn(() => {
                calls += 1;
                // 第一次是开头的 jar 读取；第二次是写回前取新 cookie，
                // 此时用户关掉窗口（宿主会同步把 cancelled 置真）。
                if (calls >= 2) cancelled = true;
                return Promise.resolve([{ name: "WHMCSUserID", value: "42" }]);
            });

            const outcome = await run_flowercloud_snapshot({
                window: create_window(USAGE_HTML),
                session,
                vault,
                instance_id: "flower-1",
                login_url: LOGIN_URL,
                is_cancelled: () => cancelled,
                options: { poll_ms: 5, settle_ms: 0, timeout_ms: 500 },
            });

            expect(outcome.written).toBe(false);
            expect(outcome.kind).toBe("cancelled");
            expect(vault.values.get(KEY)).toBe(OLD_SECRET);
        });

        it("writes the snapshot when the usage page is captured", async () => {
            const vault = create_vault();
            await vault.set(KEY, OLD_SECRET);

            const outcome = await run_flowercloud_snapshot({
                window: create_window(USAGE_HTML),
                session: create_session(),
                vault,
                instance_id: "flower-1",
                login_url: LOGIN_URL,
                is_cancelled: () => false,
                options: { poll_ms: 5, settle_ms: 0, timeout_ms: 500 },
            });

            expect(outcome.written).toBe(true);
            expect(vault.values.get(KEY)).toContain("331.40GB");
        });
    });
    it("never surfaces the capture window (AC-001)", async () => {
        const vault = create_vault();
        await vault.set(KEY, OLD_SECRET);
        const window = create_window(USAGE_HTML);

        const outcome = await run_flowercloud_snapshot({
            window,
            session: create_session(),
            vault,
            instance_id: "flower-1",
            login_url: LOGIN_URL,
            is_cancelled: () => false,
            options: { poll_ms: 5, settle_ms: 0, timeout_ms: 500 },
        });

        expect(outcome.written).toBe(true);
        // 采集窗全程隐藏：任何前台化调用都是回归。
        expect(window.shown).toBe(0);
        expect(window.shown_inactive).toBe(0);
        expect(window.opacity_calls).toBe(0);
    });

    describe("t537 multi-service snapshot", () => {
        const LIST_HTML = [
            '<a href="clientarea.php?action=productdetails&amp;id=8848">Global Acceleration Lite</a>',
            '<a href="clientarea.php?action=productdetails&amp;id=8849">Global Acceleration Plus</a>',
        ].join("\n");
        const LIST_ONE = '<a href="clientarea.php?action=productdetails&amp;id=8848">Lite</a>';
        const DETAIL_A = "<p>流量使用 10.00GB / 100GB</p>";
        const DETAIL_B = "<p>流量使用 20.00GB / 200GB</p>";
        const url_for = (id: string): string =>
            `https://api-flowercloud.com/clientarea.php?action=productdetails&id=${id}`;

        it("flower_service_ids keeps discovery order and dedups", () => {
            expect(flower_service_ids(LIST_HTML)).toEqual(["8848", "8849"]);
            expect(
                flower_service_ids(
                    '<a href="clientarea.php?action=productdetails&id=7">x</a>' +
                        '<a href="clientarea.php?action=productdetails&amp;id=7">y</a>' +
                        '<a href="clientarea.php?action=productdetails&id=8">z</a>',
                ),
            ).toEqual(["7", "8"]);
            expect(flower_service_ids("<p>没有链接</p>")).toEqual([]);
        });

        it("compose_flower_sections marks success and failure entries", () => {
            const composite = compose_flower_sections([
                { id: "8848", html: DETAIL_A },
                { id: "8849", error: "本轮等待超时，该服务未取到用量" },
            ]);
            expect(composite).toContain("<!--omni-flower id=8848-->");
            expect(composite).toContain(DETAIL_A);
            expect(composite).toContain("<!--/omni-flower-->");
            expect(composite).toContain(
                '<!--omni-flower id=8849 error="本轮等待超时，该服务未取到用量"-->',
            );
        });

        it("A8: strips comment-breaking sequences from section errors", () => {
            const composite = compose_flower_sections([{ id: "8848", error: 'a"b--c\nd' }]);
            // 引号/换行/`--` 均被清洗，标注不再破坏 HTML 注释语法。
            expect(composite).toContain('<!--omni-flower id=8848 error="a b c d"-->');
            expect(composite).not.toContain('"b');
        });

        it("A13: tolerates a throwing read_page_hint (hint check skipped)", async () => {
            const vault = create_vault();
            await vault.set(KEY, OLD_SECRET);
            const window = create_nav_window(
                { [LOGIN_URL]: LIST_ONE, [url_for("8848")]: DETAIL_A },
                LIST_ONE,
            );
            window.read_page_hint = () => Promise.reject(new Error("boom"));

            const outcome = await run_flowercloud_snapshot({
                window,
                session: create_session(),
                vault,
                instance_id: "flower-1",
                login_url: LOGIN_URL,
                is_cancelled: () => false,
                options: { poll_ms: 5, settle_ms: 0, timeout_ms: 2_000 },
            });

            // hint 全抛错 → 每次核对都按"无提示"跳过，用量照常结算入库。
            expect(outcome.written).toBe(true);
            expect(vault.values.get(KEY)).toContain("10.00GB");
        });

        it("A13: reports cancelled when the window closes mid multi-service capture", async () => {
            const vault = create_vault();
            await vault.set(KEY, OLD_SECRET);
            const window = create_nav_window(
                {
                    [LOGIN_URL]: LIST_HTML,
                    [url_for("8848")]: DETAIL_A,
                    [url_for("8849")]: DETAIL_B,
                },
                LIST_HTML,
            );
            // 第二次读到页面即关窗：抓取中途取消走 cancelled 边界，不写快照、不误报用量缺失。
            let reads = 0;
            const base_read = window.read_html?.bind(window);
            if (!base_read) throw new Error("read_html missing");
            window.read_html = () => {
                reads += 1;
                if (reads >= 2) window.close();
                return base_read();
            };

            const outcome = await run_flowercloud_snapshot({
                window,
                session: create_session(),
                vault,
                instance_id: "flower-1",
                login_url: LOGIN_URL,
                is_cancelled: () => window.isDestroyed(),
                options: { poll_ms: 5, settle_ms: 200, timeout_ms: 5_000 },
            });

            expect(outcome).toEqual({ written: false, kind: "cancelled" });
            expect(vault.values.get(KEY)).toBe(OLD_SECRET);
        });

        it("visits every discovered service and stores a composite snapshot", async () => {
            const vault = create_vault();
            await vault.set(KEY, OLD_SECRET);
            const window = create_nav_window(
                {
                    [LOGIN_URL]: LIST_HTML,
                    [url_for("8848")]: DETAIL_A,
                    [url_for("8849")]: DETAIL_B,
                },
                LIST_HTML,
            );

            const outcome = await run_flowercloud_snapshot({
                window,
                session: create_session(),
                vault,
                instance_id: "flower-1",
                login_url: LOGIN_URL,
                is_cancelled: () => false,
                options: { poll_ms: 5, settle_ms: 0, timeout_ms: 2_000 },
            });

            expect(outcome.written).toBe(true);
            expect(window.loaded_urls).toEqual([LOGIN_URL, url_for("8848"), url_for("8849")]);
            const stored = vault.values.get(KEY) ?? "";
            expect(stored).toContain("<!--omni-flower id=8848-->");
            expect(stored).toContain("10.00GB / 100GB");
            expect(stored).toContain("<!--omni-flower id=8849-->");
            expect(stored).toContain("20.00GB / 200GB");
            // 采集窗不前台化（t535 AC-001 回归在多服务路径同样成立）。
            expect(window.shown).toBe(0);
        });

        it("single service keeps the raw html degenerate form (no composite markers)", async () => {
            const vault = create_vault();
            await vault.set(KEY, OLD_SECRET);
            const window = create_nav_window(
                { [LOGIN_URL]: LIST_ONE, [url_for("8848")]: DETAIL_A },
                LIST_ONE,
            );

            const outcome = await run_flowercloud_snapshot({
                window,
                session: create_session(),
                vault,
                instance_id: "flower-1",
                login_url: LOGIN_URL,
                is_cancelled: () => false,
                options: { poll_ms: 5, settle_ms: 0, timeout_ms: 2_000 },
            });

            expect(outcome.written).toBe(true);
            const stored = vault.values.get(KEY) ?? "";
            expect(stored).toContain("10.00GB / 100GB");
            expect(stored).not.toContain("omni-flower");
        });

        it("marks the unreachable service with an error instead of silently dropping it", async () => {
            const vault = create_vault();
            await vault.set(KEY, OLD_SECRET);
            // 8849 的详情页永远渲染不出用量 → 预算耗尽后带 error 标注写入。
            const window = create_nav_window(
                { [LOGIN_URL]: LIST_HTML, [url_for("8848")]: DETAIL_A },
                LIST_HTML,
            );

            const outcome = await run_flowercloud_snapshot({
                window,
                session: create_session(),
                vault,
                instance_id: "flower-1",
                login_url: LOGIN_URL,
                is_cancelled: () => false,
                options: { poll_ms: 5, settle_ms: 0, timeout_ms: 250 },
            });

            expect(outcome.written).toBe(true);
            const stored_raw = vault.values.get(KEY) ?? "";
            // vault 载荷是 JSON：取出 html 字段再断言分段（引号在 JSON 层会被转义）。
            const payload = JSON.parse(stored_raw) as { html?: string };
            const stored = payload.html ?? "";
            expect(stored).toContain("<!--omni-flower id=8848-->");
            expect(stored).toMatch(/<!--omni-flower id=8849 error="[^"]+"-->/);
            expect(stored).toContain("未取到用量");
        });

        it("never captures a page whose URL does not belong to the current service (gen_f003)", async () => {
            const vault = create_vault();
            await vault.set(KEY, OLD_SECRET);
            const window = create_nav_window(
                {
                    [LOGIN_URL]: LIST_HTML,
                    [url_for("8848")]: DETAIL_A,
                    [url_for("8849")]: DETAIL_B,
                },
                LIST_HTML,
            );
            // 8848 导航后 hint 落点是别的服务（id=9999）：该服务判失败，
            // DETAIL_A 的用量绝不能错配进 8848 的分段。
            window.read_page_hint = () => {
                const loaded = window.loaded_urls.at(-1) ?? LOGIN_URL;
                const url = loaded.includes("id=8848")
                    ? "https://api-flowercloud.com/clientarea.php?action=productdetails&id=9999"
                    : loaded;
                return Promise.resolve({ url, title: "" });
            };

            const outcome = await run_flowercloud_snapshot({
                window,
                session: create_session(),
                vault,
                instance_id: "flower-1",
                login_url: LOGIN_URL,
                is_cancelled: () => false,
                options: { poll_ms: 5, settle_ms: 0, timeout_ms: 2_000 },
            });

            expect(outcome.written).toBe(true);
            const payload = JSON.parse(vault.values.get(KEY) ?? "{}") as { html?: string };
            const stored = payload.html ?? "";
            expect(stored).toContain('<!--omni-flower id=8848 error="导航未到达该服务的详情页"-->');
            expect(stored).toContain("<!--omni-flower id=8849-->");
            expect(stored).toContain("20.00GB / 200GB");
            expect(stored).not.toContain("10.00GB / 100GB");
        });

        it("rejects a hint URL whose id only shares a prefix with the target service (gen_f004)", async () => {
            const vault = create_vault();
            await vault.set(KEY, OLD_SECRET);
            const window = create_nav_window(
                { [LOGIN_URL]: LIST_ONE, [url_for("8848")]: DETAIL_A },
                LIST_ONE,
            );
            // id=88480 与目标 8848 前缀相同：substring 会误放行，精确参数比对必须拒绝。
            window.read_page_hint = () =>
                Promise.resolve({
                    url: "https://api-flowercloud.com/clientarea.php?action=productdetails&id=88480",
                    title: "",
                });

            const outcome = await run_flowercloud_snapshot({
                window,
                session: create_session(),
                vault,
                instance_id: "flower-1",
                login_url: LOGIN_URL,
                is_cancelled: () => false,
                options: { poll_ms: 5, settle_ms: 0, timeout_ms: 300 },
            });

            // 唯一服务判失败 → 无捕获 → 不写快照（旧值保留）。
            expect(outcome.written).toBe(false);
            expect(vault.values.get(KEY)).toBe(OLD_SECRET);
        });

        it("keeps the old snapshot when no service yields usage at all (t535 failure semantics)", async () => {
            const vault = create_vault();
            await vault.set(KEY, OLD_SECRET);
            const window = create_nav_window({ [LOGIN_URL]: LIST_HTML }, LIST_HTML);

            const outcome = await run_flowercloud_snapshot({
                window,
                session: create_session(),
                vault,
                instance_id: "flower-1",
                login_url: LOGIN_URL,
                is_cancelled: () => false,
                options: { poll_ms: 5, settle_ms: 0, timeout_ms: 250 },
            });

            expect(outcome.written).toBe(false);
            expect(vault.values.get(KEY)).toBe(OLD_SECRET);
        });
    });
});

describe("flower_failure_reason", () => {
    it.each([
        ["cloudflare", "人机验证"],
        ["login", "重新登录"],
        ["blocked", "拦截"],
        ["empty", "未渲染"],
        ["cancelled", "取消"],
        ["other", "未出现用量数据"],
        ["network", "抓取失败"],
        ["usage", "未写入快照"],
        ["overview", "未写入快照"],
    ] as const)("maps %s to a readable reason", (kind, expected) => {
        expect(flower_failure_reason(kind)).toContain(expected);
    });

    it("reports a network reason when loading the page fails", async () => {
        const vault = create_vault();
        await vault.set(KEY, OLD_SECRET);
        const window = create_window(USAGE_HTML);
        window.loadURL = vi.fn(() => Promise.reject(new Error("net::ERR_FAILED")));

        const outcome = await run_flowercloud_snapshot({
            window,
            session: create_session(),
            vault,
            instance_id: "flower-1",
            login_url: LOGIN_URL,
            is_cancelled: () => false,
            options: { poll_ms: 5, settle_ms: 0, timeout_ms: 200 },
        });

        expect(outcome.written).toBe(false);
        expect(outcome.kind).toBe("network");
        expect(flower_failure_reason(outcome.kind)).toContain("网络");
    });

    it("reports a cancelled reason when the session is torn down mid-capture", async () => {
        const vault = create_vault();
        await vault.set(KEY, OLD_SECRET);
        const session = create_session();
        let cancelled = false;
        // 交互登录抢占/关窗时，await 中的会话调用会 reject；这属于取消而不是网络失败。
        session.get_cookies = vi.fn(() => {
            cancelled = true;
            return Promise.reject(new Error("Object has been destroyed"));
        });

        const outcome = await run_flowercloud_snapshot({
            window: create_window(USAGE_HTML),
            session,
            vault,
            instance_id: "flower-1",
            login_url: LOGIN_URL,
            is_cancelled: () => cancelled,
            options: { poll_ms: 5, settle_ms: 0, timeout_ms: 200 },
        });

        expect(outcome.written).toBe(false);
        expect(outcome.kind).toBe("cancelled");
        expect(flower_failure_reason(outcome.kind)).toContain("取消");
    });

    it("reports the blocked reason for an Error 1020 page", async () => {
        const vault = create_vault();
        await vault.set(KEY, OLD_SECRET);
        const window = create_window(
            "<title>Attention Required! | Cloudflare</title><div>error 1020</div>",
        );

        const outcome = await run_flowercloud_snapshot({
            window,
            session: create_session(),
            vault,
            instance_id: "flower-1",
            login_url: LOGIN_URL,
            is_cancelled: () => false,
            options: { poll_ms: 5, settle_ms: 0, timeout_ms: 40 },
        });

        expect(outcome.written).toBe(false);
        expect(flower_failure_reason(outcome.kind)).toContain("拦截");
    });
});
