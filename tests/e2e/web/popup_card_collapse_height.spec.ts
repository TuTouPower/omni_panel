import { expect, test } from "../fixtures/test_web";
import { PopupPage } from "../pages/popup_page";

/**
 * Web e2e：popup 多账号 card 折叠/展开对内容高度与滚动的影响。
 * mock local-api 回放真实快照（Codex 4 账号，每账号一 card 含折叠按钮）。
 * 断言泛化：动态取首个折叠按钮的 aria-label，不锁具体账号名。
 */
test.describe("popup card collapse height (web)", () => {
    test("collapse single card reduces window content height", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const live = popup.root();
        await live.getByRole("button", { name: /^Codex$/ }).click();
        // 等 card 完整渲染（trend sparkline 等）
        await expect(live.locator(".bar-row").first()).toBeVisible({ timeout: 15_000 });

        const collapse_buttons = live.getByRole("button", { name: /^折叠 .+/ });
        const count = await collapse_buttons.count();
        expect(count).toBeGreaterThan(0);

        const content = live.locator(".scroll-inner");
        const height_before = await content.evaluate((node) => node.scrollHeight);

        const first_label = await collapse_buttons.first().getAttribute("aria-label");
        expect(first_label).toBeTruthy();
        const account_label = (first_label ?? "").replace(/^折叠\s+/, "");

        await collapse_buttons.first().click();
        await expect(live.locator(`button[aria-label="展开 ${account_label}"]`)).toBeVisible();
        const height_after = await content.evaluate((node) => node.scrollHeight);

        expect(height_after).toBeLessThan(height_before);
    });

    test("expand card restores window content height", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const live = popup.root();
        await live.getByRole("button", { name: /^Codex$/ }).click();
        await expect(live.locator(".bar-row").first()).toBeVisible({ timeout: 15_000 });

        const collapse_buttons = live.getByRole("button", { name: /^折叠 .+/ });
        const first_label = await collapse_buttons.first().getAttribute("aria-label");
        expect(first_label).toBeTruthy();
        const account_label = (first_label ?? "").replace(/^折叠\s+/, "");

        await collapse_buttons.first().click();
        const content = live.locator(".scroll-inner");
        const height_collapsed = await content.evaluate((node) => node.scrollHeight);

        const expand_btn = live.locator(`button[aria-label="展开 ${account_label}"]`);
        await expand_btn.click();
        await expect(live.locator(`button[aria-label="折叠 ${account_label}"]`)).toBeVisible();
        const height_expanded = await content.evaluate((node) => node.scrollHeight);

        expect(height_expanded).toBeGreaterThan(height_collapsed);
    });

    test("collapse all cards keeps scroll attached to content", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const live = popup.root();
        await live.getByRole("button", { name: /^Codex$/ }).click();
        await expect(live.locator(".bar-row").first()).toBeVisible({ timeout: 15_000 });

        const collapse_buttons = live.getByRole("button", { name: /^折叠 .+/ });
        const count = await collapse_buttons.count();
        expect(count).toBeGreaterThanOrEqual(1);
        // 折叠所有可折叠 card
        for (let i = 0; i < count; i++) {
            const btn = live.getByRole("button", { name: /^折叠 .+/ }).nth(0);
            if (!(await btn.isVisible().catch(() => false))) break;
            await btn.click();
            await webPage.waitForTimeout(100);
        }

        await expect(live.locator(".scroll")).toBeVisible();
        const space = await live.evaluate((node) => {
            const scroll = node.querySelector(".scroll");
            if (!(scroll instanceof HTMLElement)) return Number.POSITIVE_INFINITY;
            return node.getBoundingClientRect().bottom - scroll.getBoundingClientRect().bottom;
        });
        expect(space).toBeLessThan(20);
    });

    test("tab switch restores expanded account rows", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const live = popup.root();
        await live.getByRole("button", { name: /^Codex$/ }).click();
        await expect(live.locator(".bar-row").first()).toBeVisible({ timeout: 15_000 });

        const collapse_buttons = live.getByRole("button", { name: /^折叠 .+/ });
        const first_label = await collapse_buttons.first().getAttribute("aria-label");
        expect(first_label).toBeTruthy();
        const account_label = (first_label ?? "").replace(/^折叠\s+/, "");

        await collapse_buttons.first().click();
        await expect(live.locator(`button[aria-label="展开 ${account_label}"]`)).toBeVisible();

        // 切走再切回，折叠态应保留
        await live.getByRole("button", { name: "总览" }).click();
        await live.getByRole("button", { name: /^Codex$/ }).click();

        await expect(live.locator(`button[aria-label="展开 ${account_label}"]`)).toBeVisible();
    });
});
