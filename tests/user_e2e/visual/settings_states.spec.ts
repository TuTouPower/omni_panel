import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures/test";
import { SettingsPage } from "../pages/settings_page";

async function navigate_to_settings(page: Page): Promise<void> {
    await page.evaluate(() => {
        window.location.hash = "#settings";
    });
    await page.waitForFunction(() => window.location.hash === "#settings", undefined, {
        timeout: 5_000,
    });
}

test.describe("settings visual states", () => {
    test("sidebar with plugin list", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await page.waitForSelector(".app-title", { timeout: 10_000 });
        await navigate_to_settings(page);
        const settings = new SettingsPage(page);
        await settings.waitReady();

        const sidebar = page.locator('[data-testid="settings-sidebar"]');
        await expect(sidebar).toHaveScreenshot("settings_sidebar.png");
    });

    test("full settings page", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await page.waitForSelector(".app-title", { timeout: 10_000 });
        await navigate_to_settings(page);
        const settings = new SettingsPage(page);
        await settings.waitReady();

        await expect(page).toHaveScreenshot("settings_full.png", {
            fullPage: true,
        });
    });

    test("first plugin selected with form", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await page.waitForSelector(".app-title", { timeout: 10_000 });
        await navigate_to_settings(page);
        const settings = new SettingsPage(page);
        await settings.waitReady();

        // Click the first sidebar item to select a plugin
        const firstItem = page
            .locator(
                '[data-testid="settings-sidebar"] button, [data-testid="settings-sidebar"] [role="button"]',
            )
            .first();
        if (await firstItem.isVisible().catch(() => false)) {
            await firstItem.click();
            // Give the form time to render
            await page.waitForTimeout(300);

            await expect(page).toHaveScreenshot("settings_plugin_form.png", {
                fullPage: true,
            });
        }
    });
});
