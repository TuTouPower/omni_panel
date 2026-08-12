import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/test_web";
import { PopupPage } from "../pages/popup_page";

/**
 * Web e2e：VendorMark 亮暗双图主题显隐（t316）。
 *
 * 用真实构建 CSS（out/web SPA）驱动：light/dark 下逐一断言 exa/grok/opencode_go
 * 三组 theme_logo 两张 img 的 computed display 互斥；单图 provider（deepseek）
 * 两主题均显示原 logo。断言目标为真实层叠结果（getComputedStyle），jsdom
 * 不应用 CSS 层叠，不作为本 task 主证据。
 *
 * 主题切换与 app 同一机制：theme.ts / usageboard-web.ts 只改
 * documentElement 的 data-theme 属性，dark variant（globals.css
 * `@custom-variant dark`，t268）据此生效。直接设属性即等价于 UI 切换。
 *
 * 挂载点：ProviderNav tab（data-tab）内嵌 VendorMark（size=22）；
 * exa/grok connector 由 synthetic fixture 固化注入（gen_synthetic.mjs 同源）。
 */
const THEME_VENDORS = ["exa", "grok", "opencode_go"] as const;

async function apply_theme(page: Page, theme: "light" | "dark") {
    await page.evaluate((t) => {
        document.documentElement.setAttribute("data-theme", t);
    }, theme);
    await expect
        .poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme")))
        .toBe(theme);
}

async function vendor_img_displays(page: Page, provider: string) {
    // live 树内定位：offscreen mirror（data-popup="mirror"）复制 nav，不能命中外层。
    // 组件固定先渲染 light 图、后渲染 dark 图，故按位置取两张 img；
    // 不能按 src 关键字——小尺寸 svg logo（grok/opencode_go）被 Vite 内联为
    // data:image/svg+xml URL，src 不含 *_light/*_dark 文件名。
    const mark = page.locator(
        `[data-popup="live"] [data-tab="${provider}"] [data-testid="vendor-mark"]`,
    );
    const imgs = mark.locator("img");
    return {
        light: await imgs.nth(0).evaluate((el) => getComputedStyle(el).display),
        dark: await imgs.nth(1).evaluate((el) => getComputedStyle(el).display),
    };
}

test.describe("vendor logo theme visibility (web, t316)", () => {
    test("AC-001 light 主题下仅显示 light 图，dark 图 display none", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();
        await apply_theme(webPage, "light");

        for (const provider of THEME_VENDORS) {
            await expect(
                webPage.locator(`[data-popup="live"] [data-tab="${provider}"]`),
                `tab ${provider}`,
            ).toBeVisible();
            const { light, dark } = await vendor_img_displays(webPage, provider);
            expect(light, `${provider} light img in light theme`).toBe("block");
            expect(dark, `${provider} dark img in light theme`).toBe("none");
        }
    });

    test("AC-002 dark 主题下仅显示 dark 图，light 图 display none", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();
        await apply_theme(webPage, "dark");

        for (const provider of THEME_VENDORS) {
            await expect(
                webPage.locator(`[data-popup="live"] [data-tab="${provider}"]`),
                `tab ${provider}`,
            ).toBeVisible();
            const { light, dark } = await vendor_img_displays(webPage, provider);
            expect(light, `${provider} light img in dark theme`).toBe("none");
            expect(dark, `${provider} dark img in dark theme`).toBe("block");
        }
    });

    test("AC-003 同主题下两张图不同时可见", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        for (const theme of ["light", "dark"] as const) {
            await apply_theme(webPage, theme);
            for (const provider of THEME_VENDORS) {
                const { light, dark } = await vendor_img_displays(webPage, provider);
                const visible = [light, dark].filter((d) => d !== "none");
                expect(visible, `${provider} 在 ${theme} 下可见图数（期望恰好 1）`).toHaveLength(1);
            }
        }
    });

    test("AC-004 单图 provider（deepseek）两主题均显示原 logo，尺寸与容器行为不变", async ({
        webPage,
    }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();
        const mark = webPage.locator(
            '[data-popup="live"] [data-tab="deepseek"] [data-testid="vendor-mark"]',
        );
        await expect(mark).toBeVisible();

        for (const theme of ["light", "dark"] as const) {
            await apply_theme(webPage, theme);
            const img = mark.locator("img");
            expect(
                await img.evaluate((el) => getComputedStyle(el).display),
                `deepseek img in ${theme}`,
            ).toBe("block");
            // 容器尺寸（ProviderNav size=22）与 object-fit 布局不变。
            expect(await mark.evaluate((el) => el.getAttribute("style"))).toContain("width: 22px");
            expect(await mark.evaluate((el) => el.getAttribute("style"))).toContain("height: 22px");
            expect(await img.evaluate((el) => getComputedStyle(el).objectFit)).toBe("contain");
        }
    });
});
