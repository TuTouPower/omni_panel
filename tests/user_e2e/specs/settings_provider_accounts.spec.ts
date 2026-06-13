import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTestWithSetup } from "../fixtures/test_with_setup";
import { seed_fake_plugin } from "../fixtures/seeded_plugin";
import { SettingsPage } from "../pages/settings_page";

const { test, expect } = createTestWithSetup({
    setupPlugins: (userDataDir: string) => {
        const plugin_path = seed_fake_plugin(join(userDataDir, "plugins"), {
            name: "settings-deepseek-plugin",
            provider: "deepseek",
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

test.describe("settings provider accounts", () => {
    test("accounts page shows seeded provider group and account actions", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const settings = await SettingsPage.openViaIpc(omni.app, page);
        const sPage = settings.page;

        await sPage.getByTestId("settings-plugin-nav-accounts").click();

        const deepseek_row = sPage.locator(".ao-item").filter({ hasText: "SettingsDeepSeek" });
        await expect(deepseek_row).toBeVisible();
        await expect(deepseek_row.getByTitle("编辑")).toBeVisible();
    });

    test("about page shows real logo", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const settings = await SettingsPage.openViaIpc(omni.app, page);
        const sPage = settings.page;

        await sPage.getByTestId("settings-plugin-nav-about").click();

        const logo = sPage.locator(".aa-logo");
        await expect(logo).toBeVisible();
        await expect(logo).toHaveAttribute("src", /logo/);
    });

    test("about page shows version text", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const settings = await SettingsPage.openViaIpc(omni.app, page);
        const sPage = settings.page;

        await sPage.getByTestId("settings-plugin-nav-about").click();

        await expect(sPage.locator(".aa-ver")).toContainText(/版本 \d+\.\d+\.\d+/);
    });
});
