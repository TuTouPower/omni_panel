import { expect, test } from "../fixtures/test";
import { PopupPage } from "../pages/popup_page";

test.describe("popup visual states", () => {
    test("ready state with plugin cards", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // Wait for cards to render and state transitions to settle
        await page
            .locator(".card")
            .first()
            .waitFor({ timeout: 10_000 })
            .catch(() => undefined);
        await page.waitForTimeout(2000);
        const screenshot = await page.screenshot({ fullPage: true });
        expect(screenshot).toMatchSnapshot("popup_ready.png");
    });

    test("title bar area", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        await page
            .locator(".card")
            .first()
            .waitFor({ timeout: 10_000 })
            .catch(() => undefined);
        await page.waitForTimeout(2000);
        const titleBar = page.locator(".app-title").first();
        const screenshot = await titleBar.screenshot();
        expect(screenshot).toMatchSnapshot("popup_title_bar.png");
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
