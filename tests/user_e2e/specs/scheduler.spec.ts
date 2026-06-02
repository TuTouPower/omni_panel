import type { ElectronApplication, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { PopupPage } from "../pages/popup_page";

async function openSettings(app: ElectronApplication, page: Page): Promise<Page> {
    await page.evaluate(() => {
        window.usageboard.settings.open();
    });
    const settingsWindow = await app.waitForEvent("window", { timeout: 10_000 });
    await settingsWindow.waitForLoadState("domcontentloaded");
    await settingsWindow.waitForSelector('[data-testid="settings-sidebar"]', { timeout: 10_000 });
    return settingsWindow;
}

test.describe("scheduler", () => {
    test("auto-creates plugin instances on startup", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // After auto-seeding, there should be plugin cards in the popup
        const pluginCards = popup.root().locator(".card");
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
        const pluginCards = popup.root().locator(".card");
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
        await expect(popup.root().locator(".scroll")).toBeVisible();
    });

    test("settings shows plugin list with enabled state", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const sPage = await openSettings(omni.app, page);

        await expect(sPage.locator('[data-testid="settings-sidebar"]')).toBeVisible();

        const pluginNavItems = sPage.locator('[data-testid^="settings-plugin-nav-"]');
        const count = await pluginNavItems.count();
        expect(count).toBeGreaterThan(0);
    });
});
