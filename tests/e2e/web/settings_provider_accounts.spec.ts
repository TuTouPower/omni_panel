import { expect, test } from "../fixtures/test_web";
import { SettingsPage } from "../pages/settings_page";

/**
 * Web e2e：settings accounts/about 页（单次操作，非 restart）。
 * restart 持久化 case 留 electron/settings_provider_accounts.spec.ts（web 无 restart）。
 */
test.describe("settings provider accounts (web)", () => {
    test("about page shows real logo", async ({ webPage }) => {
        await webPage.waitForSelector('[data-testid="app-title"]', { timeout: 10_000 });
        const settings = await SettingsPage.open_via_hash(webPage);
        await settings.page.getByTestId("settings-plugin-nav-about").click();

        // t271：About 页已迁移为语义 token + utility class，logo 不再有 .ah-logo。
        // 标题栏与 About 页各有一个 alt="OmniPanel" 的 img；About 页 logo 固定
        // width=96（about_section.tsx），以此区分标题栏 24px 小 logo。
        const logo = settings.page.locator('img[alt="OmniPanel"][width="96"]');
        await expect(logo).toBeVisible();
    });

    test("about page shows version text", async ({ webPage }) => {
        await webPage.waitForSelector('[data-testid="app-title"]', { timeout: 10_000 });
        const settings = await SettingsPage.open_via_hash(webPage);
        await settings.page.getByTestId("settings-plugin-nav-about").click();

        // t271：版本文本为 `版本 {version}`（about_section.tsx 语义定位），
        // 不再有 .ah-ver；用文本前缀匹配版本行。
        await expect(settings.page.getByText(/^版本 /)).toBeVisible();
    });

    test("accounts page lists connector rows", async ({ webPage }) => {
        await webPage.waitForSelector('[data-testid="app-title"]', { timeout: 10_000 });
        const settings = await SettingsPage.open_via_hash(webPage);
        await settings.page.getByTestId("settings-plugin-nav-accounts").click();

        // 已添加连接列表（VendorCard 行），synthetic/real 均含 connector。
        // 注意：.accent-row 是外观页强调色 swatch，不属于 accounts 页；accounts
        // 页行结构为 accounts-list > account-card。
        const rows = settings.page.locator(
            '[data-testid="accounts-list"] [data-testid="account-card"]',
        );
        await expect(rows.first()).toBeVisible({ timeout: 10_000 });
        expect(await rows.count()).toBeGreaterThanOrEqual(1);
    });
});
