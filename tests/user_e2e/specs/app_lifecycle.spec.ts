import { expect, test } from "../fixtures/test";
import { DashboardPage } from "../pages/dashboard_page";

test.describe("app lifecycle", () => {
    test("app starts and first window is available", async ({ omni }) => {
        const app = omni.app;
        expect(app).toBeDefined();
        const page = await app.firstWindow();
        expect(page).toBeDefined();
    });

    test("dashboard window shows header and UI elements", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const dashboard = new DashboardPage(page);
        await dashboard.waitReady();

        const title = await dashboard.getTitle();
        expect(title).toContain("OmniUsage Dashboard");
        await expect(page.getByRole("button", { name: "设置" })).toBeVisible();
    });

    test("refresh button is visible", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await expect(page.getByLabel("刷新")).toBeVisible();
    });

    test("dashboard main content renders", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const dashboard = new DashboardPage(page);
        await dashboard.waitReady();
        await expect(page.locator("main")).toBeVisible();
    });

    test("settings navigation works from dashboard", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const dashboard = new DashboardPage(page);
        await dashboard.waitReady();
        await dashboard.clickSettings();
        await page.waitForFunction(() => window.location.hash === "#settings", undefined, {
            timeout: 5000,
        });
    });

    test("window can be closed without crashing", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        // Verify page is functional before closing
        await expect(page.locator("main")).toBeVisible();
        await page.close();
        // App process should still be running after closing one window
        expect(omni.app.process().connected).toBe(true);
    });

    test("settings view renders from dashboard navigation", async ({ omni }) => {
        const page1 = await omni.app.firstWindow();
        const dashboard = new DashboardPage(page1);
        await dashboard.waitReady();

        // Navigate to settings via hash
        await page1.evaluate(() => {
            window.location.hash = "#settings";
        });
        await page1.waitForFunction(() => window.location.hash === "#settings", undefined, {
            timeout: 5000,
        });
        await expect(page1.locator('[data-testid="settings-sidebar"]')).toBeVisible();
        // Verify at least one plugin nav item is shown
        const navItems = page1.locator('[data-testid^="settings-plugin-nav-"]');
        const count = await navItems.count();
        expect(count).toBeGreaterThan(0);
    });
});
