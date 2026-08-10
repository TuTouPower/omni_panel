import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/test_web";
import { SettingsPage } from "../pages/settings_page";

/**
 * Web e2e：设置页主题三档 / accent 五档即时生效 + 刷新保持（t274 web parity）。
 * mock local-api 的 /v1/config 为进程内可变状态（mock_server.mjs），
 * GET 返回最近一次 POST 的 config，因此刷新后仍读到保存的 theme/accent。
 * 不固定 fixture 初始值：从当前 DOM 状态出发逐档点击断言结果。
 */
const ACCENT_PRESETS: Record<string, string> = {
    "#3d7afd": "blue",
    "#6f5cf6": "purple",
    "#0ea5a3": "teal",
    "#f5772f": "orange",
    "#e23744": "red",
};

function theme_attr(page: Page): Promise<string | null> {
    return page.evaluate(() => document.documentElement.getAttribute("data-theme"));
}

function inline_accent(page: Page): Promise<string> {
    return page.evaluate(() => document.documentElement.style.getPropertyValue("--accent").trim());
}

function resolve_accent(page: Page): Promise<string> {
    return page.evaluate(() => {
        const probe = document.createElement("span");
        probe.style.color = "var(--accent)";
        document.body.appendChild(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
    });
}

async function open_appearance(page: Page): Promise<SettingsPage> {
    await page.waitForSelector('[data-testid="app-title"]', { timeout: 10_000 });
    const settings = await SettingsPage.open_via_hash(page);
    await settings.page.locator('[data-testid="settings-plugin-nav-appearance"]').click();
    await expect(settings.page.getByText("用量条颜色方案")).toBeVisible();
    return settings;
}

test.describe("appearance theme (web)", () => {
    test("三档主题切换即时更新 data-theme (t274)", async ({ webPage }) => {
        const sPage = (await open_appearance(webPage)).page;

        await sPage.getByRole("button", { name: "浅色" }).click();
        expect(await theme_attr(webPage)).toBe("light");
        await expect(sPage.getByRole("button", { name: "浅色" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );

        await sPage.getByRole("button", { name: "深色" }).click();
        expect(await theme_attr(webPage)).toBe("dark");
        await expect(sPage.getByRole("button", { name: "深色" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );

        // system：matchMedia 解析（Playwright emulateMedia 改变 prefers-color-scheme）。
        await webPage.emulateMedia({ colorScheme: "dark" });
        await sPage.getByRole("button", { name: "跟随系统" }).click();
        expect(await theme_attr(webPage)).toBe("dark");
        await expect(sPage.getByRole("button", { name: "跟随系统" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );

        // system 随 OS 偏好即时重解析。
        await webPage.emulateMedia({ colorScheme: "light" });
        await sPage.getByRole("button", { name: "跟随系统" }).click();
        expect(await theme_attr(webPage)).toBe("light");
    });

    test("五档 accent 逐一点击更新 --accent 变量 (t274)", async ({ webPage }) => {
        const sPage = (await open_appearance(webPage)).page;
        const resolved_colors: string[] = [];
        for (const [hex, key] of Object.entries(ACCENT_PRESETS)) {
            await sPage.getByRole("button", { name: `强调色 ${hex}` }).click();
            expect(await inline_accent(webPage)).toBe(`var(--accent-${key})`);
            await expect(sPage.getByRole("button", { name: `强调色 ${hex}` })).toHaveAttribute(
                "aria-pressed",
                "true",
            );
            resolved_colors.push(await resolve_accent(webPage));
        }
        // 五档解析色互不相同（light/dark 下五档 hex 均不同），证明确实逐档生效。
        expect(new Set(resolved_colors).size).toBe(5);
    });

    test("主题与 accent 刷新后保持 (t274)", async ({ webPage }) => {
        const sPage = (await open_appearance(webPage)).page;
        let config_posts = 0;
        webPage.on("response", (r) => {
            if (r.url().endsWith("/v1/config") && r.request().method() === "POST") {
                config_posts += 1;
            }
        });

        // 选定明确组合：深色 + 红。等两次 config.save POST 都落到 mock 再刷新，
        // 否则 mock 进程内状态尚未更新，刷新读到的还是旧值。
        await sPage.getByRole("button", { name: "深色" }).click();
        await sPage.getByRole("button", { name: "强调色 #e23744" }).click();
        await expect.poll(() => config_posts).toBe(2);

        await webPage.reload();
        await webPage.waitForSelector('[data-testid="app-title"]', { timeout: 10_000 });
        await expect.poll(() => theme_attr(webPage)).toBe("dark");
        expect(await inline_accent(webPage)).toBe("var(--accent-red)");

        // 设置页控件选中态也恢复。
        const settings = await SettingsPage.open_via_hash(webPage);
        await settings.page.locator('[data-testid="settings-plugin-nav-appearance"]').click();
        await expect(settings.page.getByRole("button", { name: "深色" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
        await expect(settings.page.getByRole("button", { name: "强调色 #e23744" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
    });
});
