import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTestWithSetup } from "../fixtures/test_with_setup";
import { seed_fake_plugin } from "../fixtures/seeded_plugin";
import { SettingsPage } from "../pages/settings_page";

/**
 * Electron 专属：settings secret restart 持久化（web 无 restart 能力）。
 * about logo/version + accounts DOM 已迁 web/settings_provider_accounts.spec.ts。
 */
const { test, expect } = createTestWithSetup({
    setupPlugins: (userDataDir: string) => {
        const plugin_path = seed_fake_plugin(join(userDataDir, "plugins"), {
            name: "settings-deepseek-plugin",
            provider: "deepseek",
            requiredParam: "API_KEY",
            parameters: [
                {
                    name: "API_KEY",
                    label: "API 密钥",
                    type: "secret",
                    required: true,
                },
            ],
            items: [
                {
                    id: "settings-account",
                    name: "Settings Account",
                    used: 2,
                    limit: 20,
                },
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
                        instanceId: "settings-deepseek-plugin",
                        stateId: "settings-deepseek-plugin-state",
                        name: "SettingsDeepSeek",
                        enabled: true,
                        executablePath: plugin_path,
                        refreshIntervalSeconds: 300,
                        parameterValues: {},
                        endpointOverrides: {},
                    },
                ],
            }),
        );
    },
});

test.describe("settings provider accounts (electron 专属)", () => {
    test("settings save persists secrets through restart without writing plaintext config", async ({
        omni,
    }) => {
        let page = await omni.app.firstWindow();
        let settings = await SettingsPage.openViaIpc(omni.app, page);
        let sPage = settings.page;

        await sPage.getByTestId("settings-plugin-nav-accounts").click();
        const deepseek_edit = sPage
            .locator(":scope")
            .filter({ hasText: "DeepSeek" })
            .getByTitle("编辑");
        await deepseek_edit.first().click();

        const api_key_input = sPage.getByLabel("API 密钥");
        await expect(api_key_input).toBeVisible();
        await api_key_input.fill("sk-e2e-secret");
        await sPage.getByTestId("settings-save-btn-settings-deepseek-plugin").click();
        await expect(sPage.locator('[role="dialog"]')).toBeHidden();

        const config_text = readFileSync(join(omni.userDataDir, "config.json"), "utf8");
        expect(config_text).not.toContain("sk-e2e-secret");

        await omni.stop();
        await omni.start();

        page = await omni.app.firstWindow();
        settings = await SettingsPage.openViaIpc(omni.app, page);
        sPage = settings.page;

        await sPage.getByTestId("settings-plugin-nav-accounts").click();
        const deepseek_edit2 = sPage
            .locator(":scope")
            .filter({ hasText: "DeepSeek" })
            .getByTitle("编辑");
        await deepseek_edit2.first().click();

        await expect(sPage.getByLabel("API 密钥")).toHaveValue("sk-e2e-secret");
        await expect(sPage.getByLabel("API 密钥")).toHaveAttribute("type", "password");
    });
});
