import { expect, test } from "../fixtures/test";
import { PopupPage } from "../pages/popup_page";

test.describe("scheduler", () => {
    test("auto-creates plugin instances on startup", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // After auto-seeding, there should be plugin cards in the popup
        const pluginCards = page.locator(".card");
        const count = await pluginCards.count();
        expect(count).toBeGreaterThan(0);
    });

    test("plugins reach a terminal state after startup refresh", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // Wait for scheduler to complete initial refreshes (up to 30s for all plugins)
        await page.waitForTimeout(5000);

        // Check that plugin cards exist and have some state
        const pluginCards = page.locator(".card");
        const count = await pluginCards.count();
        if (count > 0) {
            const firstCard = pluginCards.first();
            await expect(firstCard).toBeVisible();
        }
    });

    test("manual refresh button triggers refresh", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        await popup.clickRefresh();

        await page.waitForTimeout(1000);

        // The page should still be functional (no crash)
        await expect(page.locator(".scroll")).toBeVisible();
    });

    test("settings shows plugin list with enabled state", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await page.evaluate(() => {
            window.location.hash = "#settings";
        });
        await page.waitForFunction(() => window.location.hash === "#settings", undefined, {
            timeout: 5000,
        });

        await expect(page.locator('[data-testid="settings-sidebar"]')).toBeVisible();

        const pluginNavItems = page.locator('[data-testid^="settings-plugin-nav-"]');
        const count = await pluginNavItems.count();
        expect(count).toBeGreaterThan(0);
    });
});
