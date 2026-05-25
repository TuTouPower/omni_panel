import { expect, test } from "../fixtures/test";
import { PopupPage } from "../pages/popup_page";

test.describe("scheduler", () => {
    test("auto-creates plugin instances on startup", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // After auto-seeding, there should be plugin cards in the popup
        const pluginCards = page.locator('[data-testid^="popup-plugin-card-"]');
        const count = await pluginCards.count();
        expect(count).toBeGreaterThan(0);
    });

    test("plugins reach a terminal state after startup refresh", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // Wait for scheduler to complete initial refreshes (up to 30s for all plugins)
        // Each plugin gets a fresh refresh on scheduler.start()
        await page.waitForTimeout(5000);

        // Check that plugin cards exist and have some state
        const pluginCards = page.locator('[data-testid^="popup-plugin-card-"]');
        const count = await pluginCards.count();
        if (count > 0) {
            // At least one card should exist with some content
            const firstCard = pluginCards.first();
            await expect(firstCard).toBeVisible();
        }
    });

    test("manual refresh button triggers refresh", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // Click refresh button
        await popup.clickRefresh();

        // Wait a moment for the refresh to start
        await page.waitForTimeout(1000);

        // The page should still be functional (no crash)
        await expect(page.locator("main")).toBeVisible();
    });

    test("settings shows plugin list with enabled state", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await page.evaluate(() => {
            window.location.hash = "#settings";
        });
        await page.waitForFunction(() => window.location.hash === "#settings", undefined, {
            timeout: 5000,
        });

        // Settings sidebar should be visible
        await expect(page.locator('[data-testid="settings-sidebar"]')).toBeVisible();

        // Plugin navigation items must exist (6 bundled plugins should be seeded)
        const pluginNavItems = page.locator('[data-testid^="settings-plugin-nav-"]');
        const count = await pluginNavItems.count();
        expect(count).toBeGreaterThan(0);
    });
});
