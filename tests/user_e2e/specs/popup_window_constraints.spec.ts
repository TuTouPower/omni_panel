import { expect, test } from "../fixtures/test";
import { PopupPage } from "../pages/popup_page";

/**
 * Phase 20 E2E: window height constraints — max 75%, internal scroll,
 * collapsed min height, no bottom whitespace regression.
 */
test.describe("popup window constraints", () => {
    test("window height does not exceed 75% of screen work area", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        const { window_height, work_area_height } = await page.evaluate(() => {
            return {
                window_height: window.outerHeight,
                work_area_height: screen.availHeight,
            };
        });

        const max_allowed = Math.floor(work_area_height * 0.75);
        // Allow 15px tolerance for OS window decorations and rounding
        expect(window_height).toBeLessThanOrEqual(max_allowed + 15);
    });

    test("scroll area is present when content exceeds max height", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // The scroll area should always exist in the popup layout
        const scroll_el = page.locator(".scroll").first();
        await expect(scroll_el).toBeVisible();
    });

    test("collapsing all cards does not leave large bottom whitespace", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // Collapse all collapsible cards
        let btns = page.locator('[aria-label="折叠"]');
        while ((await btns.count()) > 0) {
            await btns.first().click();
            await page.waitForTimeout(200);
            btns = page.locator('[aria-label="折叠"]');
        }

        // Scroll area should fill the window with minimal gap
        const gap = await page.evaluate(() => {
            const scroll = document.querySelector(".scroll");
            if (!(scroll instanceof HTMLElement)) return -1;
            const root = document.querySelector(".window");
            if (!(root instanceof HTMLElement)) return -1;
            const root_rect = root.getBoundingClientRect();
            const scroll_rect = scroll.getBoundingClientRect();
            return root_rect.bottom - scroll_rect.bottom;
        });
        expect(gap).toBeLessThan(30);
    });
});
