import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { createTestWithSetup } from "../fixtures/test_with_setup";
import { seed_fake_plugin } from "../fixtures/seeded_plugin";
import { PopupPage } from "../pages/popup_page";

const { test, expect } = createTestWithSetup({
    setupPlugins: (userDataDir: string) => {
        const userPluginDir = join(userDataDir, "plugins");
        // Two plugins with same provider -> triggers deduplication ("Kimi" / "Kimi 2")
        seed_fake_plugin(userPluginDir, {
            name: "dup-svc-plugin",
            displayName: "DupSvc",
            provider: "kimi",
            items: [{ id: "a1", name: "Account A", used: 30, limit: 100 }],
        });
        seed_fake_plugin(userPluginDir, {
            name: "dup-svc-plugin-2",
            displayName: "DupSvc",
            provider: "kimi",
            items: [{ id: "b1", name: "Account B", used: 70, limit: 100 }],
        });
        // Multi-item plugin with unique provider
        seed_fake_plugin(userPluginDir, {
            name: "multi-item-plugin",
            displayName: "MultiItem",
            provider: "antigravity",
            items: [
                { id: "m1", name: "Tokens", used: 500, limit: 1000 },
                { id: "m2", name: "Requests", used: 20, limit: 100 },
                { id: "m3", name: "Cost", used: 5, limit: 50 },
            ],
        });

        // Disable CPA monitoring of kimi/antigravity so the bundled CPA
        // connector doesn't override card labels with its displayName.
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
                        executablePath: "assets/plugins/cpa-usage-plugin.ts",
                        refreshIntervalSeconds: 300,
                        parameterValues: {
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

test.describe("multi-account display", () => {
    test("two plugins with same provider merge into one card", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // Wait for seeded plugins to refresh and render
        await page.waitForTimeout(5000);

        // Two plugins with provider "kimi" → one "Kimi" card with items from both
        const live = popup.root();
        const cardNames = live.locator(".card .card-name");
        const names: string[] = [];
        const count = await cardNames.count();
        for (let i = 0; i < count; i++) {
            const text = await cardNames.nth(i).textContent();
            if (text) names.push(text.trim());
        }

        // Should have exactly one "Kimi" card (not duplicated)
        const kimi = names.filter((n) => n === "Kimi");
        expect(kimi.length).toBe(1);
    });

    test("multi-item provider tab renders multiple progress bars", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // Wait for the multi-item plugin to refresh
        await page.waitForTimeout(5000);

        // Navigate to the Antigravity provider tab (items use provider "antigravity")
        const live = popup.root();
        const nav = live.locator(".tabs-wrap");
        await nav.getByRole("button", { name: /Antigravity/ }).click();
        await page.waitForTimeout(500);

        // Should have 3 bar-row elements for 3 items
        const bars = live.locator(".bar-row");
        await expect(bars).toHaveCount(3, { timeout: 10_000 });
    });
});
