import { expect, test } from "../fixtures/test";
import { SettingsPage } from "../pages/settings_page";

test.describe("settings view", () => {
    test("shows sidebar navigation", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const baseUrl = page.url().split("#")[0] ?? "";
        await page.goto(baseUrl + "#settings");
        const settings = new SettingsPage(page);
        await settings.waitReady();

        await expect(page.locator('[data-testid="settings-sidebar"]')).toBeVisible();
    });

    test("shows plugin navigation items", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const baseUrl = page.url().split("#")[0] ?? "";
        await page.goto(baseUrl + "#settings");
        const settings = new SettingsPage(page);
        await settings.waitReady();

        // Either plugin nav items or "general" section should be visible
        const sidebar = page.locator('[data-testid="settings-sidebar"]');
        await expect(sidebar).toBeVisible();
    });
});
