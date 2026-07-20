import { expect, test } from "../fixtures/test_web";
import { PopupPage } from "../pages/popup_page";
import { SettingsPage } from "../pages/settings_page";

/**
 * Web e2e：scheduler 行为可平移到浏览器的部分。
 * mock local-api 回放真实快照；card 状态/刷新行为保持。
 */
test.describe("scheduler (web)", () => {
    test("popup renders plugin cards from fixture data", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const pluginCards = popup.root().locator(".card");
        const count = await pluginCards.count();
        expect(count).toBeGreaterThan(0);
    });

    test("cards reach a terminal state after initial render", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const pluginCards = popup.root().locator(".card[data-status]");
        await expect(pluginCards.first()).toBeVisible({ timeout: 30_000 });

        const count = await pluginCards.count();
        expect(count).toBeGreaterThan(0);

        const terminalCards = popup
            .root()
            .locator(
                '.card[data-status="ready"], .card[data-status="failed"], .card[data-status="empty"]',
            );
        await expect(terminalCards.first()).toBeVisible({ timeout: 30_000 });
    });

    test("manual refresh button triggers refresh", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        await popup.clickRefresh();

        await webPage.waitForTimeout(1000);

        // 刷新后页面仍可用
        await expect(popup.root().locator(".scroll")).toBeVisible();
    });

    test("settings shows plugin list with enabled state", async ({ webPage }) => {
        const settings = await SettingsPage.open_via_hash(webPage);
        const sPage = settings.page;

        await expect(sPage.locator('[data-testid="settings-sidebar"]')).toBeVisible();

        const pluginNavItems = sPage.locator('[data-testid^="settings-plugin-nav-"]');
        const count = await pluginNavItems.count();
        expect(count).toBeGreaterThan(0);
    });
});
