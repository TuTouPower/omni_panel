import { join } from "node:path";
import { createTestWithSetup } from "../fixtures/test_with_setup";
import { seed_fake_plugin } from "../fixtures/seeded_plugin";
import { PopupPage } from "../pages/popup_page";

const { test, expect } = createTestWithSetup({
    setupPlugins: (userDataDir: string) => {
        seed_fake_plugin(join(userDataDir, "plugins"), {
            name: "refresh-reset-claude-plugin",
            displayName: "RefreshResetClaude",
            provider: "claude",
            items: [
                { id: "refresh-a", name: "Refresh Account A", used: 10, limit: 100 },
                { id: "refresh-b", name: "Refresh Account B", used: 20, limit: 100 },
            ],
        });
    },
});

test.describe("popup refresh state reset", () => {
    test("collapse is preserved when structure is unchanged", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();
        await page.waitForTimeout(5000);

        const live = popup.root();
        await live.getByRole("button", { name: /^Claude$/ }).click();

        await live.getByRole("button", { name: /折叠 Refresh Account A/ }).click();
        await expect(live.getByRole("button", { name: /展开 Refresh Account A/ })).toBeVisible();

        await live.getByRole("button", { name: "刷新" }).click();
        await expect(live.getByRole("button", { name: /展开 Refresh Account A/ })).toBeVisible();
    });

    test("tab switch restores expanded account rows", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();
        await page.waitForTimeout(5000);

        const live = popup.root();
        await live.getByRole("button", { name: /^Claude$/ }).click();
        await live.getByRole("button", { name: /折叠 Refresh Account A/ }).click();
        await expect(live.getByRole("button", { name: /展开 Refresh Account A/ })).toBeVisible();

        await live.getByRole("button", { name: "总览" }).click();
        await live.getByRole("button", { name: /^Claude$/ }).click();

        await expect(live.getByRole("button", { name: /折叠 Refresh Account A/ })).toBeVisible();
    });
});
