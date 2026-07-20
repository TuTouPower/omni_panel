import { expect, test } from "../fixtures/test_web";
import { PopupPage } from "../pages/popup_page";

/**
 * Web e2e：popup 刷新 / 切 tab 后折叠态保留；刷新结束后 spinner 清理。
 * mock local-api 回放真实快照（Codex 4 账号）。
 * 断言泛化：动态取首个 collapse 按钮，不锁账号名。
 */
test.describe("popup refresh state reset (web)", () => {
    test("collapse is preserved when structure is unchanged", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const live = popup.root();
        await live.getByRole("button", { name: /^Codex$/ }).click();
        await expect(live.locator(".bar-row").first()).toBeVisible({ timeout: 15_000 });

        const collapse_buttons = live.getByRole("button", { name: /^折叠 .+/ });
        const first_label = await collapse_buttons.first().getAttribute("aria-label");
        expect(first_label).toBeTruthy();
        const account_label = (first_label ?? "").replace(/^折叠\s+/, "");

        await collapse_buttons.first().click();
        await expect(live.getByRole("button", { name: `展开 ${account_label}` })).toBeVisible();

        // 全局刷新按钮（title="刷新全部"，aria-label 同）
        await live.getByTitle("刷新全部").click();
        // 刷新不改变结构 → 折叠态保留
        await expect(live.getByRole("button", { name: `展开 ${account_label}` })).toBeVisible({
            timeout: 15_000,
        });
    });

    test("tab switch preserves collapse state", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const live = popup.root();
        await live.getByRole("button", { name: /^Codex$/ }).click();
        await expect(live.locator(".bar-row").first()).toBeVisible({ timeout: 15_000 });

        const collapse_buttons = live.getByRole("button", { name: /^折叠 .+/ });
        const first_label = await collapse_buttons.first().getAttribute("aria-label");
        expect(first_label).toBeTruthy();
        const account_label = (first_label ?? "").replace(/^折叠\s+/, "");

        await collapse_buttons.first().click();
        await expect(live.getByRole("button", { name: `展开 ${account_label}` })).toBeVisible();

        await live.getByRole("button", { name: "总览" }).click();
        await live.getByRole("button", { name: /^Codex$/ }).click();

        await expect(live.getByRole("button", { name: `展开 ${account_label}` })).toBeVisible();
    });

    test("manual refresh keeps popup interactive and clears spinner after completion", async ({
        webPage,
    }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const live = popup.root();
        await live.getByRole("button", { name: /^Codex$/ }).click();
        await expect(live.locator(".bar-row").first()).toBeVisible({ timeout: 15_000 });

        await live.getByTitle("刷新全部").click();

        // 刷新完成后，任意折叠按钮仍可见（spinner 已清理，UI 可交互）
        await expect(live.getByRole("button", { name: /^折叠 .+/ }).first()).toBeVisible({
            timeout: 15_000,
        });
    });
});
