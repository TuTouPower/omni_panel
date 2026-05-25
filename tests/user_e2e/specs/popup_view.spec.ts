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
        await expect(page.getByLabel("刷新")).toBeVisible();
        await page.getByLabel("刷新").click();
    });

    test("shows plugin cards or empty state", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        // Either plugin cards or empty state should be visible
        const hasCards = await page.locator('[data-testid="popup-plugin-card"]').count();
        const hasEmpty = await page
            .locator('[data-testid="popup-empty"]')
            .isVisible()
            .catch(() => false);
        expect(hasCards > 0 || hasEmpty).toBe(true);
    });
});
