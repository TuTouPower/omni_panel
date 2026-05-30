import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
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
            overviewDisplayMode: "tabs",
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
        const baseUrl = page.url().split("#")[0] ?? "";
        await page.goto(baseUrl + "#settings");
        await page.waitForSelector('[data-testid="settings-sidebar"]', { timeout: 10_000 });

        const accountsNav = page.locator('[data-testid="settings-plugin-nav-accounts"]');
        await accountsNav.click();
        await page.waitForTimeout(500);

        // "My Claude" must still exist (not replaced by "Claude" or "Claude 2")
        await expectWithConfig(page.getByText("My Claude")).toBeVisible();

        // Total plugin count should be 7 (1 existing + 6 auto-seeded)
        const acctGroups = page.locator(".acct-group");
        const count = await acctGroups.count();
        expectWithConfig(count).toBe(BUNDLED_PLUGIN_NAMES.length);
    });
});
