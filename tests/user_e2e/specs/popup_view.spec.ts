import { expect, test } from "../fixtures/test";
import { DashboardPage } from "../pages/dashboard_page";

test.describe("popup view", () => {
    test("shows title with logo", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const dashboard = new DashboardPage(page);
        await dashboard.waitReady();
        const title = await dashboard.getTitle();
        expect(title).toContain("OmniUsage");
    });

    test("refresh button is visible and clickable", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await expect(page.getByLabel("刷新")).toBeVisible();
        await page.getByLabel("刷新").click();
    });

    test("main content area is rendered", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const dashboard = new DashboardPage(page);
        await dashboard.waitReady();
        await expect(page.locator("main")).toBeVisible();
    });
});
