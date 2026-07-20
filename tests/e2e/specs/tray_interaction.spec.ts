import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ElectronApplication, Page } from "@playwright/test";
import { createTestWithSetup } from "../fixtures/test_with_setup";

const { test, expect } = createTestWithSetup({
    enableTray: true,
    setupPlugins: (userDataDir: string) => {
        writeFileSync(
            join(userDataDir, "config.json"),
            JSON.stringify({
                schemaVersion: 1,
                language: "zh-Hans",
                launchAtLogin: false,
                mainPanelMode: "popup",
                plugins: [],
            }),
        );
    },
});

async function triggerTrayClick(page: Page): Promise<void> {
    await page
        .evaluate(() => {
            window.usageboard.tray.open_panel();
        })
        .catch(() => undefined);
}

async function popupWindowCount(app: ElectronApplication): Promise<number> {
    return await app.evaluate(
        ({ BrowserWindow }) =>
            BrowserWindow.getAllWindows().filter((win) =>
                win.webContents.getURL().includes("#popup"),
            ).length,
    );
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

    test("tray click closes open popup when main panel mode is popup", async ({ omni }) => {
        const page = await findPopupPage(omni.app);
        await page.waitForLoadState("domcontentloaded");
        await expect(page.locator('[data-popup="live"]').getByText("OmniUsage")).toBeVisible({
            timeout: 10_000,
        });

        await triggerTrayClick(page);
        await expect.poll(() => popupWindowCount(omni.app)).toBe(0);
    });
});
