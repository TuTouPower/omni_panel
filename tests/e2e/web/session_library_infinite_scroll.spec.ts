import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/test_web";

/**
 * Web e2e：会话库无限滚动（t328）。
 * 「加载更多」按钮移除（AC-001），滚动容器触底自动加载下一页（AC-002），
 * has_more=false 后触底不再发起请求（AC-003），网格/列表两视图一致（AC-006）。
 * 用 page.route 注入 130 个会话（50/50/30，末页短页 → has_more=false）。
 * SPIKE（spec 上下文区 UNVERIFIED-SPIKE）：SessionList 为 web/Electron 同源组件，
 * 滚动容器 React onScroll 跨平台一致；本 spec 在真实浏览器派发原生 scroll 验证触发。
 */

const TOTAL_SESSIONS = 130;

function make_sessions(total: number) {
    return Array.from({ length: total }, (_, i) => ({
        id: `s${String(i)}`,
        source: "claude_code",
        env: "win",
        model: "model",
        title: `会话 ${String(i)}`,
        directory: `/proj/s${String(i)}`,
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
async function route_many_sessions(
    page: Page,
    total: number,
    on_request?: (offset: number) => void,
): Promise<void> {
    // 会话库首屏请求带 query（?limit=&offset=），glob 须以 * 收尾匹配 query string（t266）。
    await page.route("**/v1/sessions*", async (route) => {
        const url = new URL(route.request().url());
        const limit = Number(url.searchParams.get("limit"));
        const offset = Number(url.searchParams.get("offset") ?? "0");
        on_request?.(offset);
        const all = make_sessions(total);
        const rows = Number.isFinite(limit) && limit > 0 ? all.slice(offset, offset + limit) : all;
        await route.fulfill({
            contentType: "application/json",
            body: JSON.stringify(rows),
        });
    });
}

async function open_library(page: Page): Promise<void> {
    await page.goto("/#session");
    await page.locator('[data-testid="session-shell"]').first().waitFor({ state: "visible" });
    await page.getByRole("button", { name: "会话库", exact: true }).click();
    await expect(page.locator('[data-testid="library-grid"]').first()).toBeVisible();
}

/** 滚动容器触底并派发原生 scroll（t328；与用户滚轮产生的 scroll 事件同路径入 React onScroll）。 */
async function scroll_container_to_bottom(page: Page, selector: string): Promise<void> {
    await page
        .locator(selector)
        .first()
        .evaluate((el) => {
            const target = el as HTMLElement;
            target.scrollTop = target.scrollHeight;
            target.dispatchEvent(new Event("scroll"));
        });
}

test.describe("session library infinite scroll (web, t328)", () => {
    test("网格视图：无按钮，滚到底自动加载，has_more=false 后停止", async ({ webPage }) => {
        const page = webPage;
        test.setTimeout(60_000);
        await page.setViewportSize({ width: 1280, height: 720 });
        const offsets: number[] = [];
        await route_many_sessions(page, TOTAL_SESSIONS, (o) => offsets.push(o));
        await open_library(page);
        await expect(page.locator('[data-testid="library-card"]').first()).toBeVisible();
        await expect(page.locator('[data-testid="library-card"]')).toHaveCount(50);

        // AC-001：无「加载更多」按钮。
        await expect(page.getByRole("button", { name: /加载更多/ })).toHaveCount(0);

        // AC-002：滚到底自动加载第二页 → 100。
        await scroll_container_to_bottom(page, '[data-testid="library-grid"]');
        await expect
            .poll(async () => page.locator('[data-testid="library-card"]').count(), {
                timeout: 5000,
            })
            .toBe(100);

        // 再次触底 → 第三页 30 条 → 130（末页 < 50 → has_more=false）。
        await scroll_container_to_bottom(page, '[data-testid="library-grid"]');
        await expect
            .poll(async () => page.locator('[data-testid="library-card"]').count(), {
                timeout: 5000,
            })
            .toBe(130);

        // AC-003：has_more=false 后触底不再发起新请求。
        const before = offsets.length;
        await scroll_container_to_bottom(page, '[data-testid="library-grid"]');
        await page.waitForTimeout(600);
        expect(offsets.length).toBe(before);
        // 每页偏移各请求一次（0/50/100），无重复。
        expect(offsets.filter((o) => o === 0)).toHaveLength(1);
        expect(offsets.filter((o) => o === 50)).toHaveLength(1);
        expect(offsets.filter((o) => o === 100)).toHaveLength(1);
    });

    test("列表视图：无按钮，触底同样自动加载（AC-006）", async ({ webPage }) => {
        const page = webPage;
        test.setTimeout(60_000);
        await page.setViewportSize({ width: 1280, height: 720 });
        await route_many_sessions(page, TOTAL_SESSIONS);
        await open_library(page);
        await expect(page.locator('[data-testid="library-card"]').first()).toBeVisible();

        await page.getByRole("button", { name: "列表视图" }).click();
        await expect(page.locator('[data-testid="library-list"]').first()).toBeVisible();
        await expect(page.locator('[data-testid="library-card"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="library-row"]')).toHaveCount(50);

        // AC-001：列表视图也无「加载更多」按钮。
        await expect(page.getByRole("button", { name: /加载更多/ })).toHaveCount(0);

        // AC-006：列表滚动触底自动加载 → 100。
        await scroll_container_to_bottom(page, '[data-testid="library-list"]');
        await expect
            .poll(async () => page.locator('[data-testid="library-row"]').count(), {
                timeout: 5000,
            })
            .toBe(100);
    });
});
