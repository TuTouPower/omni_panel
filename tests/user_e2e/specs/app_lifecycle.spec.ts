import { expect, test } from "../fixtures/test";
import { PopupPage } from "../pages/popup_page";

test.describe("app lifecycle", () => {
    test("app starts and first window is available", async ({ omni }) => {
        const app = omni.app;
        expect(app).toBeDefined();
        const page = await app.firstWindow();
        expect(page).toBeDefined();
    });

    test("popup window shows header and UI elements", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        const title = await popup.getTitle();
        expect(title).toContain("OmniUsage");
        await expect(page.getByRole("button", { name: "设置" })).toBeVisible();
    });

    test("refresh button is visible", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await expect(page.getByTitle("刷新全部")).toBeVisible();
    });

    test("popup main content renders", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();
        await expect(page.locator(".scroll")).toBeVisible();
    });

    test("settings navigation works from popup", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();
        await popup.clickSettings();
        await page.waitForFunction(() => window.location.hash === "#settings", undefined, {
            timeout: 5000,
        });
    });

    test("window can be closed without crashing", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await expect(page.locator(".scroll")).toBeVisible();
        await page.close();
    });

    test("settings view renders from popup navigation", async ({ omni }) => {
        const page1 = await omni.app.firstWindow();
        const popup = new PopupPage(page1);
        await popup.waitReady();

        await page1.evaluate(() => {
            window.location.hash = "#settings";
        });
        await page1.waitForFunction(() => window.location.hash === "#settings", undefined, {
            timeout: 5000,
        });
        await expect(page1.locator('[data-testid="settings-sidebar"]')).toBeVisible();
        const navItems = page1.locator('[data-testid^="settings-plugin-nav-"]');
        const count = await navItems.count();
        expect(count).toBeGreaterThan(0);
    });
});
