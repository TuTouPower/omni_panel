import { expect, test } from "../fixtures/test_web";
import { PopupPage } from "../pages/popup_page";

/**
 * Web e2e：popup 可交互性、titlebar 渲染。
 * 浏览器驱动 out/web SPA。
 */
test.describe("popup platform behavior (web)", () => {
    test("popup page is available and interactable", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        // 浏览器无独立 window title；改为断言 app-title 渲染
        const title = await popup.getTitle();
        expect(title).toContain("OmniUsage");
    });

    test("titlebar drag region is rendered", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const has_titlebar = await webPage.evaluate(() => {
            const tb = document.querySelector(".titlebar");
            return tb instanceof HTMLElement;
        });

        expect(has_titlebar).toBe(true);
    });
});
