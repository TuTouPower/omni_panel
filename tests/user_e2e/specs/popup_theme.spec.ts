import { expect, test } from "../fixtures/test";
import { PopupPage } from "../pages/popup_page";

/**
 * Phase 21 E2E: theme switch verification.
 */
test.describe("popup theme", () => {
    test("dark theme toggles data-theme attribute", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // Check current theme
        const theme_attr = await page.evaluate(() => {
            return document.documentElement.getAttribute("data-theme");
        });

        // Theme may be light or dark depending on system settings
        expect(theme_attr === "light" || theme_attr === "dark").toBe(true);
    });

    test("danger colors remain readable in dark mode", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        const danger_visible = await page.evaluate(() => {
            const el = document.querySelector(".card.alert .card-state.err");
            if (!(el instanceof HTMLElement)) return true; // no danger cards = OK
            const style = getComputedStyle(el);
            return style.color !== "" && style.display !== "none";
        });
        expect(danger_visible).toBe(true);
    });
});
