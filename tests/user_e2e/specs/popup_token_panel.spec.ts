import { expect, test } from "../fixtures/test";
import { PopupPage } from "../pages/popup_page";

/**
 * Phase 21 E2E: TokenPanel behavior.
 */
const tokenPanelEnabled = process.env["VITE_ENABLE_TOKEN_PANEL"] === "1";

test.describe("popup token panel", () => {
    test.skip(!tokenPanelEnabled, "Token panel is disabled");

    test("token panel shows Total Tokens title", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // TokenPanel should be present (as a collapsible card)
        const token_title = page.locator("text=Total Tokens");
        expect(await token_title.count()).toBeGreaterThanOrEqual(1);
    });

    test("token panel shows no-data message", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        const na_msg = page.locator("text=暂无历史数据");
        expect(await na_msg.count()).toBeGreaterThanOrEqual(1);
    });

    test("time range buttons are clickable", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        const today = page.locator("button:has-text('今天')");
        const week = page.locator("button:has-text('最近一周')");
        const month = page.locator("button:has-text('最近一月')");

        if ((await today.count()) > 0) {
            await week.click();
            await page.waitForTimeout(200);
            await month.click();
            await page.waitForTimeout(200);
            // No crash on switch = pass
        }
    });
});
