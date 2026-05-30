import { join } from "node:path";
import { createTestWithSetup } from "../fixtures/test_with_setup";
import { seed_fake_plugin } from "../fixtures/seeded_plugin";
import { PopupPage } from "../pages/popup_page";

const { test, expect } = createTestWithSetup({
    setupPlugins: (userDataDir: string) => {
        const userPluginDir = join(userDataDir, "plugins");
        // Two plugins with same metadata name -> triggers deduplication
        seed_fake_plugin(userPluginDir, {
            name: "dup-svc-plugin",
            displayName: "DupSvc",
            items: [{ id: "a1", name: "Account A", used: 30, limit: 100 }],
        });
        seed_fake_plugin(userPluginDir, {
            name: "dup-svc-plugin-2",
            displayName: "DupSvc",
            items: [{ id: "b1", name: "Account B", used: 70, limit: 100 }],
        });
        // Multi-item plugin
        seed_fake_plugin(userPluginDir, {
            name: "multi-item-plugin",
            displayName: "MultiItem",
            items: [
                { id: "m1", name: "Tokens", used: 500, limit: 1000 },
                { id: "m2", name: "Requests", used: 20, limit: 100 },
                { id: "m3", name: "Cost", used: 5, limit: 50 },
            ],
        });
    },
});

test.describe("multi-account display", () => {
    test("duplicate plugin names get deduplicated displayName", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // Wait for seeded plugins to refresh and render
        await page.waitForTimeout(5000);

        // display-names.ts: first instance keeps raw name, second gets " 2"
        const cardNames = page.locator(".card .card-name");
        const names: string[] = [];
        const count = await cardNames.count();
        for (let i = 0; i < count; i++) {
            const text = await cardNames.nth(i).textContent();
            if (text) names.push(text.trim());
        }

        const dupe = names.filter((n) => n === "DupSvc");
        const dupe2 = names.filter((n) => n === "DupSvc 2");

        // Both variants should appear
        expect(dupe.length).toBeGreaterThanOrEqual(1);
        expect(dupe2.length).toBeGreaterThanOrEqual(1);
    });

    test("multi-item card renders multiple progress bars", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // Wait for the multi-item plugin to refresh
        await page.waitForTimeout(5000);

        // Find the card named "MultiItem" (the plugin with 3 items)
        const allCards = page.locator(".card");
        const cardCount = await allCards.count();
        let multiCard = page.locator(".card").first(); // fallback
        for (let i = 0; i < cardCount; i++) {
            const name = await allCards.nth(i).locator(".card-name").textContent();
            if (name?.trim() === "MultiItem") {
                multiCard = allCards.nth(i);
                break;
            }
        }

        // Should have 3 bar-row elements for 3 items
        const bars = multiCard.locator(".bar-row");
        await expect(bars).toHaveCount(3, { timeout: 10_000 });
    });
});
