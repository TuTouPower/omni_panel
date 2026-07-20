import { expect, test } from "../fixtures/test_web";
import { PopupPage } from "../pages/popup_page";
import { SettingsPage } from "../pages/settings_page";

/**
 * Web e2e：popup view 主干断言。
 * 浏览器驱动 out/web SPA，mock local-api 回放真实快照。
 */
test.describe("popup view (web)", () => {
    test("shows title with logo", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();
        const title = await popup.getTitle();
        expect(title).toContain("OmniUsage");
    });

    test("refresh button is visible and clickable", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();
        await expect(popup.root().getByTitle("刷新全部")).toBeVisible();
        await popup.clickRefresh();
    });

    test("popup root fills the viewport height", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const layout = await webPage.evaluate(() => {
            const root = document.querySelector(".window");
            const scroll = document.querySelector(".scroll");
            if (!(root instanceof HTMLElement)) throw new Error("Popup root not found");
            if (!(scroll instanceof HTMLElement)) throw new Error("Popup scroll area not found");
            const root_rect = root.getBoundingClientRect();
            const scroll_rect = scroll.getBoundingClientRect();
            return {
                root_height: root_rect.height,
                scroll_bottom: scroll_rect.bottom,
                viewport_height: window.innerHeight,
            };
        });

        expect(Math.abs(layout.root_height - layout.viewport_height)).toBeLessThanOrEqual(1);
        expect(layout.scroll_bottom).toBeLessThanOrEqual(layout.root_height + 1);
    });

    test("main content area is rendered with overview tab", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();
        const live = webPage.locator('[data-popup="live"]');
        const providerNav = live.locator(".tabs-wrap");
        await expect(live).toBeVisible();
        await expect(live.locator(".scroll")).toBeVisible();
        // 总览 tab 是静态 UI，断言其存在
        await expect(providerNav.getByRole("button", { name: /总览/ })).toBeVisible();
        // provider tabs 数量来自实际 fixture，断言 > 0 而非具体名
        const providerTabs = providerNav.locator("button").filter({
            hasNotText: /总览/,
        });
        expect(await providerTabs.count()).toBeGreaterThan(0);
        // CPA provider 应被过滤出主 UI（业务规则：CPA 数据进对应 provider，不独立成 tab）
        await expect(providerNav.getByRole("button", { name: /^CPA$/ })).toHaveCount(0);
    });

    test("settings opens via hash route in same page", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();
        await popup.clickSettings();

        // web SPA：settings 在同 page hash 路由，无新窗口
        const settings = await SettingsPage.open_via_hash(webPage);
        await expect(settings.page.locator('[data-testid="settings-sidebar"]')).toBeVisible();
    });
});
