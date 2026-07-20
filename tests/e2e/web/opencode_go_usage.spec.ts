import { expect, test } from "../fixtures/test_web";
import { PopupPage } from "../pages/popup_page";

/**
 * Web e2e：OpenCode Go provider 多账号 + 三窗口用量渲染。
 * mock local-api 回放真实快照（real 含 opencode_go 8 workspace × rolling/weekly/monthly）。
 * 断言泛化：三窗口翻译文案可见；多账号 card 数 > 1（不锁具体 workspace 名）。
 *
 * synthetic fixture 不含 opencode_go connector，CI 跑 synthetic 时该 case 跳过；
 * 本地 real fixture 跑覆盖。
 */
test.describe("opencode go usage (web)", () => {
    test("renders rolling weekly monthly usage for multiple opencode go accounts", async ({
        webPage,
    }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const live = popup.root();
        const tab = live.getByRole("button", { name: "OpenCode Go", exact: true });
        if (!(await tab.isVisible().catch(() => false))) {
            test.skip(true, "synthetic fixture 不含 opencode_go provider，跳过");
        }
        await tab.click({ timeout: 15_000 });

        // 进入 tab 后应有多个账号 card（real fixture 8 workspace）
        const account_cards = live.locator(".card .card-name");
        await expect(account_cards.first()).toBeVisible({ timeout: 10_000 });
        expect(await account_cards.count()).toBeGreaterThan(1);

        // 三窗口翻译文案至少各出现一次（滚动/一周/一月）
        await expect(live.getByText("滚动").first()).toBeVisible({ timeout: 10_000 });
        await expect(live.getByText("一周").first()).toBeVisible();
        await expect(live.getByText("一月").first()).toBeVisible();
    });
});
