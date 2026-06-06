import { join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import type { ElectronApplication, Page } from "@playwright/test";
import { createTestWithSetup } from "../fixtures/test_with_setup";
import { seed_fake_plugin } from "../fixtures/seeded_plugin";

const INSTANCE_ID = "secret-test-instance-001";
const STATE_ID = "secret-test-state-001";

const { test, expect } = createTestWithSetup({
    setupPlugins: (userDataDir: string) => {
        const userPluginDir = join(userDataDir, "plugins");
        const pluginPath = seed_fake_plugin(userPluginDir, {
            name: "secret-test-plugin",
            displayName: "SecretTest",
            items: [{ id: "s1", name: "Test", used: 10, limit: 100 }],
            parameters: [
                {
                    name: "api_secret",
                    label: "API Secret",
                    type: "secret",
                    required: true,
                    placeholder: "Enter your API key",
                },
            ],
        });

        // Write config with a stable instanceId so secrets persist across restarts
        const configPath = join(userDataDir, "config.json");
        const config = {
            schemaVersion: 1,
            language: "zh-Hans",
            plugins: [
                {
                    instanceId: INSTANCE_ID,
                    stateId: STATE_ID,
                    name: "SecretTest",
                    enabled: true,
                    executablePath: pluginPath,
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

async function openSettings(app: ElectronApplication, page: Page): Promise<Page> {
    const [settingsWindow] = await Promise.all([
        app.waitForEvent("window", {
            predicate: async (appWindow) => {
                await appWindow
                    .waitForLoadState("domcontentloaded", { timeout: 5_000 })
                    .catch(() => undefined);
                return appWindow
                    .locator('[data-testid="settings-sidebar"]')
                    .isVisible({ timeout: 5_000 })
                    .catch(() => false);
            },
            timeout: 10_000,
        }),
        page.evaluate(() => {
            window.usageboard.settings.open();
        }),
    ]);

    return settingsWindow;
}

async function openSecretForm(sPage: Page) {
    await sPage.locator('[data-testid="settings-plugin-nav-accounts"]').click();
    const group = sPage.locator(".acct-group").filter({ hasText: "SecretTest" }).first();
    await expect(group).toBeVisible();
    await group.locator('button[title="编辑"]').first().click();
    const form = sPage.locator(`[data-testid="settings-form-${INSTANCE_ID}"]`);
    await expect(form).toBeVisible();
    return form;
}

test.describe("secrets persistence", () => {
    test("secret survives app restart", async ({ omni }) => {
        let page = await omni.app.firstWindow();
        await page.waitForSelector(".app-title", { timeout: 10_000 });
        let sPage = await openSettings(omni.app, page);

        let form = await openSecretForm(sPage);
        const secretInput = form.locator('input[name="api_secret"][type="password"]');
        await secretInput.fill("my-secret-token-123");
        await form.locator('button[type="submit"]').click();
        await expect(sPage.locator('[role="dialog"]')).toBeHidden();

        await omni.stop();
        await omni.start();

        page = await omni.app.firstWindow();
        await page.waitForSelector(".app-title", { timeout: 10_000 });
        sPage = await openSettings(omni.app, page);

        form = await openSecretForm(sPage);
        const secretInputAfter = form.locator('input[name="api_secret"][type="password"]');
        await expect(secretInputAfter).toHaveValue("***");
    });

    test("secret value is masked in UI, not shown in plain text", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await page.waitForSelector(".app-title", { timeout: 10_000 });
        const sPage = await openSettings(omni.app, page);

        let form = await openSecretForm(sPage);
        const secretInput = form.locator('input[name="api_secret"][type="password"]');
        await secretInput.fill("super-secret-value");
        await form.locator('button[type="submit"]').click();
        await expect(sPage.locator('[role="dialog"]')).toBeHidden();

        form = await openSecretForm(sPage);
        const secretInputReloaded = form.locator('input[name="api_secret"][type="password"]');
        await expect(secretInputReloaded).toHaveValue("***");
        await expect(secretInputReloaded).not.toHaveValue("super-secret-value");
    });
});
