import type { ElectronApplication, Page } from "@playwright/test";

import { expect, test } from "../fixtures/test";
import { SettingsPage } from "../pages/settings_page";

async function navigate_to_settings(app: ElectronApplication, page: Page): Promise<Page> {
    const settings = await SettingsPage.openViaIpc(app, page);
    return settings.page;
}

test.describe("settings visual states", () => {
    test("sidebar with plugin list", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await page.waitForSelector(".app-title", { timeout: 10_000 });
        const sPage = await navigate_to_settings(omni.app, page);

        const sidebar = sPage.locator('[data-testid="settings-sidebar"]');
        await expect(sidebar).toHaveScreenshot("settings_sidebar.png");
    });

    test("full settings page", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await page.waitForSelector(".app-title", { timeout: 10_000 });
        const sPage = await navigate_to_settings(omni.app, page);

        await expect(sPage).toHaveScreenshot("settings_full.png", {
            fullPage: true,
        });
    });

    test("first plugin selected with form", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await page.waitForSelector(".app-title", { timeout: 10_000 });
        const sPage = await navigate_to_settings(omni.app, page);

        // Click the first sidebar item to select a plugin
        const firstItem = sPage
            .locator(
                '[data-testid="settings-sidebar"] button, [data-testid="settings-sidebar"] [role="button"]',
            )
            .first();
        if (await firstItem.isVisible().catch(() => false)) {
            await firstItem.click();
            // Give the form time to render
            await sPage.waitForTimeout(300);

            await expect(sPage).toHaveScreenshot("settings_plugin_form.png", {
                fullPage: true,
            });
        }
    });
});
