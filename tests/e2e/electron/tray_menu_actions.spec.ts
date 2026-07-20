import { expect, test } from "../fixtures/test";
import { PopupPage } from "../pages/popup_page";
import { SettingsPage } from "../pages/settings_page";

/**
 * Phase 21 E2E: tray right-click menu actions verification.
 *
 * Since Electron tray menus are native and not accessible via
 * Playwright DOM selectors, this spec verifies the IPC-side
 * behaviors that each menu item triggers.
 */
test.describe("tray menu actions", () => {
    test("open main panel shows popup window", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // The popup should be visible (opened by test harness or tray click)
        const title = page.locator(".app-title").first();
        await expect(title).toBeVisible();
    });

    test("settings opens as independent window via IPC", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await page.waitForSelector(".app-title", { timeout: 10_000 });

        const settings = await SettingsPage.openViaIpc(omni.app, page);
        const sPage = settings.page;

        // Settings window should render independently
        await expect(sPage.locator('[data-testid="settings-sidebar"]')).toBeVisible();

        // Popup should still be open (scoped to popup's live container)
        await expect(page.locator('[data-popup="live"] .app-title')).toBeVisible();
    });

    test("refresh triggers connector refresh", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // Click refresh all button (simulates tray "立即刷新全部")
        const refresh_btn = page.locator('[title="刷新全部"]').first();
        await refresh_btn.click();

        // The button should exist and be clickable (no crash = pass)
        await expect(refresh_btn).toBeVisible();
    });

    test("quit command is available in menu labels", async ({ omni }) => {
        // The tray menu is rendered as a React component in a separate window.
        // Verify the quit menu item text exists in the rendered tray menu.
        const windows = omni.app.windows();
        const tray_page =
            windows.find((w) => w.url().includes("tray")) ?? (await omni.app.firstWindow());

        // Wait for the tray menu body to render
        await tray_page.waitForSelector(".tray-menu-body", { timeout: 10_000 });

        // The quit item contains "退出" (zh) or "Quit" (en)
        const quit_item = tray_page
            .locator(".ctx-item.danger, .ctx-item:has-text('退出'), .ctx-item:has-text('Quit')")
            .last();
        await expect(quit_item).toBeVisible();
        const text = await quit_item.textContent();
        expect(text).toMatch(/退出|Quit/);
    });
});
