import { expect, test } from "../fixtures/test_web";
import { PopupPage } from "../pages/popup_page";

/**
 * Web e2e：popup 卡片拖拽手柄渲染与拖拽态。
 * mock local-api 回放真实快照；多 provider card 均带 grip，断言泛化。
 */
test.describe("popup drag handle (web)", () => {
    test("card grip handle is visible on draggable cards", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        await expect(popup.root().locator(".card-grip").first()).toBeVisible();
        expect(await popup.root().locator(".card-grip").count()).toBeGreaterThan(0);
    });

    test("dragging a card grip applies drag state to its card", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const grip = popup.root().locator(".card-grip").first();
        const box = await grip.boundingBox();
        if (!box) throw new Error("missing card grip bounds");

        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        await webPage.mouse.move(cx, cy);
        await webPage.mouse.down();
        // native dragstart 需 mouse 在按住状态下移动若干像素（headless 时序敏感，多步 + 显式等待）
        await webPage.mouse.move(cx + 25, cy + 25, { steps: 15 });

        const card = grip.locator(
            "xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' card ')][1]",
        );
        await expect(card).toHaveClass(/dragging/, { timeout: 5_000 });

        await webPage.mouse.up();
    });
});
