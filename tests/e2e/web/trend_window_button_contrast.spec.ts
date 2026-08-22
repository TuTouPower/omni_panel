import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test_web";
import { SettingsPage } from "../pages/settings_page";

/**
 * Web e2e：usage 面板趋势窗口按钮选中态对比度（t321；t421 收敛到 ui/Segmented）。
 * t435 后选中态 = surface-card 底 + primary 字 + shadow-card（Segmented 配方）；
 * 断言背景非透明、文字对比度 ≥3.0；light/dark 两主题均覆盖（走设置页真实切主题）。
 */

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

async function switch_theme(page: Page, theme: "浅色" | "深色"): Promise<void> {
    const settings = await SettingsPage.open_via_hash(page);
    await settings.page.locator('[data-testid="settings-plugin-nav-appearance"]').click();
    await settings.page.getByRole("button", { name: theme, exact: true }).click();
    await expect(settings.page.getByRole("button", { name: theme, exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
    );
    // 回 usage 面板
    await page.goto("#usage");
    await page.waitForSelector('[data-testid="app-title"]', { timeout: 10_000 });
}

async function open_provider_tab(page: Page, name: string): Promise<void> {
    const tab = page.getByRole("button", { name, exact: true });
    await tab.click({ timeout: 15_000 });
}

test.describe("趋势窗口按钮选中态对比度 (t321)", () => {
    for (const [theme_label, theme_attr] of [
        ["浅色", "light"],
        ["深色", "dark"],
    ] as const) {
        test(`${theme_label} 主题下选中按钮背景实底且文字对比 ≥3.0`, async ({ webPage }) => {
            await switch_theme(webPage, theme_label);

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

            await open_provider_tab(webPage, "Antigravity");

            const selected = webPage.locator(
                '[data-testid="trend-window-btn"][aria-pressed="true"]',
            );
            await expect(selected.first()).toBeVisible({ timeout: 10_000 });

            // AC-001: 选中按钮背景非透明（Segmented 选中块 surface-card）
            const bg = (
                await selected.first().evaluate((el) => getComputedStyle(el).backgroundColor)
            ).trim();
            expect(bg, `选中按钮背景非透明，实际 ${bg}`).not.toBe("rgba(0, 0, 0, 0)");
            expect(bg).not.toBe("transparent");
            const surface_card_rgb = await webPage.evaluate(() => {
                const probe = document.createElement("div");
                probe.style.backgroundColor = "var(--color-surface-card)";
                document.body.appendChild(probe);
                const out = getComputedStyle(probe).backgroundColor;
                probe.remove();
                return out.trim();
            });
            expect(bg, `选中按钮背景应等于 surface-card，实际 ${bg} vs ${surface_card_rgb}`).toBe(
                surface_card_rgb,
            );

            // AC-002/003: 文字与最终背景对比度 ≥3.0，且文字与最终背景非同色
            const sample = await sample_contrast(selected.first());
            expect(sample.bg, `选中按钮应解析到非透明底，实际 ${sample.bg}`).not.toBe(
                "rgba(0, 0, 0, 0)",
            );
            expect(
                sample.ratio,
                `对比度应 ≥3.0，实际 ${String(sample.ratio)}`,
            ).toBeGreaterThanOrEqual(3.0);
            expect(sample.fg, `文字色不应等于背景色（${sample.fg} vs ${sample.bg}）`).not.toBe(
                sample.bg,
            );

            // AC-004: 未选中段保持 variant 字 + 透明底（Segmented 未选中配方）
            const unselected = webPage.locator(
                '[data-testid="trend-window-btn"][aria-pressed="false"]',
            );
            await expect(unselected.first()).toBeVisible({ timeout: 10_000 });
            const un_bg = (
                await unselected.first().evaluate((el) => getComputedStyle(el).backgroundColor)
            ).trim();
            expect(un_bg, `未选中按钮背景应透明，实际 ${un_bg}`).toBe("rgba(0, 0, 0, 0)");
            const un_fg = (
                await unselected.first().evaluate((el) => getComputedStyle(el).color)
            ).trim();
            expect(un_fg, `未选中按钮文字应不同于选中态，实际 ${un_fg}`).not.toBe(sample.fg);
        });
    }
});
