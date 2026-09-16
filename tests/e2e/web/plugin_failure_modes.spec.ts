import { expect, test } from "../fixtures/test_web";
import { PopupPage } from "../pages/popup_page";

/**
 * Web e2e：failed connector 渲染。
 * real/synthetic 含 enabled+failed connector（错误为 `HTTP 401: request failed`，即 auth 类；
 * synthetic 从 real 取该 KIMI 401 加入）。
 *
 * t492 AC-006 起，auth 类失败统一渲染 `[data-testid="card-state"][data-variant="auth"]`
 * （「凭证失效，请重新登录」+ 重新登录），不再暴露裸 HTTP 状态码，也不再给「重试」——
 * 用同一份失效凭据重试是空转。原两条 case（err variant 非空 message / 重试 action）
 * 断言的是 t492 之前的行为，整体替换。
 * 非 auth 失败的 err 分支（采集失败 + 重试）由 renderer 单测覆盖
 * （`tests/unit/renderer/components/provider_card_states.test.tsx`）；e2e fixture 中
 * 没有非 auth 的 failed connector。
 */
test.describe("plugin failure modes (web)", () => {
    test("failed connector renders auth state with a user-facing message", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const live = popup.root();
        const auth_state = live.locator('[data-testid="card-state"][data-variant="auth"]').first();
        await expect(auth_state).toBeVisible({ timeout: 15_000 });
        // 统一文案非空，且不含内部细节（HTTP 状态码 / 字节数）
        const msg = (await auth_state.locator("span").nth(1).textContent()) ?? "";
        expect(msg.trim().length).toBeGreaterThan(0);
        expect(msg).not.toMatch(/HTTP \d{3}/);
        expect(msg).not.toMatch(/request failed/);
    });

    test("auth-failed card offers the re-login action", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const live = popup.root();
        const auth_state = live.locator('[data-testid="card-state"][data-variant="auth"]').first();
        await expect(auth_state).toBeVisible({ timeout: 15_000 });
        const relogin = auth_state
            .locator('[data-testid="cs-action"]')
            .filter({ hasText: "重新登录" });
        await expect(relogin).toBeVisible();
    });
});
