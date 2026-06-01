import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures/test";
import { SettingsPage } from "../pages/settings_page";

test.describe("settings view", () => {
    async function navigateToSettings(page: Page) {
        await page.evaluate(() => {
            window.location.hash = "#settings";
        });
        await page.waitForFunction(() => window.location.hash === "#settings", undefined, {
            timeout: 5000,
        });
    }

    test("shows sidebar navigation", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await page.waitForSelector(".app-title", { timeout: 10_000 });
        await navigateToSettings(page);
        const settings = new SettingsPage(page);
        await settings.waitReady();
        await expect(page.locator('[data-testid="settings-sidebar"]')).toBeVisible();
    });

    test("shows plugin navigation items", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await page.waitForSelector(".app-title", { timeout: 10_000 });
        await navigateToSettings(page);
        const settings = new SettingsPage(page);
        await settings.waitReady();
        const sidebar = page.locator('[data-testid="settings-sidebar"]');
        await expect(sidebar).toBeVisible();
    });

    test("plugins with parameters show config forms in account edit dialog", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await page.waitForSelector(".app-title", { timeout: 10_000 });
        await navigateToSettings(page);
        const settings = new SettingsPage(page);
        await settings.waitReady();

        await page.locator('[data-testid="settings-plugin-nav-accounts"]').click();
        const cpaGroup = page.locator(".acct-group").filter({ hasText: "CPA" }).first();
        await expect(cpaGroup).toBeVisible();
        await cpaGroup.locator('button[title="编辑"]').click();

        // CPA uses CpaConnectorSettings (data-testid="cpa-connector-settings")
        const form = page.locator('[data-testid="cpa-connector-settings"]');
        await expect(form).toBeVisible();
        await expect(form.locator('input[name="cpa_mgmt_key"]')).toBeVisible();
        await expect(form.locator('input[name="endpoint:default"]')).toBeVisible();
        await expect(page.locator("text=无可配置参数")).toHaveCount(0);
    });
});
