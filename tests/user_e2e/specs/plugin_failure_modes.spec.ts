import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { createTestWithSetup } from "../fixtures/test_with_setup";
import { seed_fake_plugin } from "../fixtures/seeded_plugin";
import { PopupPage } from "../pages/popup_page";

const ERR_ITEMS = [{ id: "err1", name: "Err", used: 10, limit: 100 }];
const CRASH_ITEMS = [{ id: "c1", name: "Crash", used: 5, limit: 50 }];
const SLOW_ITEMS = [{ id: "s1", name: "Slow", used: 1, limit: 10 }];

function write_config(userDataDir: string): void {
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
                        monitor_gemini: "false",
                    },
                    endpointOverrides: {},
                },
            ],
        }),
    );
}

const error_crash_setup = createTestWithSetup({
    setupPlugins: (userDataDir: string) => {
        const userPluginDir = join(userDataDir, "plugins");
        seed_fake_plugin(userPluginDir, {
            name: "fake-error-plugin",
            displayName: "FakeError",
            items: ERR_ITEMS,
            behavior: "error",
            provider: "kimi",
        });
        seed_fake_plugin(userPluginDir, {
            name: "fake-crash-plugin",
            displayName: "FakeCrash",
            items: CRASH_ITEMS,
            behavior: "crash",
            provider: "antigravity",
        });
        write_config(userDataDir);
    },
});

const slow_setup = createTestWithSetup({
    setupPlugins: (userDataDir: string) => {
        const userPluginDir = join(userDataDir, "plugins");
        seed_fake_plugin(userPluginDir, {
            name: "fake-slow-plugin",
            displayName: "FakeSlow",
            items: SLOW_ITEMS,
            behavior: "slow",
            provider: "gemini",
        });
        write_config(userDataDir);
    },
});

error_crash_setup.test.describe("plugin failure modes", () => {
    error_crash_setup.test("error JSON shows failed card with message", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        const live = page.locator('[data-popup="live"]');
        const errCard = live.locator('[data-provider="kimi"]');
        await error_crash_setup.expect(errCard).toHaveClass(/alert/, { timeout: 20_000 });
        await error_crash_setup.expect(errCard.locator(".card-state.err")).toBeVisible();
        await error_crash_setup
            .expect(errCard.locator(".card-state.err"))
            .toContainText("fake error");
    });

    error_crash_setup.test("crash (exit 2) shows failed card", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        const live = page.locator('[data-popup="live"]');
        const crashCard = live.locator('[data-provider="antigravity"]');
        await error_crash_setup.expect(crashCard).toHaveClass(/alert/, { timeout: 20_000 });
        await error_crash_setup.expect(crashCard.locator(".card-state.err")).toBeVisible();
    });
});

slow_setup.test.describe("plugin timeout failure mode", () => {
    slow_setup.test("timeout shows failed card", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        const live = page.locator('[data-popup="live"]');
        const slowCard = live.locator('[data-provider="gemini"]');
        await slow_setup.expect(slowCard).toHaveClass(/alert/, { timeout: 45_000 });
        await slow_setup.expect(slowCard.locator(".card-state.err")).toBeVisible();
    });
});
