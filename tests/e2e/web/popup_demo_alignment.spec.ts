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

        await expect(webPage.locator('[data-testid="app-title"]').first()).toHaveText(
            "Omni Panel - Usage",
        );
        await expect(webPage.locator('[title="刷新全部"]').first()).toBeVisible();
        await expect(webPage.locator('[title="Settings面板"]').first()).toBeVisible();
    });

    test("overview tab shows provider cards", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        // waitReady 只等 app-title；card 由异步数据后渲染，先等首张卡片可见再计数
        // （否则会与数据加载竞态，偶发 count=0）。
        const cards = webPage.locator('[data-testid="collapsible-card"]');
        await expect(cards.first()).toBeVisible({ timeout: 15_000 });
        expect(await cards.count()).toBeGreaterThan(0);
    });

    test("title bar shows update time", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const timeLabel = webPage.locator('[data-testid="popup-time"]').first();
        await expect(timeLabel).toBeVisible();
    });
});
