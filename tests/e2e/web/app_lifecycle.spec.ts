import { expect, test } from "../fixtures/test_web";
import { PopupPage } from "../pages/popup_page";
import { SettingsPage } from "../pages/settings_page";

/**
 * Web e2e：app lifecycle 中可平移到浏览器的 DOM 断言。
 * Electron 专属语义（firstWindow、独立窗口、page.close 不崩溃）留 specs/。
 */
test.describe("app lifecycle (web)", () => {
    test("popup shows header and UI elements", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const title = await popup.getTitle();
        expect(title).toContain("OmniUsage");
        await expect(popup.root().getByRole("button", { name: "设置" })).toBeVisible();
    });

    test("refresh button is visible", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();
        await expect(popup.root().getByTitle("刷新全部")).toBeVisible();
    });

    test("popup main content renders", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();
        await expect(popup.root().locator(".scroll")).toBeVisible();
    });

    test("settings opens via hash route from popup", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();
        await popup.clickSettings();

        // web SPA：settings 在同 page hash 路由
        const settings = await SettingsPage.open_via_hash(webPage);
        await expect(settings.page.locator('[data-testid="settings-sidebar"]')).toBeVisible();
    });

    test("settings view renders with plugin nav items", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const settings = await SettingsPage.open_via_hash(webPage);
        await expect(settings.page.locator('[data-testid="settings-sidebar"]')).toBeVisible();
        const navItems = settings.page.locator('[data-testid^="settings-plugin-nav-"]');
        const count = await navItems.count();
        expect(count).toBeGreaterThan(0);
    });
});
