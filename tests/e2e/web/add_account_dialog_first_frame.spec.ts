import { expect, test } from "../fixtures/test_web";
import { SettingsPage } from "../pages/settings_page";

/**
 * AddAccountDialog first frame（原 t106 视觉回归）。
 *
 * t106 时代 AddAccountDialog 带旧 `.acct-dialog` CSS 入场动画：动画起始帧
 * opacity 为 0，隐藏空容器边框/阴影，防止首帧黑线。t269 统一 Dialog
 * （src/renderer/components/ui/Dialog.tsx）后该动画契约整体退役——当前
 * Dialog 无任何入场动画，首帧即最终帧，边框/阴影直接可见。
 *
 * 因此本测试不再构造旧 DOM、不再断言"动画起始帧隐藏边框"；改为在真实
 * SPA 中打开 AddAccountDialog，验证当前统一 Dialog 的真实可观察行为：
 * 语义（role=aria-modal/aria-label）、可见性、遮罩覆盖与"无入场动画"。
 */
test.describe("AddAccountDialog first frame", () => {
    test("unified Dialog is visible with dialog semantics on first frame", async ({ webPage }) => {
        await webPage.waitForSelector(".app-title", { timeout: 10_000 });
        const settings = await SettingsPage.open_via_hash(webPage);
        await settings.page.getByTestId("settings-plugin-nav-accounts").click();
        await settings.page.getByRole("button", { name: /^添加$/ }).click();

        // 统一 Dialog：role=dialog + aria-modal + aria-label（AddAccountDialog 传 title）。
        const dialog = settings.page.getByRole("dialog", { name: "添加账号" });
        await expect(dialog).toBeVisible({ timeout: 10_000 });
        await expect(dialog).toHaveAttribute("aria-modal", "true");

        // 遮罩（backdrop）铺满 dialog wrapper（wrapper 为 fixed inset-0 全屏；
        // config use.viewport=null，viewportSize() 为 null，故与 wrapper 比较）。
        const backdrop = dialog.locator('[aria-hidden="true"]');
        await expect(backdrop).toBeVisible();
        const dialogBox = await dialog.boundingBox();
        const backdropBox = await backdrop.boundingBox();
        expect(backdropBox?.width ?? 0).toBe(dialogBox?.width ?? 0);
        expect(backdropBox?.height ?? 0).toBe(dialogBox?.height ?? 0);

        // 旧首帧动画契约已退役：当前 Dialog 无入场动画，首帧即稳定帧。
        const animationName = await dialog.evaluate(
            (el) => window.getComputedStyle(el).animationName,
        );
        expect(animationName).toBe("none");
    });
});
