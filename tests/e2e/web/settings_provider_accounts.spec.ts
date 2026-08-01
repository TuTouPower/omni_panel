import { expect, test } from "../fixtures/test_web";
import { SettingsPage } from "../pages/settings_page";

/**
 * Web e2e：settings accounts/about 页（单次操作，非 restart）。
 * restart 持久化 case 留 electron/settings_provider_accounts.spec.ts（web 无 restart）。
 */
test.describe("settings provider accounts (web)", () => {
    test("about page shows real logo", async ({ webPage }) => {
        await webPage.waitForSelector(".app-title", { timeout: 10_000 });
        const settings = await SettingsPage.open_via_hash(webPage);
        await settings.page.getByTestId("settings-plugin-nav-about").click();

        const logo = settings.page.locator(".ah-logo");
        await expect(logo).toBeVisible();
    });

    test("about page shows version text", async ({ webPage }) => {
        await webPage.waitForSelector(".app-title", { timeout: 10_000 });
        const settings = await SettingsPage.open_via_hash(webPage);
        await settings.page.getByTestId("settings-plugin-nav-about").click();

        await expect(settings.page.locator(".ah-ver")).toContainText("版本");
    });

    test("accounts page lists connector rows", async ({ webPage }) => {
        await webPage.waitForSelector(".app-title", { timeout: 10_000 });
        const settings = await SettingsPage.open_via_hash(webPage);
        await settings.page.getByTestId("settings-plugin-nav-accounts").click();

        // 已添加连接列表（VendorCard 行），synthetic/real 均含 connector。
        // 注意：.accent-row 是外观页强调色 swatch，不属于 accounts 页；accounts
        // 页行结构为 .acct-list > .acc-card。
        const rows = settings.page.locator(".acct-list .acc-card");
        await expect(rows.first()).toBeVisible({ timeout: 10_000 });
        expect(await rows.count()).toBeGreaterThanOrEqual(1);
    });
});
