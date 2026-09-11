import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/test_web";

/**
 * Web e2e：会话库网格视图卡片高度防压扁（t327）。
 * 根因：grid 容器默认 align-items:stretch，内容超高时把行内卡片拉伸塌陷为 2px 细条，
 * 标题/摘要/按钮不可见；修复补 align-items:start。本 spec 用 page.route 注入 360 个
 * 会话，走会话库真实分页（50/页）+ 无限滚动（t328 滚到底自动加载）连续加载至 350+，断言：
 *  - AC-001/003：卡片 offsetHeight 保持内容自然高度（非 2px 细条），前 N 张高度固定一致；
 *  - AC-002：内容超高时网格容器 scrollHeight > clientHeight（可滚动不压扁）。
 */

const TOTAL_SESSIONS = 360;

function make_sessions(total: number) {
    return Array.from({ length: total }, (_, i) => ({
        id: `g${String(i)}`,
        source: "claude_code",
        env: "win",
        model: "model",
        title: `会话卡片 ${String(i)}`,
        directory: `/proj/g${String(i)}`,
        input_tokens: 100 + i,
        output_tokens: 100,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        calls: 1 + (i % 10),
        started_at: 1783994400000,
        ended_at: 1784080799000 + i,
    }));
}

/** 注入 TOTAL_SESSIONS 个会话，对齐 mock 的分页语义（limit/offset）。 */
async function route_many_sessions(page: Page, total: number): Promise<void> {
    // 会话库首屏请求带 query（?limit=&offset=），glob 须以 * 收尾匹配 query string（t266）。
    await page.route("**/v1/sessions*", async (route) => {
        const url = new URL(route.request().url());
        const limit = Number(url.searchParams.get("limit"));
        const offset = Number(url.searchParams.get("offset") ?? "0");
        const all = make_sessions(total);
        const rows = Number.isFinite(limit) && limit > 0 ? all.slice(offset, offset + limit) : all;
        await route.fulfill({
            contentType: "application/json",
            body: JSON.stringify(rows),
        });
    });
}

/** 滚到底并派发 scroll 事件（t328 无限滚动；scrollTop 赋值触发原生 scroll）。 */
async function scroll_grid_to_bottom(page: Page): Promise<void> {
    await page
        .locator('[data-testid="library-grid"]')
        .first()
        .evaluate((el) => {
            const target = el as HTMLElement;
            target.scrollTop = target.scrollHeight;
            target.dispatchEvent(new Event("scroll"));
        });
}

async function open_library_grid(page: Page): Promise<void> {
    await page.goto("/#session");
    await page.locator('[data-testid="session-shell"]').first().waitFor({ state: "visible" });
    await expect(page.locator('[data-testid="library-grid"]').first()).toBeVisible();
}

test.describe("session library grid card height (web, t327)", () => {
    test("350+ 卡片加载后卡片高度固定不压扁、容器可滚动", async ({ webPage }) => {
        const page = webPage;
        test.setTimeout(60_000);
        await page.setViewportSize({ width: 1280, height: 720 });
        await route_many_sessions(page, TOTAL_SESSIONS);
        await open_library_grid(page);

        // 首屏 50 个已超过一屏（1280x720），先断言卡片高度正常（未压扁）。
        const first_h = await page
            .locator('[data-testid="library-card"]')
            .first()
            .evaluate((el) => (el as HTMLElement).offsetHeight);
        expect(first_h).toBeGreaterThan(50);

        // AC-003：连续滚到底自动加载直至 350+ 卡片。
        for (let i = 0; i < 20; i += 1) {
            const count = await page.locator('[data-testid="library-card"]').count();
            if (count >= 350) break;
            await scroll_grid_to_bottom(page);
            await expect
                .poll(async () => page.locator('[data-testid="library-card"]').count(), {
                    timeout: 5000,
                })
                .toBeGreaterThan(count);
        }
        const total = await page.locator('[data-testid="library-card"]').count();
        expect(total).toBeGreaterThanOrEqual(350);

        // AC-001/003：卡片高度为内容自然高度（>2px 细条），前 12 张高度固定一致。
        const heights = await page
            .locator('[data-testid="library-card"]')
            .evaluateAll((els) => els.slice(0, 12).map((el) => (el as HTMLElement).offsetHeight));
        for (const h of heights) {
            expect(h).toBeGreaterThan(50);
        }
        expect(new Set(heights.map((h) => Math.round(h))).size).toBe(1);

        // 标题可见（压扁时标题 0 高不可见）。
        await expect(page.locator('[data-testid="library-card-title"]').first()).toBeVisible();

        // AC-001：卡片不重叠（仅 items-start 时行压缩致跨行重叠，auto-rows-max 修复）。
        // 逐卡取 boundingBox，按垂直区间断言无覆盖：每张卡 top ≥ 已见最大 bottom（同列下行）
        // 或属于新行（top 与上一行同一水平带，仅允许与同列上张相接）。
        const boxes = await page.locator('[data-testid="library-card"]').evaluateAll((els) =>
            els.slice(0, 24).map((el) => {
                const r = (el as HTMLElement).getBoundingClientRect();
                return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
            }),
        );
        for (const box of boxes) {
            // 同列上一张：与当前卡左缘对齐、bottom 最接近 top 的卡。
            const same_col_above = boxes
                .filter((b) => b !== box && Math.abs(b.left - box.left) < 5 && b.top < box.top)
                .sort((a, b) => b.top - a.top)[0];
            if (same_col_above) {
                expect(
                    box.top,
                    `同列上张 bottom=${String(same_col_above.bottom)} 不应超过当前卡 top=${String(box.top)}`,
                ).toBeGreaterThanOrEqual(same_col_above.bottom - 1);
            }
        }

        // AC-002：内容超高 → 网格容器可垂直滚动（scrollHeight > clientHeight）。
        const scroll = await page
            .locator('[data-testid="library-grid"]')
            .first()
            .evaluate((el) => ({
                sh: el.scrollHeight,
                ch: el.clientHeight,
            }));
        expect(scroll.sh).toBeGreaterThan(scroll.ch);
    });
});
