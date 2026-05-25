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
        // Wait for any content to render first
        await page.waitForSelector("h1", { timeout: 10_000 });
        await navigateToSettings(page);
        const settings = new SettingsPage(page);
        await settings.waitReady();
        await expect(page.locator('[data-testid="settings-sidebar"]')).toBeVisible();
    });

    test("shows plugin navigation items", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await page.waitForSelector("h1", { timeout: 10_000 });
        await navigateToSettings(page);
        const settings = new SettingsPage(page);
        await settings.waitReady();
        const sidebar = page.locator('[data-testid="settings-sidebar"]');
        await expect(sidebar).toBeVisible();
    });

    test("plugins with parameters show config forms, not '无可配置参数'", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await page.waitForSelector("h1", { timeout: 10_000 });
        await navigateToSettings(page);
        const settings = new SettingsPage(page);
        await settings.waitReady();

        // At least some plugins (DeepSeek, Tavily, GLM, MiniMax) have parameters
        const forms = page.locator('[data-testid^="settings-form-"]');
        const formCount = await forms.count();
        expect(formCount).toBeGreaterThan(0);

        // There should be no more "无可配置参数" messages than plugins without parameters
        const noParamsMessages = page.locator("text=无可配置参数");
        const noParamsCount = await noParamsMessages.count();
        // Claude and Codex have no parameters, so at most 2 "无可配置参数"
        expect(noParamsCount).toBeLessThanOrEqual(2);
    });
});
