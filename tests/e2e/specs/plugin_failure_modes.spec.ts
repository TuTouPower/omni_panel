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
                    executablePath: "connectors/cpa",
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
            provider: "glm",
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
        const errCard = live.locator(".card").filter({ hasText: "FAKE-ERROR-PLUGIN" });
        await error_crash_setup.expect(errCard).toBeVisible({ timeout: 20_000 });
        await errCard.getByTitle("展开").click();
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
        const crashCard = live.locator(".card").filter({ hasText: "FAKE-CRASH-PLUGIN" });
        await error_crash_setup.expect(crashCard).toBeVisible({ timeout: 20_000 });
        await crashCard.getByTitle("展开").click();
        await error_crash_setup.expect(crashCard.locator(".card-state.err")).toBeVisible();
    });
});

slow_setup.test.describe("plugin timeout failure mode", () => {
    slow_setup.test("timeout shows failed card", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        const live = page.locator('[data-popup="live"]');
        const slowCard = live.locator(".card").filter({ hasText: "FAKE-SLOW-PLUGIN" });
        await slow_setup.expect(slowCard).toBeVisible({ timeout: 20_000 });
        await slowCard.getByTitle("展开").click();
        await slow_setup.expect(slowCard.locator(".card-state.err")).toBeVisible();
    });
});
