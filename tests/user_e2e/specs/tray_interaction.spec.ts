import type { Page } from "@playwright/test";
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

test.describe("tray interaction", () => {
    test("popup renders when tray is active", async ({ omni }) => {
        // E2E_WITH_TRAY=1: tray created, popup auto-opens
        const page = await omni.app.firstWindow();
        await page.waitForLoadState("domcontentloaded");
        await expect(page.getByText("OmniUsage")).toBeVisible({ timeout: 10_000 });
    });

    test("tray click closes open popup", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await page.waitForLoadState("domcontentloaded");
        await expect(page.getByText("OmniUsage")).toBeVisible({ timeout: 10_000 });

        const closePromise = page.waitForEvent("close", { timeout: 10_000 });
        await triggerTrayClick(page);
        await closePromise;

        expect(omni.app.windows().length).toBe(0);
    });
});
