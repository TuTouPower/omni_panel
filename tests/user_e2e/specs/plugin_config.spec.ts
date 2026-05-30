import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures/test";
import { PopupPage } from "../pages/popup_page";

async function openSettings(page: Page) {
    const baseUrl = page.url().split("#")[0] ?? "";
    await page.goto(baseUrl + "#settings");
    await page.waitForSelector('[data-testid="settings-sidebar"]', { timeout: 10_000 });
}

function cpaForm(page: Page) {
    return page.locator('[data-testid^="settings-form-"]').filter({ hasText: "CPA" }).first();
}

test.describe("plugin configuration", () => {
    test("auto-creates plugin instances on first launch", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        await page.evaluate(() => {
            window.location.hash = "#settings";
        });
        await page.waitForFunction(() => window.location.hash === "#settings", undefined, {
            timeout: 5000,
        });

        const pluginNavItems = page.locator('[data-testid^="settings-plugin-nav-"]');
        const count = await pluginNavItems.count();
        expect(count).toBeGreaterThan(0);
    });

    test("settings form can be filled and saved", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await openSettings(page);

        const forms = page.locator('[data-testid^="settings-form-"]');
        const formCount = await forms.count();
        expect(formCount).toBeGreaterThan(0);

        const firstInput = forms
            .first()
            .locator('input[type="text"], input[type="password"]')
            .first();
        await expect(firstInput).toBeVisible();
        await firstInput.fill("test-api-key");

        const saveBtn = page.locator('[data-testid^="settings-save-btn-"]').first();
        await expect(saveBtn).toBeVisible();
        await saveBtn.click();

        await expect(forms.first()).toBeVisible();
    });

    test("CPA settings persist after app restart without exposing the secret", async ({ omni }) => {
        let page = await omni.app.firstWindow();
        await openSettings(page);

        let form = cpaForm(page);
        await expect(form).toBeVisible();
        await form.locator('input[name="cpa_mgmt_url"]').fill("http://127.0.0.1:20224");
        await form.locator('input[name="cpa_mgmt_key"]').fill("secret-management-key");
        await form.locator('input[name="refreshIntervalMinutes"]').fill("7");
        await form.locator('button[type="submit"]').click();
        await expect(form.locator('button[type="submit"]')).toHaveText("已保存");

        await omni.stop();
        await omni.start();

        page = await omni.app.firstWindow();
        await openSettings(page);
        form = cpaForm(page);
        await expect(form).toBeVisible();
        await expect(form.locator('input[name="cpa_mgmt_url"]')).toHaveValue(
            "http://127.0.0.1:20224",
        );
        await expect(form.locator('input[name="cpa_mgmt_key"]')).toHaveValue("***");
        await expect(form.locator('input[name="cpa_mgmt_key"]')).not.toHaveValue(
            "secret-management-key",
        );
        await expect(form.locator('input[name="refreshIntervalMinutes"]')).toHaveValue("7");
    });
});
