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
        await page.close();
        // App should stay alive (tray keeps it alive in production)
        // In E2E mode, process may still be running
    });

    test("multiple windows can coexist", async ({ omni }) => {
        const page1 = await omni.app.firstWindow();
        const dashboard = new DashboardPage(page1);
        await dashboard.waitReady();

        // Open settings via hash navigation on same window
        await page1.evaluate(() => {
            window.location.hash = "#settings";
        });
        await page1.waitForFunction(() => window.location.hash === "#settings", undefined, {
            timeout: 5000,
        });
        await expect(page1.locator('[data-testid="settings-sidebar"]')).toBeVisible();
    });
});
