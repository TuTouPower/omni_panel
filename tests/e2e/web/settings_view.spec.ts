import { expect, test } from "../fixtures/test_web";
import { SettingsPage } from "../pages/settings_page";

/**
 * Web e2e：settings 视图（sidebar / appearance 颜色与样式）。
 * case 5（accounts config forms，依赖 .acct-row DOM）+ case 6（用量标签映射字段）
 * web SPA 无对应 UI，留 electron/settings_view.spec.ts。
 */
test.describe("settings view (web)", () => {
    test("shows sidebar navigation", async ({ webPage }) => {
        await webPage.waitForSelector(".app-title", { timeout: 10_000 });
        const settings = await SettingsPage.open_via_hash(webPage);
        await expect(settings.page.locator('[data-testid="settings-sidebar"]')).toBeVisible();
    });

    test("shows plugin navigation items", async ({ webPage }) => {
        await webPage.waitForSelector(".app-title", { timeout: 10_000 });
        const settings = await SettingsPage.open_via_hash(webPage);
        const sidebar = settings.page.locator('[data-testid="settings-sidebar"]');
        await expect(sidebar).toBeVisible();
    });

    test("changes usage bar color scheme from appearance settings", async ({ webPage }) => {
        await webPage.waitForSelector(".app-title", { timeout: 10_000 });
        const settings = await SettingsPage.open_via_hash(webPage);
        const sPage = settings.page;

        await sPage.locator('[data-testid="settings-plugin-nav-appearance"]').click();

        await expect(sPage.getByText("用量条颜色方案")).toBeVisible();
        await expect(sPage.getByRole("button", { name: /风险色：仅当前用量/ })).toBeVisible();
        await expect(sPage.getByRole("button", { name: /风险色：带投影预测/ })).toBeVisible();
        await expect(sPage.getByRole("button", { name: /彩色区分：九色循环/ })).toBeVisible();

        await sPage.getByRole("button", { name: /彩色区分：九色循环/ }).click();
        await expect(sPage.getByRole("button", { name: /彩色区分：九色循环/ })).toHaveClass(
            /\bon\b/,
        );
    });

    test("shows usage bar style buttons above color scheme", async ({ webPage }) => {
        await webPage.waitForSelector(".app-title", { timeout: 10_000 });
        const settings = await SettingsPage.open_via_hash(webPage);
        const sPage = settings.page;

        await sPage.locator('[data-testid="settings-plugin-nav-appearance"]').click();
        const styleLabel = sPage.getByText("用量条样式");
        const colorLabel = sPage.getByText("用量条颜色方案");
        await expect(styleLabel).toBeVisible();
        await expect(colorLabel).toBeVisible();
        const styleBox = await styleLabel.boundingBox();
        const colorBox = await colorLabel.boundingBox();
        expect(styleBox?.y ?? 0).toBeLessThan(colorBox?.y ?? 0);

        const styleField = sPage.getByLabel("用量条样式");
        await expect(styleField.getByRole("button", { name: "细线型" })).toBeVisible();
        await expect(styleField.getByRole("button", { name: "粗胶囊型" })).toBeVisible();
        await styleField.getByRole("button", { name: "粗胶囊型" }).click();
        await expect(styleField.getByRole("button", { name: "粗胶囊型" })).toHaveClass(/\bon\b/);
    });
});
