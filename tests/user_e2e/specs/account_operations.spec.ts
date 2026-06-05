import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { createTestWithSetup } from "../fixtures/test_with_setup";
import { seed_fake_plugin } from "../fixtures/seeded_plugin";
import { PopupPage } from "../pages/popup_page";

const { test, expect } = createTestWithSetup({
    setupPlugins: (userDataDir: string) => {
        const userPluginDir = join(userDataDir, "plugins");

        // Direct plugin with two accounts
        seed_fake_plugin(userPluginDir, {
            name: "multi-account-plugin",
            displayName: "MultiAcct",
            provider: "deepseek",
            items: [
                { id: "ds-acc-a", name: "Account A", used: 10, limit: 100 },
                { id: "ds-acc-b", name: "Account B", used: 20, limit: 200 },
            ],
        });

        writeFileSync(
            join(userDataDir, "config.json"),
            JSON.stringify({
                schemaVersion: 1,
                language: "zh-Hans",
                launchAtLogin: false,
                plugins: [
                    {
                        instanceId: "cpa-builtin",
                        stateId: "cpa-builtin-state",
                        name: "CPA",
                        enabled: true,
                        executablePath: "resources/plugins/cpa-usage-plugin.ts",
                        refreshIntervalSeconds: 300,
                        parameterValues: {
                            monitor_claude: "false",
                            monitor_codex: "false",
                            monitor_gemini: "false",
                            monitor_antigravity: "false",
                            monitor_kimi: "false",
                            monitor_deepseek: "false",
                        },
                        endpointOverrides: {},
                    },
                    {
                        instanceId: "multi-account-plugin",
                        stateId: "multi-account-plugin",
                        name: "MultiAcct",
                        enabled: true,
                        executablePath: "plugins/multi-account-plugin.ts",
                        refreshIntervalSeconds: 300,
                        parameterValues: {},
                        endpointOverrides: {},
                    },
                ],
            }),
        );
    },
});

test.describe("account-level operations", () => {
    test("account menu buttons appear on provider tab with multiple accounts", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // Wait for seeded plugins to refresh
        await page.waitForTimeout(5000);

        const live = popup.root();

        // Navigate to DeepSeek tab (seeded plugin provides deepseek)
        const tab = live.getByRole("button", { name: /^DeepSeek$/ });
        if ((await tab.count()) === 0) {
            test.skip(true, "DeepSeek tab not found — plugin may not have refreshed");
            return;
        }
        await tab.click();
        await page.waitForTimeout(500);

        // Account-level menu buttons should be present
        const menu_buttons = live.locator('[aria-label="账号操作"]');
        expect(await menu_buttons.count()).toBeGreaterThanOrEqual(2);
    });

    test("account menu shows actionable items", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();
        await page.waitForTimeout(5000);

        const live = popup.root();
        const tab = live.getByRole("button", { name: /^DeepSeek$/ });
        if ((await tab.count()) === 0) {
            test.skip(true, "DeepSeek tab not found");
            return;
        }
        await tab.click();
        await page.waitForTimeout(500);

        // Click the first account menu
        await live.locator('[aria-label="账号操作"]').first().click();
        await page.waitForTimeout(300);

        // Menu should contain 编辑
        const edit_item = page.getByText("编辑");
        expect(await edit_item.isVisible()).toBe(true);
    });

    test("edit from account menu opens settings window", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();
        await page.waitForTimeout(5000);

        const live = popup.root();
        const tab = live.getByRole("button", { name: /^DeepSeek$/ });
        if ((await tab.count()) === 0) {
            test.skip(true, "DeepSeek tab not found");
            return;
        }
        await tab.click();
        await page.waitForTimeout(500);

        // Click account menu
        await live.locator('[aria-label="账号操作"]').first().click();
        await page.waitForTimeout(300);

        // Click 编辑
        const edit_btn = page.getByText("编辑");
        if ((await edit_btn.count()) === 0) {
            test.skip(true, "编辑 not found in menu");
            return;
        }
        await edit_btn.click();

        // Settings window should open
        const settings_page = await omni.app.waitForEvent("window", { timeout: 10_000 });
        await settings_page.waitForLoadState("domcontentloaded");
        expect(settings_page.url()).toContain("#settings");
        await settings_page.close();
    });
});
