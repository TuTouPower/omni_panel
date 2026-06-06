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

    test("changes usage bar color scheme from appearance settings", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await page.waitForSelector(".app-title", { timeout: 10_000 });
        const settings = await navigateToSettings(omni.app, page);
        const sPage = settings.page;

        await sPage.locator('[data-testid="settings-plugin-nav-appearance"]').click();

        await expect(sPage.getByText("用量条颜色方案")).toBeVisible();
        await expect(sPage.getByRole("button", { name: /风险色：仅当前用量/ })).toBeVisible();
        await expect(sPage.getByRole("button", { name: /风险色：带投影预测/ })).toBeVisible();
        await expect(sPage.getByRole("button", { name: /彩色区分：九色循环/ })).toBeVisible();

        await sPage.getByRole("button", { name: /彩色区分：九色循环/ }).click();
        await expect(sPage.getByRole("button", { name: /彩色区分：九色循环/ })).toHaveClass(
            /\bon\b/,
        );
    });

    test("plugins with parameters show config forms in account edit dialog", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await page.waitForSelector(".app-title", { timeout: 10_000 });
        const settings = await navigateToSettings(omni.app, page);
        const sPage = settings.page;

        await sPage.locator('[data-testid="settings-plugin-nav-accounts"]').click();
        // Find the CPA connector row (e.g. "CPA · Claude"), not the provider group
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
});
