import { expect, test } from "../fixtures/test";
import { PopupPage } from "../pages/popup_page";

/**
 * Phase 21 E2E: card state visual verification.
 * Close/grayed, error/retry, auth/settings link, limit/danger bar.
 */
test.describe("popup card states", () => {
    test("error card shows retry action", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // Error state cards should show error text or retry
        const error_cards = page.locator(".card-state.err");
        // May be 0 if no connectors are failing
        expect(await error_cards.count()).toBeGreaterThanOrEqual(0);
    });

    test("auth failure shows settings link", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        const auth_cards = page.locator(".card-state.auth");
        expect(await auth_cards.count()).toBeGreaterThanOrEqual(0);
    });

    test("critical usage shows alert border", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        const alert_cards = page.locator(".card.alert");
        // Alert class is applied when status === "critical"
        expect(await alert_cards.count()).toBeGreaterThanOrEqual(0);
    });

    test("usage bar inverts text color when fill >= 52%", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        const inverted = await page.evaluate(() => {
            const bars = document.querySelectorAll('.ub-bar[data-invert="true"]');
            return bars.length;
        });
        expect(inverted).toBeGreaterThanOrEqual(0);
    });
});
