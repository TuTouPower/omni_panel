import type { ElectronApplication, Page } from "@playwright/test";
import { createTestWithSetup } from "../fixtures/test_with_setup";

const { test, expect } = createTestWithSetup({
    enableTray: true,
});

async function triggerTrayClick(page: Page): Promise<void> {
    // Fire-and-forget: trayClick closes the popup window, which destroys the
    // renderer context before page.evaluate can resolve. Don't await the inner
    // promise; swallow the inevitable "context closed" error.
    await page
        .evaluate(() => {
            const w = window as unknown as Record<string, { trayClick: () => void }>;
            w["__test__"]?.trayClick();
        })
        .catch(() => undefined);
}

async function findPopupPage(app: ElectronApplication): Promise<Page> {
    // With custom tray menu, firstWindow() may return the tray menu window.
    // Wait for a window that contains the data-popup="live" element.
    for (let i = 0; i < 20; i++) {
        for (const win of app.windows()) {
            if (win.isClosed()) continue;
            const hasPopup = await win
                .locator('[data-popup="live"]')
                .count()
                .catch(() => 0);
            if (hasPopup > 0) return win;
        }
        await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("Popup window not found after 10s");
}

test.describe("tray interaction", () => {
    test("popup renders when tray is active", async ({ omni }) => {
        // E2E_WITH_TRAY=1: tray created, popup auto-opens
        const page = await findPopupPage(omni.app);
        await page.waitForLoadState("domcontentloaded");
        await expect(page.locator('[data-popup="live"]').getByText("OmniUsage")).toBeVisible({
            timeout: 10_000,
        });
    });

    test("tray click closes open popup", async ({ omni }) => {
        const page = await findPopupPage(omni.app);
        await page.waitForLoadState("domcontentloaded");
        await expect(page.locator('[data-popup="live"]').getByText("OmniUsage")).toBeVisible({
            timeout: 10_000,
        });

        const closePromise = page.waitForEvent("close", { timeout: 10_000 });
        await triggerTrayClick(page);
        await closePromise;

        expect(omni.app.windows().filter((w) => !w.isClosed()).length).toBeLessThanOrEqual(1);
    });
});
