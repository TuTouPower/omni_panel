import type { ElectronApplication, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";

async function openSettings(app: ElectronApplication, page: Page): Promise<Page> {
    await page.evaluate(() => {
        window.usageboard.settings.open();
    });
    const settings_window = await app.waitForEvent("window", { timeout: 10_000 });
    await settings_window.waitForLoadState("domcontentloaded");
    await settings_window.waitForSelector('[data-testid="settings-sidebar"]', { timeout: 10_000 });
    return settings_window;
}

async function openAddAccountDialog(page: Page) {
    await page.locator('[data-testid="settings-plugin-nav-accounts"]').click();
    await page.getByRole("button", { name: /^添加$/ }).click();
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 10_000 });
}

test.describe("add account dialog", () => {
    test("grok uses OAuth device-code form", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const settings_page = await openSettings(omni.app, page);
        await openAddAccountDialog(settings_page);

        await settings_page.getByRole("button", { name: "Grok" }).click();
        await expect(settings_page.getByText("开始登录")).toBeVisible();
        await expect(settings_page.locator('input[type="password"]')).toHaveCount(0);
    });

    test("opencode_go uses web-login form", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const settings_page = await openSettings(omni.app, page);
        await openAddAccountDialog(settings_page);

        await settings_page.getByRole("button", { name: "OpenCode Go" }).click();
        await expect(settings_page.getByRole("button", { name: "网页登录" })).toBeVisible();
        await expect(settings_page.locator("textarea")).toHaveCount(0);
    });

    test("exa uses service-key + api-key-id form and saves account", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const settings_page = await openSettings(omni.app, page);
        await openAddAccountDialog(settings_page);

        await settings_page.getByRole("button", { name: "Exa" }).click();
        await expect(settings_page.getByPlaceholder("exa-…")).toBeVisible();
        await expect(settings_page.getByPlaceholder("例如：my-key-id")).toBeVisible();

        await settings_page.getByPlaceholder("例如：工作账号").fill("Exa E2E");
        await settings_page.getByPlaceholder("exa-…").fill("exa-service-key");
        await settings_page.getByPlaceholder("例如：my-key-id").fill("exa-key-id");
        await settings_page.getByRole("button", { name: "添加账号" }).click();

        await expect(settings_page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 10_000 });
        await expect(
            settings_page.locator(".acc-row").filter({ hasText: "Exa E2E" }).first(),
        ).toBeVisible({
            timeout: 10_000,
        });
    });

    test("cpa uses management-key form and saves account", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const settings_page = await openSettings(omni.app, page);
        await openAddAccountDialog(settings_page);

        await settings_page.getByRole("button", { name: "CPA Manager" }).click();
        await expect(settings_page.getByText("CPA 管理密钥")).toBeVisible();
        await expect(settings_page.getByPlaceholder("http://127.0.0.1:17863")).toBeVisible();

        await settings_page.getByPlaceholder("例如：工作账号").fill("CPA E2E");
        await settings_page.locator('input[type="password"]').fill("cpa-mgmt-key");
        await settings_page.getByRole("button", { name: "添加账号" }).click();

        await expect(settings_page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 10_000 });
        await expect(
            settings_page.locator(".acc-row").filter({ hasText: "CPA E2E" }).first(),
        ).toBeVisible({ timeout: 10_000 });
    });
});
