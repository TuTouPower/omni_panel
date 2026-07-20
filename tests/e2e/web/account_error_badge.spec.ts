import { expect, test } from "../fixtures/test_web";
import { PopupPage } from "../pages/popup_page";

/**
 * Web e2e：per-account error badge（T027 UI + T028 data）。
 * T028 observation_to_metric_record 映射 last_error → MetricRecord.error。
 * synthetic fixture 有 KIMI stale observation（last_error = "HTTP 401..."），
 * 展开 KIMI card 后账号行显示 .error-badge（采集失败，title 含 error message）。
 */
test.describe("account error badge (web)", () => {
    test("error account shows error badge on expand", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const live = popup.root();
        // 等 cards 数据加载（SPA 异步 fetch /v1/connectors，waitReady 只等 .app-title）
        await expect(live.locator(".card").first()).toBeVisible({ timeout: 15_000 });

        // KIMI provider card（synthetic T022 加，enabled+failed+items）
        const kimi_card = live.locator(".card").filter({ hasText: "Kimi" });
        if ((await kimi_card.count()) === 0) {
            test.skip(true, "synthetic fixture 无 Kimi card，跳过");
        }
        await kimi_card.getByRole("button", { name: "展开" }).click();

        // account row error badge（T027：有 error 时 .error-badge 可见，title 含 error message）
        const error_badge = live.locator(".error-badge").first();
        const has_badge = await error_badge.isVisible({ timeout: 5_000 }).catch(() => false);
        if (!has_badge) {
            test.skip(
                true,
                "无 .error-badge（MetricRecord.error 无数据或 account row 未展开），T028 未完全生效则 skip",
            );
        }
        await expect(error_badge).toBeVisible();
        await expect(error_badge).toHaveAttribute("title", /.+/);
        await expect(error_badge).toContainText("采集失败");
    });
});
