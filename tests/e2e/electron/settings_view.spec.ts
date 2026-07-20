import type { ElectronApplication, Page } from "@playwright/test";

import { expect, test } from "../fixtures/test";
import { SettingsPage } from "../pages/settings_page";

/**
 * Electron 专属 settings case：
 * - accounts 页 config forms（依赖 `.acct-row` DOM，web SPA 无）
 * - appearance 用量标签映射字段（web SPA 无）
 * 其余 sidebar / appearance 颜色样式 case 已迁 web/settings_view.spec.ts。
 */
test.describe("settings view (electron 专属)", () => {
    async function navigateToSettings(app: ElectronApplication, page: Page) {
        return SettingsPage.openViaIpc(app, page);
    }

    test("plugins with parameters show config forms in account edit dialog", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await page.waitForSelector(".app-title", { timeout: 10_000 });
        const settings = await navigateToSettings(omni.app, page);
        const sPage = settings.page;

        await sPage.locator('[data-testid="settings-plugin-nav-accounts"]').click();
        // Find the CPA connector row (e.g. "CPA · Claude"), not the provider groups
        const cpaRow = sPage.locator(".acct-row").filter({ hasText: "CPA" }).first();
        await expect(cpaRow).toBeVisible();
        await cpaRow.locator('button[title="编辑"]').first().click();

        // Wait for the dialog to appear
        await expect(sPage.locator('[role="dialog"]')).toBeVisible({ timeout: 10_000 });

        // CPA uses CpaConnectorSettings (data-testid="cpa-connector-settings")
        const form = sPage.locator('[data-testid="cpa-connector-settings"]');
        await expect(form).toBeVisible();
        await expect(form.locator('input[name="cpa_mgmt_key"]')).toBeVisible();
        await expect(form.locator('input[name="endpoint:default"]')).toBeVisible();
        await expect(sPage.locator("text=无可配置参数")).toHaveCount(0);
    });

    test("usage label map can be edited and saved", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await page.waitForSelector(".app-title", { timeout: 10_000 });
        const settings = await navigateToSettings(omni.app, page);
        const sPage = settings.page;

        await sPage.locator('[data-testid="settings-plugin-nav-appearance"]').click();

        const labelMapField = sPage.getByLabel("用量标签映射");
        await expect(labelMapField).toBeVisible();

        // Clear and type new value
        await labelMapField.fill("");
        await labelMapField.fill("glm-long=GLM Short");
        // Trigger blur to save
        await labelMapField.press("Tab");

        // Verify the textarea still shows the value after save
        await expect(labelMapField).toHaveValue("glm-long=GLM Short");
    });
});
