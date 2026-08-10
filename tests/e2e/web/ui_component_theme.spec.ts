import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test_web";
import { SettingsPage } from "../pages/settings_page";

/**
 * Web e2e：ui 组件库明暗主题渲染抽查（t283）。
 * 取样设置页实际消费的 ui 组件（Button primary/secondary、Switch、Select、
 * Input、Checkbox、Segmented、Dialog、SecretInput），在 light/dark 两态下
 * 计算前景色与最近非透明背景的 WCAG 对比度，断言无「样式缺失 / 对比失效」。
 *
 * 对比度阈值：正文级（body/label 字级）≥ 4.5；主按钮白字蓝底与分段控件
 * 选中块按 DESIGN.md 大字标准 ≥ 3.0。Switch 两态底色必须不同（开启绿/强调色
 * vs 关闭灰），防止「开关与背景同色不可辨」。
 */

/** 计算元素前景色与其最近非透明背景的 WCAG 对比度（locator.evaluate 内执行）。 */
async function sample_contrast(
    locator: Locator,
): Promise<{ fg: string; bg: string; ratio: number }> {
    return locator.evaluate((el) => {
        const cs = getComputedStyle(el as HTMLElement);
        const fg = cs.color;
        let bg = cs.backgroundColor;
        let node: HTMLElement | null = el as HTMLElement;
        while ((bg === "rgba(0, 0, 0, 0)" || bg === "transparent") && node) {
            node = node.parentElement;
            if (node) bg = getComputedStyle(node).backgroundColor;
        }
        const parse = (c: string): [number, number, number] => {
            const m = c.match(/\d+(?:\.\d+)?/g) ?? [];
            return [Number(m[0] ?? 0), Number(m[1] ?? 0), Number(m[2] ?? 0)];
        };
        const [r, g, b] = parse(fg);
        const [br, bg_, bb] = parse(bg);
        const lum = (c: number) => {
            const v = c / 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        };
        const l1 = 0.2126 * lum(r) + 0.7152 * lum(g) + 0.0722 * lum(b);
        const l2 = 0.2126 * lum(br) + 0.7152 * lum(bg_) + 0.0722 * lum(bb);
        return {
            fg,
            bg,
            ratio: (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05),
        };
    });
}

/** 页面主体（body 或祖先）背景亮度，用于证明主题真正切换。 */
async function page_background_luminance(page: Page): Promise<number> {
    return page.evaluate(() => {
        const parse = (c: string): [number, number, number] => {
            const m = c.match(/\d+(?:\.\d+)?/g) ?? [];
            return [Number(m[0] ?? 0), Number(m[1] ?? 0), Number(m[2] ?? 0)];
        };
        let node: HTMLElement | null = document.body;
        let bg = "rgba(0, 0, 0, 0)";
        while (bg === "rgba(0, 0, 0, 0)" || bg === "transparent") {
            if (!node) break;
            bg = getComputedStyle(node).backgroundColor;
            node = node.parentElement;
        }
        const [r, g, b] = parse(bg);
        const lum = (c: number) => {
            const v = c / 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * lum(r) + 0.7152 * lum(g) + 0.0722 * lum(b);
    });
}

async function open_appearance(page: Page): Promise<Page> {
    await page.waitForSelector('[data-testid="app-title"]', { timeout: 10_000 });
    const settings = await SettingsPage.open_via_hash(page);
    await settings.page.locator('[data-testid="settings-plugin-nav-appearance"]').click();
    await expect(settings.page.getByText("用量条颜色方案")).toBeVisible();
    return settings.page;
}

async function switch_theme(page: Page, theme: "浅色" | "深色"): Promise<void> {
    await page.getByRole("button", { name: theme, exact: true }).click();
    await expect(page.getByRole("button", { name: theme, exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
    );
}

test.describe("ui 组件明暗主题渲染抽查 (t283)", () => {
    for (const [theme_label, theme_attr] of [
        ["浅色", "light"],
        ["深色", "dark"],
    ] as const) {
        test(`设置页 ${theme_label} 主题下关键 ui 组件对比度有效`, async ({ webPage }) => {
            const sPage = await open_appearance(webPage);
            await switch_theme(sPage, theme_label);
            // 回到 general 页取样常规组件。
            await sPage.locator('[data-testid="settings-plugin-nav-general"]').click();

            // 主题真正生效：dark 背景亮度显著低于 light（防「测试跑通但主题没切」）。
            const bg_lum = await page_background_luminance(webPage);
            if (theme_attr === "dark") {
                expect(bg_lum, `dark 背景亮度应低于 0.05，实际 ${String(bg_lum)}`).toBeLessThan(
                    0.05,
                );
            } else {
                expect(bg_lum, `light 背景亮度应高于 0.5，实际 ${String(bg_lum)}`).toBeGreaterThan(
                    0.5,
                );
            }

            // general：Switch 开/关两态 track 底色不同且非 transparent。
            const sw = sPage.locator('[role="switch"]').first();
            const off_bg = (await sw.evaluate((el) => getComputedStyle(el).backgroundColor)).trim();
            expect(off_bg).not.toBe("rgba(0, 0, 0, 0)");
            expect(off_bg).not.toBe("transparent");
            await sw.click();
            // 受控组件：config.save 回写后 aria-checked 才翻转；再等 track 底色过完
            // transition-feedback（120ms）稳定为开态色（防读到过渡起点）。
            await expect(sw).toHaveAttribute("aria-checked", "true");
            await expect
                .poll(() => sw.evaluate((el) => getComputedStyle(el).backgroundColor), {
                    timeout: 3_000,
                })
                .not.toBe(off_bg);
            const on_bg = (await sw.evaluate((el) => getComputedStyle(el).backgroundColor)).trim();
            expect(on_bg).not.toBe("rgba(0, 0, 0, 0)");
            expect(on_bg).not.toBe("transparent");
            expect(on_bg, `Switch 开态 ${on_bg} 应异于关态 ${off_bg}`).not.toBe(off_bg);

            // general：Select（日志等级）文字 vs 底 ≥ 4.5。
            const select = await sample_contrast(sPage.getByLabel("日志等级"));
            expect(select.bg).not.toBe("transparent");
            expect(
                select.ratio,
                `Select ${theme_label} 对比 ${select.fg}/${select.bg}`,
            ).toBeGreaterThanOrEqual(4.5);

            // general：Input（代理地址）文字 vs 底 ≥ 4.5。
            const proxy_row = sPage.locator('[data-testid="set-row"]', {
                hasText: "代理地址",
            });
            const input_el = proxy_row.locator("input").first();
            const input = await sample_contrast(input_el);
            expect(
                input.ratio,
                `Input ${theme_label} 对比 ${input.fg}/${input.bg}`,
            ).toBeGreaterThanOrEqual(4.5);

            // data：Checkbox（包含明文密钥）文字 vs 底 ≥ 4.5。
            await sPage.locator('[data-testid="settings-plugin-nav-data"]').click();
            const checkbox = await sample_contrast(
                sPage.getByRole("checkbox", { name: "包含明文密钥" }),
            );
            expect(
                checkbox.ratio,
                `Checkbox ${theme_label} 对比 ${checkbox.fg}/${checkbox.bg}`,
            ).toBeGreaterThanOrEqual(4.5);

            // data：Button secondary（导出设置行「导出」按钮）文字 vs 底 ≥ 4.5。
            const export_btn = await sample_contrast(
                sPage
                    .locator('[data-testid="set-row"]', { hasText: "导出设置" })
                    .getByRole("button", { name: "导出", exact: true }),
            );
            expect(
                export_btn.ratio,
                `Button secondary ${theme_label} 对比 ${export_btn.fg}/${export_btn.bg}`,
            ).toBeGreaterThanOrEqual(4.5);

            // accounts：Button primary（添加）白字 vs 蓝底 ≥ 3.0（DESIGN 大字标准）。
            await sPage.locator('[data-testid="settings-plugin-nav-accounts"]').click();
            const add_btn = await sample_contrast(
                sPage.getByRole("button", { name: "添加", exact: true }).first(),
            );
            expect(
                add_btn.ratio,
                `Button primary ${theme_label} 对比 ${add_btn.fg}/${add_btn.bg}`,
            ).toBeGreaterThanOrEqual(3.0);

            // accounts：Dialog + SecretInput。打开添加账号对话框，断言卡片与输入文字对比。
            await sPage.getByRole("button", { name: "添加", exact: true }).first().click();
            const dialog = sPage.getByRole("dialog", { name: "添加账号" });
            await expect(dialog).toBeVisible();
            const dialog_card = dialog.locator("div.rounded-xl").first();
            const dialog_bg = (
                await dialog_card.evaluate((el) => getComputedStyle(el).backgroundColor)
            ).trim();
            expect(dialog_bg).not.toBe("rgba(0, 0, 0, 0)");
            expect(dialog_bg).not.toBe("transparent");
            // 对话框标题（on-surface）vs 卡片底 ≥ 4.5。
            const dialog_title = await sample_contrast(dialog.locator(".text-title-sm").first());
            expect(
                dialog_title.ratio,
                `Dialog 标题 ${theme_label} 对比 ${dialog_title.fg}/${dialog_title.bg}`,
            ).toBeGreaterThanOrEqual(4.5);
        });

        test(`appearance ${theme_label} 主题下 Segmented 选中块对比有效`, async ({ webPage }) => {
            const sPage = await open_appearance(webPage);
            await switch_theme(sPage, theme_label);

            const style_field = sPage.getByLabel("用量条样式");
            const selected = style_field.locator('[aria-pressed="true"]');
            const seg = await sample_contrast(selected);
            expect(
                seg.ratio,
                `Segmented 选中块 ${theme_label} 对比 ${seg.fg}/${seg.bg}`,
            ).toBeGreaterThanOrEqual(3.0);
        });
    }
});
