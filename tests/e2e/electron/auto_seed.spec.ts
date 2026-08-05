import { readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ElectronApplication, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { createTestWithSetup } from "../fixtures/test_with_setup";
import { PopupPage } from "../pages/popup_page";

/**
 * 运行时真实 bundled 连接器数，与 discover_connector_definitions 对齐（p042）。
 * 此前 BUNDLED_PLUGIN_NAMES 是 7 条历史插件名，与 connectors/ 实际 16 个脱节，
 * 断言靠 `>= 7` 宽松兜底——即使种子漏种大半也能过。
 */
function bundled_plugin_count(): number {
    const connectors_dir = join(process.cwd(), "connectors");
    return readdirSync(connectors_dir, { withFileTypes: true }).filter(
        (entry) =>
            entry.isDirectory() && existsSync(join(connectors_dir, entry.name, "manifest.json")),
    ).length;
}

test.describe("auto-seed", () => {
    test("fresh config auto-seeds all bundled plugins", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // After auto-seed + initial refresh, plugin cards should appear.
        // Wait for scheduler to complete initial refreshes.
        await page.waitForTimeout(5000);

        const pluginCards = page.locator(".card");
        const count = await pluginCards.count();
        // Auto-seed 种全部 bundled 连接器：卡片数 ≥ 真实 bundled 连接器数
        // （另有 UpcomingResetCard 等非插件卡片，故用 ≥ 而非精确等）。
        expect(count).toBeGreaterThanOrEqual(bundled_plugin_count());
    });
});

async function openSettings(app: ElectronApplication, page: Page): Promise<Page> {
    await page.evaluate(() => {
        window.usageboard.settings.open();
    });
    const settingsWindow = await app.waitForEvent("window", { timeout: 10_000 });
    await settingsWindow.waitForLoadState("domcontentloaded");
    await settingsWindow.waitForSelector('[data-testid="settings-sidebar"]', { timeout: 10_000 });
    return settingsWindow;
}

// Separate describe block with custom setup for the "existing config" test
const { test: testWithConfig, expect: expectWithConfig } = createTestWithSetup({
    setupPlugins: (userDataDir: string) => {
        // Write a config.json with one existing plugin.
        // This simulates a user who already configured "My Claude".
        const configPath = join(userDataDir, "config.json");
        const claudePath = join(process.cwd(), "connectors", "claude");

        const config = {
            schemaVersion: 1,
            language: "zh-Hans",
            plugins: [
                {
                    instanceId: "test-instance-id",
                    stateId: "test-state-id",
                    name: "My Claude",
                    displayName: "My Claude",
                    enabled: true,
                    executablePath: claudePath,
                    refreshIntervalSeconds: 300,
                    parameterValues: {},
                    endpointOverrides: {},
                },
            ],
            launchAtLogin: false,
        };

        mkdirSync(userDataDir, { recursive: true });
        writeFileSync(configPath, JSON.stringify(config, null, 2));
    },
});

testWithConfig.describe("auto-seed with existing config", () => {
    testWithConfig("existing config is not overwritten by auto-seed", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // The pre-written config has one plugin: "My Claude" (base name "claude-usage-plugin").
        // Auto-seed should NOT duplicate it -- only add the remaining bundled plugins.
        await page.waitForTimeout(5000);

        // Navigate to settings -> accounts to see plugin names
        const sPage = await openSettings(omni.app, page);

        const accountsNav = sPage.locator('[data-testid="settings-plugin-nav-accounts"]');
        await accountsNav.click();
        await sPage.waitForTimeout(500);

        // "My Claude" must still exist (not replaced by "Claude" or "Claude 2")
        // Account rows render as .acc-row inside per-provider .acc-card groups
        await expectWithConfig(
            sPage.locator(".acc-row").filter({ hasText: "My Claude" }).first(),
        ).toBeVisible();

        // Each configured plugin renders at least one .acc-row; the pre-seeded
        // "My Claude" plus all auto-seeded connectors must all be present.
        const accRows = sPage.locator(".acc-row");
        const count = await accRows.count();
        expectWithConfig(count).toBeGreaterThanOrEqual(bundled_plugin_count());
    });
});
