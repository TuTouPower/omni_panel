import { join } from "node:path";
import { createTestWithSetup } from "../fixtures/test_with_setup";
import { seed_fake_plugin } from "../fixtures/seeded_plugin";
import { PopupPage } from "../pages/popup_page";

const { test, expect } = createTestWithSetup({
    setupPlugins: (userDataDir: string) => {
        seed_fake_plugin(join(userDataDir, "plugins"), {
            name: "drag-claude-plugin",
            displayName: "DragClaude",
            provider: "claude",
            items: [
                {
                    id: "drag-account",
                    name: "Drag Account",
                    used: 1,
                    limit: 10,
                },
            ],
        });
    },
});

test.describe("popup drag handle", () => {
    test("card grip handle is visible on draggable cards", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        await expect(popup.root().locator(".card-grip").first()).toBeVisible();
    });

    test("dragging a card grip applies drag state to its card", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        const grip = popup.root().locator(".card-grip").first();
        const box = await grip.boundingBox();
        if (!box) throw new Error("missing card grip bounds");

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();

        const card = grip.locator(
            "xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' card ')][1]",
        );
        await expect(card).toHaveClass(/dragging/);

        await page.mouse.up();
    });
});
