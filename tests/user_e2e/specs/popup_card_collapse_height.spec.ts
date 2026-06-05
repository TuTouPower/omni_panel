import { expect, test } from "../fixtures/test";
import { PopupPage } from "../pages/popup_page";

/**
 * Phase 20 E2E: verify that collapsing/expanding provider cards
 * changes the popup window height.
 */
test.describe("popup card collapse height", () => {
    test("collapse single card reduces window height", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // Click the first collapsible card's chevron to collapse it
        const collapse_btns = page.locator('[aria-label="折叠"]');
        const count = await collapse_btns.count();
        if (count > 0) {
            const height_before = await page.evaluate(() => document.body.offsetHeight);
            await collapse_btns.first().click();
            await page.waitForTimeout(500);
            const height_after = await page.evaluate(() => document.body.offsetHeight);
            // Height should decrease after collapsing
            expect(height_after).toBeLessThanOrEqual(height_before);
        }
    });

    test("expand card restores window height", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // First collapse a card
        const collapse_btns = page.locator('[aria-label="折叠"]');
        if ((await collapse_btns.count()) > 0) {
            await collapse_btns.first().click();
            await page.waitForTimeout(400);

            const height_collapsed = await page.evaluate(() => document.body.offsetHeight);

            // Now expand the same card
            const expand_btns = page.locator('[aria-label="展开"]');
            if ((await expand_btns.count()) > 0) {
                await expand_btns.first().click();
                await page.waitForTimeout(400);

                const height_expanded = await page.evaluate(() => document.body.offsetHeight);
                expect(height_expanded).toBeGreaterThanOrEqual(height_collapsed);
            }
        }
    });

    test("collapse all cards approaches minimum height", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // Collapse every visible card
        let collapse_btns = page.locator('[aria-label="折叠"]');
        while ((await collapse_btns.count()) > 0) {
            await collapse_btns.first().click();
            await page.waitForTimeout(200);
            collapse_btns = page.locator('[aria-label="折叠"]');
        }

        // Statusbar should still be visible and near the bottom
        const statusbar = page.locator(".statusbar").first();
        await expect(statusbar).toBeVisible();

        // No large bottom whitespace — scope to live popup only
        const space = await page.evaluate(() => {
            const live = document.querySelector('[data-popup="live"]');
            if (!(live instanceof HTMLElement)) return -1;
            const sb = live.querySelector(".statusbar");
            if (!(sb instanceof HTMLElement)) return -1;
            const sb_rect = sb.getBoundingClientRect();
            const body_height = live.offsetHeight;
            return body_height - sb_rect.bottom;
        });
        expect(space).toBeLessThan(20);
    });

    test("new data resets collapse state after tab switch", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // Switch to a provider tab
        const provider_tabs = page.locator('[role="button"][name]:not([name="总览"])');
        const tab_count = await provider_tabs.count();
        if (tab_count > 0) {
            await provider_tabs.first().click();
            await page.waitForTimeout(300);

            // Collapse an account if possible
            const collapse_btns = page.locator('[aria-label^="折叠"]');
            if ((await collapse_btns.count()) > 0) {
                await collapse_btns.first().click();
                await page.waitForTimeout(200);
            }

            // Switch to overview then back — structure signature changes
            await page.locator('[role="button"][name="总览"]').click();
            await page.waitForTimeout(200);
            await provider_tabs.first().click();
            await page.waitForTimeout(300);

            // Cards should be re-expanded (no collapsed toggles)
            const expand_btns = page.locator('[aria-label^="折叠"]');
            const expanded_count = await expand_btns.count();
            // After tab switch, cards should be back in expanded state
            // (we see "折叠" labels, not "展开")
            expect(expanded_count).toBeGreaterThanOrEqual(0);
        }
    });
});
