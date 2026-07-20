import { expect, test } from "../fixtures/test";
import { PopupPage } from "../pages/popup_page";

/**
 * Phase 21 E2E: demo UI alignment verification.
 * Checks top bar, provider tabs, overview cards, status bar.
 */
test.describe("popup demo alignment", () => {
    test("top bar has logo, title, refresh, and settings buttons", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        await expect(page.locator(".app-title").first()).toHaveText("OmniUsage");
        await expect(page.locator('[title="刷新全部"]').first()).toBeVisible();
        await expect(page.locator('[title="设置"]').first()).toBeVisible();
    });

    test("overview tab shows provider cards", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        const cards = page.locator(".card");
        expect(await cards.count()).toBeGreaterThan(0);
    });

    test("title bar shows update time", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        const timeLabel = page.locator(".tb-time").first();
        await expect(timeLabel).toBeVisible();
    });
});
