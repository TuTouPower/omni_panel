import { expect, test } from "../fixtures/test_web";
import { PopupPage } from "../pages/popup_page";

/**
 * Web e2e：failed connector 渲染。
 * real/synthetic 含 enabled+failed connector（real KIMI 401 带 stale items；
 * synthetic 从 real 取该 KIMI 加入）触发 ProviderCard render_error_banner
 * `.card-state.err`（stale banner 分支）。
 * 原 electron 3 case（error/crash/slow behavior 区分）合并为 failed 通用
 * （mock 无法造 runtime behavior 区分；behavior 区分由 connector 单测覆盖）。
 */
test.describe("plugin failure modes (web)", () => {
    test("failed connector renders error card state with message", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const live = popup.root();
        // failed+无items connector 渲染 .card-state.err（overview 显示所有 provider card）
        const err_state = live.locator(".card-state.err").first();
        await expect(err_state).toBeVisible({ timeout: 15_000 });
        // error message 非空（"Missing required secret" / "HTTP 401" / 等）
        const msg = await err_state.locator("span").nth(1).textContent();
        expect((msg ?? "").trim().length).toBeGreaterThan(0);
    });

    test("failed card offers retry action", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const live = popup.root();
        const err_state = live.locator(".card-state.err").first();
        await expect(err_state).toBeVisible({ timeout: 15_000 });
        // KIMI 401 非 auth failed，必渲染"重试"action（ProviderCard onRefresh 条件）
        const retry = err_state.locator(".cs-action").filter({ hasText: "重试" });
        await expect(retry).toBeVisible();
    });
});
