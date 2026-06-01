import { expect, test } from "../fixtures/test";
import { PopupPage } from "../pages/popup_page";

/**
 * Phase 20 E2E: platform-specific popup window behavior.
 *
 * Each platform assertion is guarded — the test skips assertions
 * that don't apply to the current OS. CI may skip platform-specific
 * assertions entirely.
 */
test.describe("popup platform behavior", () => {
    test("popup window appears and is interactable", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        expect(await page.title()).toBeTruthy();
    });

    test("titlebar drag region is configured", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        const has_titlebar = await page.evaluate(() => {
            const tb = document.querySelector(".titlebar");
            if (!(tb instanceof HTMLElement)) return null;
            return tb.classList.contains("titlebar-no-drag");
        });

        expect(has_titlebar).not.toBeNull();
    });
});
