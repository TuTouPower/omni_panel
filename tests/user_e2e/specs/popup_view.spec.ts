import { expect, test } from "../fixtures/test";
import { PopupPage } from "../pages/popup_page";

test.describe("popup view", () => {
    test("shows title with logo", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();
        const title = await popup.getTitle();
        expect(title).toContain("OmniUsage");
    });

    test("refresh button is visible and clickable", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await expect(page.getByTitle("刷新全部")).toBeVisible();
        await page.getByTitle("刷新全部").click();
    });

    test("main content area is rendered", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();
        await expect(page.locator(".scroll")).toBeVisible();
    });

    test("settings button navigates to settings", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();
        await popup.clickSettings();
        await page.waitForFunction(() => window.location.hash === "#settings", undefined, {
            timeout: 5000,
        });
    });
});
