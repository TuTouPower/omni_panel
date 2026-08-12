import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/test_web";

/**
 * Web e2e：会话库首屏挂载自动补满（t334，p146 修复）。
 * 挂载 effect 在首屏不溢出时循环补满至溢出或 has_more=false（AC-001）；
 * 首屏溢出时不预取第 2 页（AC-002，t328 回归不复发）；补满无并发重复请求（AC-003）。
 * 用 page.route 注入数据，小数据 + 大视口验证补满，大数据 + 常规视口验证不预取。
 */

const PAGE_SIZE = 50;

function make_sessions(total: number) {
    return Array.from({ length: total }, (_, i) => ({
        id: `m${String(i)}`,
        source: "claude_code",
        env: "win",
        model: "model",
        title: `会话 ${String(i)}`,
        directory: `/proj/m${String(i)}`,
        input_tokens: 100 + i,
        output_tokens: 100,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        calls: 1 + (i % 10),
        started_at: 1783994400000,
        ended_at: 1784080799000 + i,
    }));
}

async function route_sessions(
    page: Page,
    total: number,
    on_request?: (offset: number) => void,
): Promise<void> {
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
    await page.locator(".session-shell").first().waitFor({ state: "visible" });
    await page.getByRole("button", { name: "会话库", exact: true }).click();
    await expect(page.locator(".library-grid").first()).toBeVisible();
}

test.describe("session library mount refill (web, t334)", () => {
    test("AC-001/003: 大视口首屏不溢出时挂载自动补满至数据尽，无并发重复请求", async ({
        webPage,
    }) => {
        const page = webPage;
        test.setTimeout(60_000);
        // 3 页 × 50（末页短页 → has_more=false），大视口高 4000px 使 3 页内不溢出。
        await page.setViewportSize({ width: 1920, height: 4000 });
        const offsets: number[] = [];
        await route_sessions(page, PAGE_SIZE * 2 + 10, (offset) => offsets.push(offset));
        await open_library(page);

        // 挂载后补满循环自动加载：全部 110 会话出现。
        await expect
            .poll(() => page.locator(".library-card").count(), { timeout: 10_000 })
            .toBe(110);
        // AC-003: 请求 offset 有序且无重复（0 → 50 → 100，末页 10 条后 has_more=false 停）。
        await expect.poll(() => offsets, { timeout: 10_000 }).toEqual([0, 50, 100]);
    });

    test("AC-002: 常规视口首屏溢出时挂载不预取第 2 页，靠滚动触底加载", async ({ webPage }) => {
        const page = webPage;
        test.setTimeout(60_000);
        // 大数据 + 常规视口：首屏 50 条溢出，挂载不应预取 offset=50。
        await page.setViewportSize({ width: 1280, height: 720 });
        const offsets: number[] = [];
        await route_sessions(page, 200, (offset) => offsets.push(offset));
        await open_library(page);

        await expect(page.locator(".library-card").first()).toBeVisible();
        // 挂载后仅 offset=0 一次（不预取第 2 页）。
        await expect.poll(() => offsets, { timeout: 10_000 }).toEqual([0]);

        // 滚动触底加载第 2 页（t328 行为不回归）。
        await page
            .locator(".library-grid")
            .first()
            .evaluate((el) => {
                el.scrollTop = el.scrollHeight;
            });
        await expect.poll(() => offsets, { timeout: 10_000 }).toEqual([0, 50]);
    });

    test("AC-001 f001: 中等视口补满至中途溢出即停（非数据尽）", async ({ webPage }) => {
        const page = webPage;
        test.setTimeout(60_000);
        // 中视口 + 中数据：首屏不溢出 → 补满加载；第 2 页后溢出可滚动即停（不加载第 3 页）。
        // 50 条 sh≈1800，视口高 2100 下不溢出；100 条 sh≈3600 溢出 → 补满至第 2 页停。
        await page.setViewportSize({ width: 1280, height: 2100 });
        const offsets: number[] = [];
        await route_sessions(page, 200, (offset) => offsets.push(offset));
        await open_library(page);

        // 补满至溢出即停：offset 0 → 50，第 2 页后溢出，不再预取 100。
        await expect
            .poll(
                async () => {
                    const h = await page
                        .locator(".library-grid")
                        .first()
                        .evaluate((el) => ({ ch: el.clientHeight, sh: el.scrollHeight }));
                    return JSON.stringify({ offsets, ...h });
                },
                { timeout: 10_000 },
            )
            .toContain('"offsets":[0,50]');
        const h = await page
            .locator(".library-grid")
            .first()
            .evaluate((el) => ({ ch: el.clientHeight, sh: el.scrollHeight }));
        expect(h.sh).toBeGreaterThan(h.ch);
    });
});
