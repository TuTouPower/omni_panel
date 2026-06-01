import { join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { createTestWithSetup } from "../fixtures/test_with_setup";
import { seed_fake_plugin } from "../fixtures/seeded_plugin";
import { PopupPage } from "../pages/popup_page";

const ERR_ITEMS = [{ id: "err1", name: "Err", used: 10, limit: 100 }];
const CRASH_ITEMS = [{ id: "c1", name: "Crash", used: 5, limit: 50 }];
const SLOW_ITEMS = [{ id: "s1", name: "Slow", used: 1, limit: 10 }];

const { test, expect } = createTestWithSetup({
    setupPlugins: (userDataDir: string) => {
        const userPluginDir = join(userDataDir, "plugins");
        seed_fake_plugin(userPluginDir, {
            name: "fake-error-plugin",
            displayName: "FakeError",
            items: ERR_ITEMS,
            behavior: "error",
        });
        seed_fake_plugin(userPluginDir, {
            name: "fake-crash-plugin",
            displayName: "FakeCrash",
            items: CRASH_ITEMS,
            behavior: "crash",
        });
        seed_fake_plugin(userPluginDir, {
            name: "fake-slow-plugin",
            displayName: "FakeSlow",
            items: SLOW_ITEMS,
            behavior: "slow",
        });
    },
});

async function findCardByName(page: Page, name: string): Promise<Locator> {
    const live = page.locator('[data-popup="live"]');
    const allCards = live.locator(".card");
    const count = await allCards.count();
    for (let i = 0; i < count; i++) {
        const cardName = await allCards.nth(i).locator(".card-name").textContent();
        if (cardName?.trim() === name) {
            return allCards.nth(i);
        }
    }
    // Fallback — will cause a clear assertion failure
    return live.locator(`.card:has(.card-name:has-text("${name}"))`);
}

test.describe("plugin failure modes", () => {
    // Phase 21 TODO: failed-plugin error card UI not yet implemented.
    // Cards should show alert class + .card-state.err with error message
    // when a plugin enters failed state (error JSON, crash, or timeout).
    test.fixme("error JSON shows failed card with message", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // The error plugin outputs success:false, refresh-service sets status=failed
        const errCard = await findCardByName(page, "FakeError");
        await expect(errCard).toHaveClass(/alert/, { timeout: 20_000 });
        await expect(errCard.locator(".card-state.err")).toBeVisible();
        await expect(errCard.locator(".card-state.err")).toContainText("fake error");
    });

    test.fixme("crash (exit 2) shows failed card", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // The crash plugin exits with code 2 before producing output
        const crashCard = await findCardByName(page, "FakeCrash");
        await expect(crashCard).toHaveClass(/alert/, { timeout: 20_000 });
        await expect(crashCard.locator(".card-state.err")).toBeVisible();
    });

    test.fixme("timeout shows failed card", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // The slow plugin takes 60s; refresh-service has 15s timeout.
        // After ~15s the plugin should enter failed state.
        const slowCard = await findCardByName(page, "FakeSlow");
        await expect(slowCard).toHaveClass(/alert/, { timeout: 30_000 });
        await expect(slowCard.locator(".card-state.err")).toBeVisible();
    });
});
