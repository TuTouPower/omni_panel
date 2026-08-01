import { expect, test } from "../fixtures/test_web";
import { PopupPage } from "../pages/popup_page";

/**
 * Web e2e：OpenCode Go provider 多账号 + 三窗口用量渲染。
 * mock local-api 回放真实快照（real 含 opencode_go 8 workspace × rolling/weekly/monthly）。
 * 断言泛化：三窗口翻译文案可见；多账号 card 数 > 1（不锁具体 workspace 名）。
 *
 * synthetic.json 手工补充 opencode_go connector（2 workspace × rolling/weekly/monthly，
 * 窗口文案 滚动/一周/一月；gen_synthetic.mjs 不产生，重跑 e2e:gen-synthetic 会覆盖，
 * 见 docs/pending.md p021），CI synthetic 也覆盖。
 */
test.describe("opencode go usage (web)", () => {
    test("renders rolling weekly monthly usage for multiple opencode go accounts", async ({
        webPage,
    }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const live = popup.root();
        const tab = live.getByRole("button", { name: "OpenCode Go", exact: true });
        await expect(tab).toBeVisible({ timeout: 15_000 });
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
