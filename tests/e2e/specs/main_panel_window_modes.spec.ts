import type { ElectronApplication, Page } from "@playwright/test";
import { createTestWithSetup } from "../fixtures/test_with_setup";

const { test, expect } = createTestWithSetup({ enableTray: true });

async function findMainPanelPage(app: ElectronApplication): Promise<Page> {
    for (let i = 0; i < 20; i++) {
        for (const win of app.windows()) {
            if (win.isClosed()) continue;
            const hasPanel = await win
                .locator('[data-popup="live"]')
                .count()
                .catch(() => 0);
            if (hasPanel > 0) return win;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("Main panel not found after 10s");
}

async function popupWindowState(
    app: ElectronApplication,
): Promise<{ exists: boolean; visible: boolean }> {
    return await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows().find((target) =>
            target.webContents.getURL().includes("#popup"),
        );
        return { exists: win !== undefined, visible: win?.isVisible() ?? false };
    });
}

test.describe("main panel window modes", () => {
    test("system mode opens a floating main panel on Windows and Linux", async ({ omni }) => {
        test.skip(process.platform === "darwin", "macOS system mode uses popup");
        const page = await findMainPanelPage(omni.app);
        await page.waitForLoadState("domcontentloaded");
        await expect(page.locator('[data-popup="live"]').getByText("OmniUsage")).toBeVisible();
        await expect(page.getByRole("button", { name: "隐藏用量面板" })).toBeVisible();
    });

    test("floating close button hides without destroying the window", async ({ omni }) => {
        test.skip(process.platform === "darwin", "macOS system mode uses popup");
        const page = await findMainPanelPage(omni.app);
        await page.getByRole("button", { name: "隐藏用量面板" }).click();
        await expect
            .poll(() => popupWindowState(omni.app))
            .toEqual({ exists: true, visible: false });
        expect(page.isClosed()).toBe(false);
    });
});
