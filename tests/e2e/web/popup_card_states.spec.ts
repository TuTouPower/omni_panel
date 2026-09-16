import { expect, test } from "../fixtures/test_web";
import { PopupPage } from "../pages/popup_page";

/**
 * Web e2e：popup card 状态渲染。
 * mock local-api 回放真实快照。
 *
 * 保留 case：
 *  - 凭证失效态（t492 AC-006）：synthetic.json 的失败 connector 错误为
 *    `HTTP 401: request failed (236 bytes)`（auth 类）且有 stale items，t492 起
 *    overview 渲染 [data-testid="card-state"][data-variant="auth"] + 「重新登录」，
 *    不再显示裸 HTTP 状态码与「重试」。原「stale error banner shows retry action」
 *    断言的是 t492 之前的行为，随 AC-006 整体替换。
 *    非 auth 失败的 err 分支（采集失败 + 重试）由 renderer 单测覆盖
 *    （tests/unit/renderer/components/provider_card_states.test.tsx），e2e fixture
 *    中没有非 auth 的 failed connector。
 *  - critical 用量条：Codex tab 内含 critical item（pct>=95 -> var(--color-risk-critical) fill）。
 */
test.describe("popup card states (web)", () => {
    test("stale auth failure shows re-login action", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const live = popup.root();
        const auth_state = live
            .locator('[data-testid="card-state"][data-variant="auth"]')
            .filter({ hasText: "凭证失效，请重新登录" });
        // card-state 由 connector 数据后渲染，与 app-title 不同拍
        await expect(auth_state.first()).toBeVisible({ timeout: 15_000 });
        await expect(
            auth_state.first().locator('[data-testid="cs-action"]').filter({ hasText: "重新登录" }),
        ).toBeVisible();
        // AC-006：用户可见提示不含裸 HTTP 状态码
        await expect(live.getByText(/HTTP 401/)).toHaveCount(0);
    });

    test("critical usage bar uses risk-red fill color", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const live = popup.root();
        // Codex 多账号含 critical item（pct>=95）
        await live.getByRole("button", { name: /^Codex$/ }).click();
        await expect(live.locator('[data-testid="bar-row"]').first()).toBeVisible({
            timeout: 15_000,
        });

        // 至少一个 fill 用 var(--color-risk-critical)（critical 颜色）
        const fills = live.locator('[data-testid="bar-row"] [data-testid="bar-fill"]');
        const count = await fills.count();
        let found_red = false;
        for (let i = 0; i < count; i++) {
            const style = (await fills.nth(i).getAttribute("style")) ?? "";
            if (style.includes("var(--color-risk-critical)")) {
                found_red = true;
                break;
            }
        }
        expect(found_red).toBe(true);
    });
});
