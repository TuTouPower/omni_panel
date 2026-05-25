import { expect, test } from "../fixtures/test";
import { DashboardPage } from "../pages/dashboard_page";

test.describe("dashboard view", () => {
    test("shows dashboard title", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const dashboard = new DashboardPage(page);
        await dashboard.waitReady();
        const title = await dashboard.getTitle();
        expect(title).toContain("OmniUsage Dashboard");
    });

    test("settings button navigates to settings", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const dashboard = new DashboardPage(page);
        await dashboard.waitReady();
        await dashboard.clickSettings();
        await page.waitForURL("**/*settings*", { timeout: 5000 });
    });

    test("refresh button is visible", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await expect(page.getByLabel("刷新")).toBeVisible();
    });

    test("shows plugin list or empty state", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const hasList = await page
            .locator('[data-testid="dashboard-plugin-list"]')
            .isVisible()
            .catch(() => false);
        const hasEmpty = await page
            .locator('[data-testid="dashboard-empty"]')
            .isVisible()
            .catch(() => false);
        expect(hasList || hasEmpty).toBe(true);
    });
});
