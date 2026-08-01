import { expect, test } from "../fixtures/test_web";
import { PopupPage } from "../pages/popup_page";

/**
 * Web e2e：popup card 状态渲染。
 * mock local-api 回放真实快照。
 *
 * 删 case：原 "auth failure shows settings link" 依赖 seed_fake_plugin 造
 * "unauthorized token" 错误，mock fixture 无 enabled+failed+无 items 的 connector
 * 可触发 .card-state.auth（is_auth_error 文本匹配），留 electron 不迁。
 *
 * 保留 case：
 *  - 错误态 retry：synthetic.json 手工保证含 1 个 enabled connector
 *    snapshot.status=failed 且含 stale items（当前为 KIMI 401；gen_synthetic.mjs
 *    不产生，重跑 e2e:gen-synthetic 会覆盖，见 docs/pending.md p021）
 *    -> overview 渲染 .card-state.err + 重试 action（错误 banner 分支）。
 *  - critical 用量条：Codex tab 内含 critical item（pct>=95 -> var(--risk-red) fill）。
 */
test.describe("popup card states (web)", () => {
    test("stale error banner shows retry action", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const live = popup.root();
        const err_banner = live.locator(".card-state.err").filter({ hasText: "重试" });
        // .card-state.err 由 connector 数据后渲染，与 app-title 不同拍
        await expect(err_banner.first()).toBeVisible({ timeout: 15_000 });
        await expect(err_banner.first().getByText("重试")).toBeVisible();
    });

    test("critical usage bar uses risk-red fill color", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const live = popup.root();
        // Codex 多账号含 critical item（pct>=95）
        await live.getByRole("button", { name: /^Codex$/ }).click();
        await expect(live.locator(".bar-row").first()).toBeVisible({ timeout: 15_000 });

        // 至少一个 fill 用 var(--risk-red)（critical 颜色）
        const fills = live.locator(".bar-row .fill");
        const count = await fills.count();
        let found_red = false;
        for (let i = 0; i < count; i++) {
            const style = (await fills.nth(i).getAttribute("style")) ?? "";
            if (style.includes("var(--risk-red)")) {
                found_red = true;
                break;
            }
        }
        expect(found_red).toBe(true);
    });
});
