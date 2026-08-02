import { expect, test } from "../fixtures/test_web";
import { PopupPage } from "../pages/popup_page";

/**
 * Web e2e：per-account error badge（T027 UI + T028 data）。
 * T028 observation_to_metric_record 映射 last_error → MetricRecord.error。
 * gen_synthetic.mjs 固化注入 KIMI failed connector 的 items 带 error
 * （HTTP 401，对应 T028 last_error 语义）。
 * 切到 Kimi provider tab 后账号行显示 .error-badge（采集失败，title 含 error message）。
 */
test.describe("account error badge (web)", () => {
    test("error account shows error badge on provider tab", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const live = popup.root();
        // 等 cards 数据加载（SPA 异步 fetch /v1/connectors，waitReady 只等 .app-title）
        await expect(live.locator(".card").first()).toBeVisible({ timeout: 15_000 });

        // 切到 Kimi provider tab：ProviderAccountList 渲染 ProviderAccountRow（.error-badge 所在层）
        await live.getByRole("button", { name: "Kimi", exact: true }).click();
        await expect(live.locator(".bar-row").first()).toBeVisible({ timeout: 15_000 });

        // T027：有 error 时 .error-badge 可见，title 含 error message
        const error_badge = live.locator(".error-badge").first();
        await expect(error_badge).toBeVisible();
        await expect(error_badge).toHaveAttribute("title", /.+/);
        await expect(error_badge).toContainText("采集失败");
    });
});
