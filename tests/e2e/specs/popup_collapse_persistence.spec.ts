import { join } from "node:path";
import { createTestWithSetup } from "../fixtures/test_with_setup";
import { seed_fake_plugin } from "../fixtures/seeded_plugin";
import { PopupPage } from "../pages/popup_page";

const { test, expect } = createTestWithSetup({
    setupPlugins: (userDataDir: string) => {
        seed_fake_plugin(join(userDataDir, "plugins"), {
            name: "persist-collapse-plugin",
            displayName: "PersistCollapse",
            provider: "claude",
            items: [
                { id: "persist-a", name: "Persist Account A", used: 10, limit: 100 },
                { id: "persist-b", name: "Persist Account B", used: 20, limit: 100 },
            ],
        });
    },
});

test.describe("collapse persistence across restart", () => {
    test("collapsed account stays collapsed after app restart", async ({ omni }) => {
        // --- Session 1: collapse an account ---
        const page1 = await omni.app.firstWindow();
        const popup1 = new PopupPage(page1);
        await popup1.waitReady();
        await page1.waitForTimeout(5000);

        const live1 = popup1.root();
        await live1.getByRole("button", { name: /^Claude$/ }).click();
        await live1.getByRole("button", { name: /折叠 Persist Account A/ }).click();
        await expect(live1.getByRole("button", { name: /展开 Persist Account A/ })).toBeVisible();

        // Give the persist effect time to flush to disk
        await page1.waitForTimeout(1000);

        // --- Restart ---
        await omni.stop();
        await omni.start();

        // --- Session 2: verify collapse is preserved ---
        const page2 = await omni.app.firstWindow();
        const popup2 = new PopupPage(page2);
        await popup2.waitReady();
        await page2.waitForTimeout(5000);

        const live2 = popup2.root();
        await live2.getByRole("button", { name: /^Claude$/ }).click();

        // Account A should still be collapsed from session 1
        await expect(live2.getByRole("button", { name: /展开 Persist Account A/ })).toBeVisible();
        // Account B should still be expanded (never collapsed)
        await expect(live2.getByRole("button", { name: /折叠 Persist Account B/ })).toBeVisible();
    });

    test("expanded account stays expanded after app restart", async ({ omni }) => {
        // --- Session 1: collapse A, then expand it again ---
        const page1 = await omni.app.firstWindow();
        const popup1 = new PopupPage(page1);
        await popup1.waitReady();
        await page1.waitForTimeout(5000);

        const live1 = popup1.root();
        await live1.getByRole("button", { name: /^Claude$/ }).click();

        // Collapse A
        await live1.getByRole("button", { name: /折叠 Persist Account A/ }).click();
        await expect(live1.getByRole("button", { name: /展开 Persist Account A/ })).toBeVisible();

        // Expand A back
        await live1.getByRole("button", { name: /展开 Persist Account A/ }).click();
        await expect(live1.getByRole("button", { name: /折叠 Persist Account A/ })).toBeVisible();

        await page1.waitForTimeout(1000);

        // --- Restart ---
        await omni.stop();
        await omni.start();

        // --- Session 2: A should be expanded ---
        const page2 = await omni.app.firstWindow();
        const popup2 = new PopupPage(page2);
        await popup2.waitReady();
        await page2.waitForTimeout(5000);

        const live2 = popup2.root();
        await live2.getByRole("button", { name: /^Claude$/ }).click();

        await expect(live2.getByRole("button", { name: /折叠 Persist Account A/ })).toBeVisible();
    });
});
