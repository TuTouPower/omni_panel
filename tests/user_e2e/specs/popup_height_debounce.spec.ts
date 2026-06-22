import { join } from "node:path";
import { createTestWithSetup } from "../fixtures/test_with_setup";
import { seed_fake_plugin } from "../fixtures/seeded_plugin";
import { PopupPage } from "../pages/popup_page";

const { test, expect } = createTestWithSetup({
    setupPlugins: (userDataDir: string) => {
        seed_fake_plugin(join(userDataDir, "plugins"), {
            name: "debounce-claude-plugin",
            displayName: "DebounceClaude",
            provider: "claude",
            items: [
                { id: "debounce-a", name: "Debounce Account A", used: 10, limit: 100 },
                { id: "debounce-b", name: "Debounce Account B", used: 20, limit: 100 },
            ],
        });
    },
});

test.describe("popup height debounce", () => {
    test("rapid collapse and expand leaves popup usable", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();
        await page.waitForTimeout(5000);

        const live = popup.root();
        await live.getByRole("button", { name: /^Claude$/ }).click();

        for (const label of ["Debounce Account A", "Debounce Account B"]) {
            // Measure height before collapse
            const height_before = await page.evaluate(() => {
                const el = document.querySelector('[data-popup="live"]');
                return el instanceof HTMLElement ? el.getBoundingClientRect().height : 0;
            });

            // Collapse
            await live.getByRole("button", { name: new RegExp(`折叠 ${label}`) }).click();
            await page.waitForTimeout(200);

            // Height should be reduced after collapse
            const height_collapsed = await page.evaluate(() => {
                const el = document.querySelector('[data-popup="live"]');
                return el instanceof HTMLElement ? el.getBoundingClientRect().height : 0;
            });
            expect(height_collapsed).toBeLessThan(height_before);

            // Expand
            await live.getByRole("button", { name: new RegExp(`展开 ${label}`) }).click();
            await page.waitForTimeout(200);

            // Height should return after expand
            const height_expanded = await page.evaluate(() => {
                const el = document.querySelector('[data-popup="live"]');
                return el instanceof HTMLElement ? el.getBoundingClientRect().height : 0;
            });
            expect(height_expanded).toBeGreaterThan(height_collapsed);
        }

        await expect(
            live.locator(".card-name").filter({ hasText: "Debounce Account A" }),
        ).toBeVisible();
        await expect(live.locator(".statusbar")).toBeVisible();
    });

    test("mirror trees stay hidden while live popup remains measurable", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        const metrics = await page.evaluate(() => {
            const live = document.querySelector('[data-popup="live"]');
            const visible_mirrors = [...document.querySelectorAll(".popup-mirror")].filter(
                (node) => {
                    if (!(node instanceof HTMLElement)) return false;
                    const style = window.getComputedStyle(node);
                    return style.visibility !== "hidden" && style.display !== "none";
                },
            );
            return {
                live_height: live instanceof HTMLElement ? live.getBoundingClientRect().height : 0,
                visible_mirror_count: visible_mirrors.length,
            };
        });

        expect(metrics.live_height).toBeGreaterThan(0);
        expect(metrics.visible_mirror_count).toBe(0);
    });
});
