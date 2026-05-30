import { expect, test } from "../fixtures/test";
import { PopupPage } from "../pages/popup_page";

test.describe("popup visual states", () => {
    test("ready state with plugin cards", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // Wait for any pending network activity to settle
        await page.waitForLoadState("networkidle").catch(() => undefined);
        await expect(page).toHaveScreenshot("popup_ready.png", {
            fullPage: true,
        });
    });

    test("title bar area", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        const titleBar = page.locator(".app-title").first();
        await expect(titleBar).toHaveScreenshot("popup_title_bar.png");
    });

    test("plugin card area", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // The scroll area containing plugin cards
        const scrollArea = page.locator(".scroll");
        if (await scrollArea.isVisible().catch(() => false)) {
            await expect(scrollArea).toHaveScreenshot("popup_scroll_area.png");
        }
    });
});
