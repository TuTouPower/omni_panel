import { expect, test } from "../fixtures/test";
import { PopupPage } from "../pages/popup_page";

test.describe("popup view", () => {
    test("shows title with logo", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();
        const title = await popup.getTitle();
        expect(title).toContain("OmniUsage");
    });

    test("refresh button is visible and clickable", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();
        await expect(popup.root().getByTitle("刷新全部")).toBeVisible();
        await popup.clickRefresh();
    });

    test("popup root fills the viewport height", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        const layout = await page.evaluate(() => {
            const root = document.querySelector(".window");
            const scroll = document.querySelector(".scroll");
            if (!(root instanceof HTMLElement)) throw new Error("Popup root not found");
            if (!(scroll instanceof HTMLElement)) throw new Error("Popup scroll area not found");
            const root_rect = root.getBoundingClientRect();
            const scroll_rect = scroll.getBoundingClientRect();
            return {
                root_height: root_rect.height,
                scroll_bottom: scroll_rect.bottom,
                viewport_height: window.innerHeight,
            };
        });

        expect(Math.abs(layout.root_height - layout.viewport_height)).toBeLessThanOrEqual(1);
        expect(layout.scroll_bottom).toBeLessThanOrEqual(layout.root_height + 1);
    });

    test("main content area is rendered", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();
        const live = page.locator('[data-popup="live"]');
        const providerNav = live.locator(".tabs-wrap");
        await expect(live).toBeVisible();
        await expect(live.locator(".scroll")).toBeVisible();
        await expect(providerNav.getByRole("button", { name: /总览/ })).toBeVisible();
        await expect(providerNav.getByRole("button", { name: /^Claude$/ })).toBeVisible();
        await expect(providerNav.getByRole("button", { name: /^DeepSeek$/ })).toBeVisible();
        await expect(providerNav.getByRole("button", { name: /^CPA$/ })).toHaveCount(0);
    });

    test("settings button opens independent window", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();
        await popup.clickSettings();

        // Settings opens as a new BrowserWindow
        const settingsWindow = await omni.app.waitForEvent("window", { timeout: 10_000 });
        await settingsWindow.waitForLoadState("domcontentloaded");
        await expect(settingsWindow.locator('[data-testid="settings-sidebar"]')).toBeVisible();
    });
});
