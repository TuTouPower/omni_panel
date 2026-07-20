import { join } from "node:path";
import { createTestWithSetup } from "../fixtures/test_with_setup";
import { seed_fake_plugin } from "../fixtures/seeded_plugin";
import { PopupPage } from "../pages/popup_page";

const { test, expect } = createTestWithSetup({
    setupPlugins: (userDataDir: string) => {
        seed_fake_plugin(join(userDataDir, "plugins"), {
            name: "height-claude-plugin",
            displayName: "HeightClaude",
            provider: "claude",
            items: [
                { id: "height-a", name: "Height Account A", used: 10, limit: 100 },
                { id: "height-b", name: "Height Account B", used: 20, limit: 100 },
            ],
        });
    },
});

test.describe("popup card collapse height", () => {
    test("collapse single card reduces window height", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();
        await page.waitForTimeout(5000);

        const live = popup.root();
        await live.getByRole("button", { name: /^Claude$/ }).click();

        const content = live.locator(".scroll-inner");
        const height_before = await content.evaluate((node) => node.scrollHeight);
        await live.getByRole("button", { name: /折叠 Height Account A/ }).click();
        await expect(live.getByRole("button", { name: /展开 Height Account A/ })).toBeVisible();
        const height_after = await content.evaluate((node) => node.scrollHeight);

        expect(height_after).toBeLessThan(height_before);
    });

    test("expand card restores window height", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();
        await page.waitForTimeout(5000);

        const live = popup.root();
        await live.getByRole("button", { name: /^Claude$/ }).click();
        await live.getByRole("button", { name: /折叠 Height Account A/ }).click();
        const content = live.locator(".scroll-inner");
        const height_collapsed = await content.evaluate((node) => node.scrollHeight);

        await live.getByRole("button", { name: /展开 Height Account A/ }).click();
        await expect(live.getByRole("button", { name: /折叠 Height Account A/ })).toBeVisible();
        const height_expanded = await content.evaluate((node) => node.scrollHeight);

        expect(height_expanded).toBeGreaterThan(height_collapsed);
    });

    test("collapse all cards keeps scroll attached to content", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();
        await page.waitForTimeout(5000);

        const live = popup.root();
        await live.getByRole("button", { name: /^Claude$/ }).click();
        await live.getByRole("button", { name: /折叠 Height Account A/ }).click();
        await live.getByRole("button", { name: /折叠 Height Account B/ }).click();

        await expect(live.locator(".scroll")).toBeVisible();
        const space = await live.evaluate((node) => {
            const scroll = node.querySelector(".scroll");
            if (!(scroll instanceof HTMLElement)) return Number.POSITIVE_INFINITY;
            return node.getBoundingClientRect().bottom - scroll.getBoundingClientRect().bottom;
        });
        expect(space).toBeLessThan(20);
    });

    test("tab switch restores expanded account rows", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();
        await page.waitForTimeout(5000);

        const live = popup.root();
        await live.getByRole("button", { name: /^Claude$/ }).click();
        await live.getByRole("button", { name: /折叠 Height Account A/ }).click();
        await expect(live.getByRole("button", { name: /展开 Height Account A/ })).toBeVisible();

        await live.getByRole("button", { name: "总览" }).click();
        await live.getByRole("button", { name: /^Claude$/ }).click();

        await expect(live.getByRole("button", { name: /折叠 Height Account A/ })).toBeVisible();
    });
});
