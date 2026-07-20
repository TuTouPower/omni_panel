import { expect, test } from "../fixtures/test_web";
import { PopupPage } from "../pages/popup_page";

/**
 * Web e2e：顶栏、provider 卡片、状态栏渲染。
 * 浏览器驱动 out/web SPA，mock local-api 回放真实快照。
 */
test.describe("popup demo alignment (web)", () => {
    test("top bar has title, refresh, and settings buttons", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        await expect(webPage.locator(".app-title").first()).toHaveText("OmniUsage");
        await expect(webPage.locator('[title="刷新全部"]').first()).toBeVisible();
        await expect(webPage.locator('[title="设置"]').first()).toBeVisible();
    });

    test("overview tab shows provider cards", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const cards = webPage.locator(".card");
        expect(await cards.count()).toBeGreaterThan(0);
    });

    test("title bar shows update time", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const timeLabel = webPage.locator(".tb-time").first();
        await expect(timeLabel).toBeVisible();
    });
});
