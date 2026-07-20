import { expect, test } from "../fixtures/test_web";
import { PopupPage } from "../pages/popup_page";

/**
 * Web e2e：主题渲染。浏览器驱动 out/web SPA，mock local-api 回放录的真实数据。
 */
test.describe("popup theme (web)", () => {
    test("root has data-theme attribute light or dark", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const theme_attr = await webPage.evaluate(() => {
            return document.documentElement.getAttribute("data-theme");
        });
        expect(theme_attr === "light" || theme_attr === "dark").toBe(true);
    });

    test("app title renders (React mounted; 数据链路由 T011 批量 spec 覆盖)", async ({
        webPage,
    }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        // app-title 是硬编码静态文本（PopupView.tsx），本用例只证 React 挂载；
        // mock 数据是否真正渲染到 provider card / 账号行由 T011 批量迁移 spec 覆盖。
        const title = await popup.getTitle();
        expect(title).toBeTruthy();
    });
});
