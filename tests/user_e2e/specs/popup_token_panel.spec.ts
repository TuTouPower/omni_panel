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

    test("time range buttons update the active range", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        const token_card = page.locator(".token-card").first();
        await expect(token_card).toBeVisible();

        const today = token_card.getByRole("button", { name: "今天" });
        const week = token_card.getByRole("button", { name: "最近一周" });
        const month = token_card.getByRole("button", { name: "最近一月" });

        await expect(today).toHaveClass(/\bon\b/);
        await week.click();
        await expect(week).toHaveClass(/\bon\b/);
        await month.click();
        await expect(month).toHaveClass(/\bon\b/);
    });
});
