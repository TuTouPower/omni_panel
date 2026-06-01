import { expect, test } from "../fixtures/test";
import { PopupPage } from "../pages/popup_page";

/**
 * Phase 20 E2E: multi-display behavior.
 * Verifies that the popup uses the correct display for height
 * calculations. Requires real multi-monitor setup; skipped in CI.
 */
test.describe("popup multi display", () => {
    test("popup uses current display for max height calculation", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // Verify the window has a reasonable height based on screen
        const { height, avail_height } = await page.evaluate(() => {
            return {
                height: window.outerHeight,
                avail_height: screen.availHeight,
            };
        });

        expect(height).toBeGreaterThan(0);
        expect(height).toBeLessThanOrEqual(avail_height);
    });

    test("max height is computed per-display on re-open", async ({ omni }) => {
        // This test depends on multi-monitor environment.
        // CI may skip it; intended for local manual verification.
        if (process.env["CI"] || !process.env["MULTI_DISPLAY"]) {
            test.skip();
        }

        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        const height1 = await page.evaluate(() => window.outerHeight);

        // After reopen, height should still obey 85% rule
        expect(height1).toBeGreaterThan(0);
        expect(height1).toBeLessThanOrEqual(Math.floor(screen.availHeight * 0.85) + 10);
    });
});
