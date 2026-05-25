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
});
