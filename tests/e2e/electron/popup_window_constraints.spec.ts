import { expect, test } from "../fixtures/test";
import { PopupPage } from "../pages/popup_page";

/**
 * Phase 20 E2E: window height constraints — max 100%, internal scroll,
 * collapsed min height, no bottom whitespace regression.
 *
 * 上限口径：`docs/specs/window-management.md` 规定「不超过 100% 工作区高度」
 * （t081 起 `MAX_HEIGHT_RATIO = 1.0`）。原断言写死 75% 是 t081 之前的口径，
 * 在默认全高可用时会误报，已按现行契约同步。
 */
test.describe("popup window constraints", () => {
    test("window height does not exceed the screen work area", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        const { window_height, work_area_height } = await page.evaluate(() => {
            return {
                window_height: window.outerHeight,
                work_area_height: screen.availHeight,
            };
        });

        const max_allowed = Math.floor(work_area_height);
        // Allow 15px tolerance for OS window decorations and rounding
        expect(window_height).toBeLessThanOrEqual(max_allowed + 15);
    });

    test("scroll area is present when content exceeds max height", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // The scroll area should always exist in the popup layout
        const scroll_el = page.locator('[data-testid="popup-scroll"]').first();
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
            const scroll = document.querySelector('[data-testid="popup-scroll"]');
            if (!(scroll instanceof HTMLElement)) return -1;
            const root = document.querySelector('[data-popup="live"]');
            if (!(root instanceof HTMLElement)) return -1;
            const root_rect = root.getBoundingClientRect();
            const scroll_rect = scroll.getBoundingClientRect();
            return root_rect.bottom - scroll_rect.bottom;
        });
        expect(gap).toBeLessThan(30);
    });
});
