import { expect, test } from "../fixtures/test";
import { DashboardPage } from "../pages/dashboard_page";

test.describe("plugin configuration", () => {
    test("auto-creates plugin instances on first launch", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const dashboard = new DashboardPage(page);
        await dashboard.waitReady();

        // After auto-seeding, navigate to settings to verify plugin instances exist
        await page.evaluate(() => {
            window.location.hash = "#settings";
        });
        await page.waitForFunction(() => window.location.hash === "#settings", undefined, {
            timeout: 5000,
        });

        // There must be plugin nav items (6 bundled plugins should be seeded)
        const pluginNavItems = page.locator('[data-testid^="settings-plugin-nav-"]');
        const count = await pluginNavItems.count();
        expect(count).toBeGreaterThan(0);
    });

    test("settings form can be filled and saved", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const baseUrl = page.url().split("#")[0] ?? "";
        await page.goto(baseUrl + "#settings");
        await page.waitForTimeout(500);

        // At least one form must exist (DeepSeek, Tavily, GLM, MiniMax have parameters)
        const forms = page.locator('[data-testid^="settings-form-"]');
        const formCount = await forms.count();
        expect(formCount).toBeGreaterThan(0);

        // Fill first text/password input in first form
        const firstInput = forms
            .first()
            .locator('input[type="text"], input[type="password"]')
            .first();
        await expect(firstInput).toBeVisible();
        await firstInput.fill("test-api-key");

        // Click save button
        const saveBtn = page.locator('[data-testid^="settings-save-btn-"]').first();
        await expect(saveBtn).toBeVisible();
        await saveBtn.click();

        // After save, the form should still be visible (no crash, no redirect)
        await expect(forms.first()).toBeVisible();
    });
});
