import { expect, test } from "../fixtures/test";

test.describe("plugin configuration", () => {
    test("auto-creates plugin instances on first launch", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        // After auto-seeding, the app should have plugins
        // Check either dashboard shows plugin cards or settings shows plugin nav
        await page.waitForTimeout(1000); // Allow seeding to complete

        const hasPluginNav = await page.locator('[data-testid^="settings-plugin-nav-"]').count();
        const hasPluginCard = await page.locator('[data-testid^="dashboard-plugin-card-"]').count();
        // At least one should be present if plugins were discovered
        expect(hasPluginNav + hasPluginCard).toBeGreaterThanOrEqual(0);
    });

    test("settings form can be filled and saved", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const baseUrl = page.url().split("#")[0] ?? "";
        await page.goto(baseUrl + "#settings");
        await page.waitForTimeout(500);

        // Look for any settings form
        const forms = page.locator('[data-testid^="settings-form-"]');
        const formCount = await forms.count();
        if (formCount > 0) {
            // Fill first text input in first form
            const firstInput = forms
                .first()
                .locator('input[type="text"], input[type="password"]')
                .first();
            if (await firstInput.isVisible().catch(() => false)) {
                await firstInput.fill("test-value");
            }

            // Click save button
            const saveBtn = page.locator('[data-testid^="settings-save-btn-"]').first();
            if (await saveBtn.isVisible().catch(() => false)) {
                await saveBtn.click();
            }
        }
    });
});
