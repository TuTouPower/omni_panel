import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { createTestWithSetup } from "../fixtures/test_with_setup";
import { seed_fake_plugin } from "../fixtures/seeded_plugin";
import { PopupPage } from "../pages/popup_page";

const { test, expect } = createTestWithSetup({
    setupPlugins: (userDataDir: string) => {
        const userPluginDir = join(userDataDir, "plugins");

        seed_fake_plugin(userPluginDir, {
            name: "critical-gemini-plugin",
            displayName: "CriticalGemini",
            provider: "gemini",
            items: [
                {
                    id: "critical-account",
                    name: "Critical Account",
                    used: 99,
                    limit: 100,
                    status: "critical",
                },
            ],
        });
        seed_fake_plugin(userPluginDir, {
            name: "auth-kimi-plugin",
            displayName: "AuthKimi",
            provider: "kimi",
            behavior: "error",
            errorMessage: "unauthorized token",
            items: [],
        });
        seed_fake_plugin(userPluginDir, {
            name: "network-antigravity-plugin",
            displayName: "NetworkAntigravity",
            provider: "antigravity",
            behavior: "error",
            errorMessage: "network timeout",
            items: [],
        });

        writeFileSync(
            join(userDataDir, "config.json"),
            JSON.stringify({
                schemaVersion: 1,
                language: "zh-Hans",
                launchAtLogin: false,
                plugins: [
                    {
                        instanceId: "cpa-test-id",
                        stateId: "cpa-test-state",
                        name: "CPA",
                        enabled: true,
                        executablePath: "resources/plugins/cpa-usage-plugin.ts",
                        refreshIntervalSeconds: 300,
                        parameterValues: {
                            monitor_gemini: "false",
                            monitor_kimi: "false",
                            monitor_antigravity: "false",
                        },
                        endpointOverrides: {},
                    },
                ],
            }),
        );
    },
});

test.describe("popup card states", () => {
    test("error card shows retry action", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();
        await page.waitForTimeout(5000);

        const live = popup.root();
        await expect(live.locator('[data-provider="antigravity"] .card-state.err')).toContainText(
            "network timeout",
        );
        await expect(live.locator('[data-provider="antigravity"]').getByText("重试")).toBeVisible();
    });

    test("auth failure shows settings link", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();
        await page.waitForTimeout(5000);

        const live = popup.root();
        await expect(live.locator('[data-provider="kimi"] .card-state.auth')).toContainText(
            "凭证失效",
        );
        await expect(live.locator('[data-provider="kimi"] .card-state.auth .cs-action')).toHaveText(
            "重新登录",
        );
    });

    test("critical usage shows alert border and filled usage bar", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();
        await page.waitForTimeout(5000);

        const live = popup.root();
        await live.getByRole("button", { name: /^Gemini$/ }).click();
        await expect(live.locator(".card.alert")).toHaveCount(1);
        await expect(live.locator(".bar-row .fill")).toHaveAttribute("style", /width:\s*99%/);
    });
});
