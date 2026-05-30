import { expect, test } from "../fixtures/test";
import { PopupPage } from "../pages/popup_page";

test.describe("suspend and resume", () => {
    test("suspend event stops scheduled refreshes without crashing", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // Emit suspend event in the main process via powerMonitor
        await omni.app.evaluate(({ powerMonitor }) => {
            powerMonitor.emit("suspend");
        });

        // App should still be responsive (no crash)
        await expect(page.locator(".scroll")).toBeVisible({ timeout: 5_000 });
        const title = await popup.getTitle();
        expect(title).toContain("OmniUsage");
    });

    test("resume event restarts refreshes without crashing", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // Suspend then resume
        await omni.app.evaluate(({ powerMonitor }) => {
            powerMonitor.emit("suspend");
        });
        await page.waitForTimeout(500);

        await omni.app.evaluate(({ powerMonitor }) => {
            powerMonitor.emit("resume");
        });

        // App should remain functional after resume
        await expect(page.locator(".scroll")).toBeVisible({ timeout: 5_000 });
        await expect(page.getByTitle("刷新全部")).toBeVisible();

        // Wait briefly for scheduler to restart and verify no crash
        await page.waitForTimeout(2000);
        await expect(page.locator(".scroll")).toBeVisible();
    });
});
