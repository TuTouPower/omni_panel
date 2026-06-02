import type { ElectronApplication, Page } from "@playwright/test";

import { expect, test } from "../fixtures/test";
import { SettingsPage } from "../pages/settings_page";

test.describe("settings view", () => {
    async function navigateToSettings(app: ElectronApplication, page: Page) {
        return SettingsPage.openViaIpc(app, page);
    }

    test("shows sidebar navigation", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await page.waitForSelector(".app-title", { timeout: 10_000 });
        const settings = await navigateToSettings(omni.app, page);
        await expect(settings.page.locator('[data-testid="settings-sidebar"]')).toBeVisible();
    });

    test("shows plugin navigation items", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await page.waitForSelector(".app-title", { timeout: 10_000 });
        const settings = await navigateToSettings(omni.app, page);
        const sidebar = settings.page.locator('[data-testid="settings-sidebar"]');
        await expect(sidebar).toBeVisible();
    });

    test("plugins with parameters show config forms in account edit dialog", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await page.waitForSelector(".app-title", { timeout: 10_000 });
        const settings = await navigateToSettings(omni.app, page);
        const sPage = settings.page;

        await sPage.locator('[data-testid="settings-plugin-nav-accounts"]').click();
        const cpaGroup = sPage.locator(".acct-group").filter({ hasText: "CPA" }).first();
        await expect(cpaGroup).toBeVisible();
        await cpaGroup.locator('button[title="编辑"]').first().click();

        // CPA uses CpaConnectorSettings (data-testid="cpa-connector-settings")
        const form = sPage.locator('[data-testid="cpa-connector-settings"]');
        await expect(form).toBeVisible();
        await expect(form.locator('input[name="cpa_mgmt_key"]')).toBeVisible();
        await expect(form.locator('input[name="endpoint:default"]')).toBeVisible();
        await expect(sPage.locator("text=无可配置参数")).toHaveCount(0);
    });
});
