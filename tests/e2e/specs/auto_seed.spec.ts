import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ElectronApplication, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { createTestWithSetup } from "../fixtures/test_with_setup";
import { PopupPage } from "../pages/popup_page";

const BUNDLED_PLUGIN_NAMES = [
    "claude-usage-plugin",
    "codex-usage-plugin",
    "cpa-usage-plugin",
    "deepseek-usage-plugin",
    "glm-usage-plugin",
    "minimax-usage-plugin",
    "tavily-usage-plugin",
];

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
        // Should have at least as many cards as bundled plugins
        expect(count).toBeGreaterThanOrEqual(BUNDLED_PLUGIN_NAMES.length);
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
        const bundledDir = join(process.cwd(), "resources", "plugins");
        const claudePath = join(bundledDir, "claude-usage-plugin.ts");

        const config = {
            schemaVersion: 1,
            language: "zh-Hans",
            plugins: [
                {
                    stateId: "test-state-id",
                    name: "My Claude",
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
        // Single-account providers render as .acct-row without .acct-group wrapper
        await expectWithConfig(
            sPage.locator(".acct-row, .acct-group").filter({ hasText: "My Claude" }).first(),
        ).toBeVisible();

        // Total plugin count should be >= 7 (1 existing + 6 auto-seeded)
        // Count both grouped and standalone account rows (.ao-item for single, .acct-row for grouped)
        const acctRows = sPage.locator(".acct-row");
        const acctGroups = sPage.locator(".acct-group");
        const aoItems = sPage.locator(".ao-item");
        const count =
            (await acctRows.count()) + (await acctGroups.count()) + (await aoItems.count());
        expectWithConfig(count).toBeGreaterThanOrEqual(BUNDLED_PLUGIN_NAMES.length);
    });
});
