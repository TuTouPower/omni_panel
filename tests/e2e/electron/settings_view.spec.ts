import type { ElectronApplication, Page } from "@playwright/test";

import { expect, test } from "../fixtures/test";
import { SettingsPage } from "../pages/settings_page";

/**
 * Electron 专属 settings case：
 * - accounts 页 config forms（依赖 `.acc-row`/`.acc-card` DOM，web SPA 无）
 * - CPA 连接设置内 per-provider 数据标签映射对话框（web SPA 无）
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
        const cpaRow = sPage.locator(".acc-row").filter({ hasText: "CPA" }).first();
        await expect(cpaRow).toBeVisible();
        await cpaRow.locator('button[title^="编辑"]').first().click();

        // CPA detail page renders inline (not in a dialog)
        const form = sPage.locator('[data-testid="cpa-connector-settings"]');
        await expect(form).toBeVisible({ timeout: 10_000 });
        await expect(form.locator('input[name="cpa_mgmt_key"]')).toBeVisible();
        await expect(form.locator('input[name="endpoint:default"]')).toBeVisible();
        await expect(sPage.locator("text=无可配置参数")).toHaveCount(0);
    });

    test("renders empty label-map dialog from CPA settings", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await page.waitForSelector(".app-title", { timeout: 10_000 });
        const settings = await navigateToSettings(omni.app, page);
        const sPage = settings.page;

        await sPage.locator('[data-testid="settings-plugin-nav-accounts"]').click();
        const cpaRow = sPage.locator(".acc-row").filter({ hasText: "CPA" }).first();
        await expect(cpaRow).toBeVisible();
        await cpaRow.locator('button[title^="编辑"]').first().click();
        await expect(sPage.locator('[data-testid="cpa-connector-settings"]')).toBeVisible({
            timeout: 10_000,
        });

        // The label map feature moved from a global appearance field to a
        // per-provider dialog inside the connector settings (24ae7d78).
        await sPage.locator('button[title="编辑数据标签映射"]').first().click();

        const dialog = sPage.locator(".acct-dialog").first();
        await expect(dialog).toBeVisible({ timeout: 10_000 });
        await expect(dialog.getByText("数据标签映射")).toBeVisible();

        // Without a live CPA sync there are no raw labels; the dialog still
        // renders its empty state and can be dismissed.
        await expect(dialog.getByText("该服务暂无可映射的数据标签")).toBeVisible();
        await dialog.getByRole("button", { name: "关闭" }).click();
        await expect(dialog).toBeHidden();
    });
});
