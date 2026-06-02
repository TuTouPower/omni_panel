import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures/test";
import { PopupPage } from "../pages/popup_page";

async function openSettings(page: Page) {
    const baseUrl = page.url().split("#")[0] ?? "";
    await page.goto(baseUrl + "#settings");
    await page.waitForSelector('[data-testid="settings-sidebar"]', { timeout: 10_000 });
}

async function openAccountForm(page: Page, name: string) {
    await page.locator('[data-testid="settings-plugin-nav-accounts"]').click();
    const group = page.locator(".acct-group").filter({ hasText: name }).first();
    await expect(group).toBeVisible();
    await group.locator('button[title="编辑"]').first().click();
    // CPA uses CpaConnectorSettings (data-testid="cpa-connector-settings"),
    // other plugins use SettingsForm (data-testid="settings-form-{id}").
    const form = page.locator('[data-testid="cpa-connector-settings"]');
    const fallbackForm = page
        .locator('[data-testid^="settings-form-"]')
        .filter({ hasText: name })
        .first();
    const cpaForm = await form.count();
    if (cpaForm > 0) {
        await expect(form).toBeVisible();
        return form;
    }
    await expect(fallbackForm).toBeVisible();
    return fallbackForm;
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

        const form = await openAccountForm(page, "CPA");
        await form.locator('input[name="endpoint:default"]').fill("https://cpa.example.test");
        await form.locator('input[name="cpa_mgmt_key"]').fill("test-api-key");

        await form.locator('button[type="submit"]').click();
        await expect(page.locator('[role="dialog"]')).toBeHidden();
    });

    test("CPA is configured as a data source not a main provider", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await openSettings(page);

        await page.locator('[data-testid="settings-plugin-nav-accounts"]').click();
        const group = page.locator(".acct-group").filter({ hasText: "CPA 额度连接器" }).first();
        await expect(group).toBeVisible();
        await group.locator('button[title="编辑"]').first().click();

        await expect(page.getByLabel("CPA-Manager URL")).toBeVisible();
        await expect(page.getByRole("button", { name: "测试连接" })).toBeVisible();
    });

    test("CPA settings persist after app restart without exposing the secret", async ({ omni }) => {
        let page = await omni.app.firstWindow();
        await openSettings(page);

        let form = await openAccountForm(page, "CPA");
        await form.locator('input[name="endpoint:default"]').fill("https://cpa.example.test");
        await form.locator('input[name="cpa_mgmt_key"]').fill("secret-management-key");
        // CpaConnectorSettings submits via the form's built-in save button
        await form.locator('button[type="submit"]').click();
        await expect(page.locator('[role="dialog"]')).toBeHidden();

        await omni.stop();
        await omni.start();

        page = await omni.app.firstWindow();
        await openSettings(page);
        form = await openAccountForm(page, "CPA");
        await expect(form.locator('input[name="endpoint:default"]')).toHaveValue(
            "https://cpa.example.test",
        );
        await expect(form.locator('input[name="cpa_mgmt_key"]')).toHaveValue("***");
        await expect(form.locator('input[name="cpa_mgmt_key"]')).not.toHaveValue(
            "secret-management-key",
        );
    });
});
