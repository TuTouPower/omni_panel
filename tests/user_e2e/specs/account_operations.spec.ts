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
                        executablePath: "connectors/cpa",
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

        const tab = live.getByRole("button", { name: /^DeepSeek$/ });
        await expect(tab).toBeVisible();
        await tab.click();

        const menu_buttons = live.locator('[aria-label="账号操作"]');
        await expect(menu_buttons).toHaveCount(2);
    });

    test("account menu shows actionable items", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();
        await page.waitForTimeout(5000);

        const live = popup.root();
        const tab = live.getByRole("button", { name: /^DeepSeek$/ });
        await expect(tab).toBeVisible();
        await tab.click();

        await live.locator('[aria-label="账号操作"]').first().click();

        await expect(page.getByText("编辑")).toBeVisible();
    });

    test("edit from account menu opens settings window", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();
        await page.waitForTimeout(5000);

        const live = popup.root();
        const tab = live.getByRole("button", { name: /^DeepSeek$/ });
        await expect(tab).toBeVisible();
        await tab.click();

        await live.locator('[aria-label="账号操作"]').first().click();

        const settingsPromise = omni.app.waitForEvent("window", { timeout: 10_000 });
        await page.getByText("编辑").click();

        const settings_page = await settingsPromise;
        await settings_page.waitForLoadState("domcontentloaded");
        expect(settings_page.url()).toContain("#settings");
        await settings_page.close();
    });

    test("closing a direct-source account removes only that account from the provider tab", async ({
        omni,
    }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();
        await page.waitForTimeout(5000);

        const live = popup.root();
        const tab = live.getByRole("button", { name: /^DeepSeek$/ });
        await expect(tab).toBeVisible();
        await tab.click();

        await expect(live.locator(".card-name").filter({ hasText: "Account A" })).toBeVisible();
        await expect(live.locator(".card-name").filter({ hasText: "Account B" })).toBeVisible();

        await live.locator('[aria-label="账号操作"]').first().click();
        await page.getByText("关闭监控").click();

        await expect(live.locator(".card-name").filter({ hasText: "Account A" })).toHaveCount(0);
        await expect(live.locator(".card-name").filter({ hasText: "Account B" })).toBeVisible();
    });

    test("delete menu item visible on direct-source accounts", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();
        await page.waitForTimeout(5000);

        const live = popup.root();
        const tab = live.getByRole("button", { name: /^DeepSeek$/ });
        await expect(tab).toBeVisible();
        await tab.click();

        await live.locator('[aria-label="账号操作"]').first().click();

        await expect(page.getByText("删除")).toBeVisible();
    });
});
