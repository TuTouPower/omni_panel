import { join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import type { Page } from "@playwright/test";
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
            overviewDisplayMode: "tabs",
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

async function openSettings(page: Page) {
    const baseUrl = page.url().split("#")[0] ?? "";
    await page.goto(baseUrl + "#settings");
    await page.waitForSelector('[data-testid="settings-sidebar"]', { timeout: 10_000 });
}

test.describe("secrets persistence", () => {
    test("secret survives app restart", async ({ omni }) => {
        // First launch — fill and save the secret
        let page = await omni.app.firstWindow();
        await page.waitForSelector(".app-title", { timeout: 10_000 });
        await openSettings(page);

        const secretInput = page.locator('input[name="api_secret"][type="password"]');
        await expect(secretInput).toBeVisible({ timeout: 5_000 });
        await secretInput.fill("my-secret-token-123");

        const saveBtn = page.locator('button[type="submit"]').first();
        await saveBtn.click();
        // Wait for save confirmation
        await expect(saveBtn).toHaveText("已保存", { timeout: 5_000 });

        // Restart the app (same userData dir, same instanceId)
        await omni.stop();
        await omni.start();

        // Second launch — verify secret persisted
        page = await omni.app.firstWindow();
        await page.waitForSelector(".app-title", { timeout: 10_000 });
        await openSettings(page);

        const secretInputAfter = page.locator('input[name="api_secret"][type="password"]');
        await expect(secretInputAfter).toBeVisible({ timeout: 5_000 });
        // The value should be masked
        await expect(secretInputAfter).toHaveValue("***");
    });

    test("secret value is masked in UI, not shown in plain text", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await page.waitForSelector(".app-title", { timeout: 10_000 });
        await openSettings(page);

        const secretInput = page.locator('input[name="api_secret"][type="password"]');
        await expect(secretInput).toBeVisible({ timeout: 5_000 });

        // Save a secret value
        await secretInput.fill("super-secret-value");

        const saveBtn = page.locator('button[type="submit"]').first();
        await saveBtn.click();
        await expect(saveBtn).toHaveText("已保存", { timeout: 5_000 });

        // Switch sections to force the form to re-mount and re-read config
        const aboutNav = page.locator('[data-testid="settings-plugin-nav-about"]');
        const generalNav = page.locator('[data-testid="settings-plugin-nav-general"]');
        await aboutNav.click();
        await page.waitForTimeout(500);
        await generalNav.click();
        await page.waitForTimeout(1000);

        const secretInputReloaded = page.locator('input[name="api_secret"][type="password"]');
        await expect(secretInputReloaded).toBeVisible({ timeout: 5_000 });
        await expect(secretInputReloaded).toHaveValue("***");
        await expect(secretInputReloaded).not.toHaveValue("super-secret-value");
    });
});
