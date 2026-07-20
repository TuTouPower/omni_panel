import { expect, test } from "../fixtures/test_web";
import { PopupPage } from "../pages/popup_page";

/**
 * Web e2e：popup 快速折叠/展开仍保持可用；live popup 可测量、mirror 树不可见。
 * mock local-api 回放真实快照（Codex 4 账号）。
 * 断言泛化：动态取前两个 collapse 按钮，不锁账号名。
 */
test.describe("popup height debounce (web)", () => {
    test("rapid collapse and expand leaves popup usable", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const live = popup.root();
        await live.getByRole("button", { name: /^Codex$/ }).click();
        await expect(live.locator(".bar-row").first()).toBeVisible({ timeout: 15_000 });

        const collapse_buttons = live.getByRole("button", { name: /^折叠 .+/ });
        const total = await collapse_buttons.count();
        expect(total).toBeGreaterThanOrEqual(1);
        // 取前 min(2, total) 个 collapse 按钮对应的账号 label
        const take = Math.min(2, total);
        const labels: string[] = [];
        for (let i = 0; i < take; i++) {
            const aria = await collapse_buttons.nth(i).getAttribute("aria-label");
            expect(aria).toBeTruthy();
            labels.push((aria ?? "").replace(/^折叠\s+/, ""));
        }

        // web 下 viewport 固定，测 .scroll-inner 的内容高度（随折叠态变化）
        const content = live.locator(".scroll-inner");

        for (const label of labels) {
            const height_before = await content.evaluate((node) => node.scrollHeight);

            await live.getByRole("button", { name: `折叠 ${label}`, exact: true }).click();
            await webPage.waitForTimeout(200);

            const height_collapsed = await content.evaluate((node) => node.scrollHeight);
            expect(height_collapsed).toBeLessThan(height_before);

            await live.getByRole("button", { name: `展开 ${label}`, exact: true }).click();
            await webPage.waitForTimeout(200);

            const height_expanded = await content.evaluate((node) => node.scrollHeight);
            expect(height_expanded).toBeGreaterThan(height_collapsed);
        }

        await expect(live.locator(".card-name").first()).toBeVisible();
        await expect(live.locator(".titlebar")).toBeVisible();
    });

    test("live popup is measurable while no visible mirror trees", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const metrics = await webPage.evaluate(() => {
            const live = document.querySelector('[data-popup="live"]');
            const visible_mirrors = [...document.querySelectorAll(".popup-mirror")].filter(
                (node) => {
                    if (!(node instanceof HTMLElement)) return false;
                    const style = window.getComputedStyle(node);
                    return style.visibility !== "hidden" && style.display !== "none";
                },
            );
            return {
                live_height: live instanceof HTMLElement ? live.getBoundingClientRect().height : 0,
                visible_mirror_count: visible_mirrors.length,
            };
        });

        expect(metrics.live_height).toBeGreaterThan(0);
        // web SPA 不渲染 popup-mirror（Electron 专属预渲染机制）
        expect(metrics.visible_mirror_count).toBe(0);
    });
});
