import { expect, test } from "../fixtures/test";
import { PopupPage } from "../pages/popup_page";

/**
 * Phase 20 E2E: window height constraints — max 100%, internal scroll,
 * collapsed min height, no bottom whitespace regression.
 *
 * 上限口径：`docs/specs/window-management.md` 规定「不超过 100% 工作区高度」
 * （t081 起 `MAX_HEIGHT_RATIO = 1.0`）。原断言写死 75% 是 t081 之前的口径，
 * 在默认全高可用时会误报，已按现行契约同步。
 */
test.describe("popup window constraints", () => {
    test("window height does not exceed the screen work area", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        const { window_height, work_area_height } = await page.evaluate(() => {
            return {
                window_height: window.outerHeight,
                work_area_height: screen.availHeight,
            };
        });

        const max_allowed = Math.floor(work_area_height);
        // Allow 15px tolerance for OS window decorations and rounding
        expect(window_height).toBeLessThanOrEqual(max_allowed + 15);
    });

    test("scroll area is present when content exceeds max height", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // The scroll area should always exist in the popup layout
        const scroll_el = page.locator('[data-testid="popup-scroll"]').first();
        await expect(scroll_el).toBeVisible();
    });

    test("collapsing all cards does not leave large bottom whitespace", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // Collapse all collapsible cards
        let btns = page.locator('[aria-label="折叠"]');
        while ((await btns.count()) > 0) {
            await btns.first().click();
            await page.waitForTimeout(200);
            btns = page.locator('[aria-label="折叠"]');
        }

        // Scroll area should fill the window with minimal gap
        const gap = await page.evaluate(() => {
            const scroll = document.querySelector('[data-testid="popup-scroll"]');
            if (!(scroll instanceof HTMLElement)) return -1;
            const root = document.querySelector('[data-popup="live"]');
            if (!(root instanceof HTMLElement)) return -1;
            const root_rect = root.getBoundingClientRect();
            const scroll_rect = scroll.getBoundingClientRect();
            return root_rect.bottom - scroll_rect.bottom;
        });
        expect(gap).toBeLessThan(30);
    });

    test("window height dynamically adapts to content when window width is resized (widening -> shorter, narrowing -> taller)", async ({
        omni,
    }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        // 1. Initial measurement at default width (~482px)
        const initial_bounds = await omni.app.evaluate(({ BrowserWindow }) => {
            const win = BrowserWindow.getAllWindows().find((w) =>
                w.webContents.getURL().includes("#usage"),
            );
            return win ? win.getBounds() : null;
        });
        expect(initial_bounds).not.toBeNull();
        if (!initial_bounds) return;

        // 2. User pulls window wider to 680px: content un-wraps, window height becomes shorter
        await omni.app.evaluate(({ BrowserWindow }) => {
            const win = BrowserWindow.getAllWindows().find((w) =>
                w.webContents.getURL().includes("#usage"),
            );
            if (win) {
                win.setBounds({ width: 680 });
            }
        });

        // Wait for mirror measurement and IPC roundtrip
        await page.waitForTimeout(600);

        const wide_bounds = await omni.app.evaluate(({ BrowserWindow }) => {
            const win = BrowserWindow.getAllWindows().find((w) =>
                w.webContents.getURL().includes("#usage"),
            );
            return win ? win.getBounds() : null;
        });
        expect(wide_bounds).not.toBeNull();
        if (!wide_bounds) return;

        expect(wide_bounds.width).toBe(680);
        // 拉宽窗口后，高度自适应变矮（或在已折叠极限下不膨胀）
        expect(wide_bounds.height).toBeLessThanOrEqual(initial_bounds.height);

        // 3. User narrows window to 472px (USAGE_MIN_WIDTH): content wraps, window height becomes taller
        await omni.app.evaluate(({ BrowserWindow }) => {
            const win = BrowserWindow.getAllWindows().find((w) =>
                w.webContents.getURL().includes("#usage"),
            );
            if (win) {
                win.setBounds({ width: 472 });
            }
        });

        await page.waitForTimeout(600);

        const narrow_bounds = await omni.app.evaluate(({ BrowserWindow }) => {
            const win = BrowserWindow.getAllWindows().find((w) =>
                w.webContents.getURL().includes("#usage"),
            );
            return win ? win.getBounds() : null;
        });
        expect(narrow_bounds).not.toBeNull();
        if (!narrow_bounds) return;

        expect(narrow_bounds.width).toBe(472);
        // 缩窄窗口后，排版折行，高度自适应变高
        expect(narrow_bounds.height).toBeGreaterThanOrEqual(wide_bounds.height);
    });

    test("popup mode height is locked and disallows manual vertical resizing", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        const bounds_before = await omni.app.evaluate(({ BrowserWindow }) => {
            const win = BrowserWindow.getAllWindows().find((w) =>
                w.webContents.getURL().includes("#usage"),
            );
            return win ? win.getBounds() : null;
        });
        expect(bounds_before).not.toBeNull();
        if (!bounds_before) return;

        // 验证窗口 minHeight 与 maxHeight 均锁定为内容真实高度
        const min_max = await omni.app.evaluate(({ BrowserWindow }) => {
            const win = BrowserWindow.getAllWindows().find((w) =>
                w.webContents.getURL().includes("#usage"),
            );
            if (!win) return null;
            return {
                min: win.getMinimumSize(),
                max: win.getMaximumSize(),
            };
        });
        expect(min_max).not.toBeNull();
        if (!min_max) return;
        expect(min_max.min[1]).toBe(bounds_before.height);
        expect(min_max.max[1]).toBe(bounds_before.height);

        // 模拟外部或手动强设高度，应被锁定逻辑拦截并恢复
        await omni.app.evaluate(({ BrowserWindow }) => {
            const win = BrowserWindow.getAllWindows().find((w) =>
                w.webContents.getURL().includes("#usage"),
            );
            if (win) {
                const current = win.getBounds();
                win.setBounds({ height: current.height + 200 });
            }
        });
        await page.waitForTimeout(300);

        const bounds_after = await omni.app.evaluate(({ BrowserWindow }) => {
            const win = BrowserWindow.getAllWindows().find((w) =>
                w.webContents.getURL().includes("#usage"),
            );
            return win ? win.getBounds() : null;
        });
        expect(bounds_after).not.toBeNull();
        if (!bounds_after) return;
        expect(bounds_after.height).toBe(bounds_before.height);
    });

    test("switching provider card to multi-account detail expands window height", async ({
        omni,
    }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        const l2_btn = page.locator('button:has-text("账号")').first();
        if ((await l2_btn.count()) === 0) return;

        const bounds_before = await omni.app.evaluate(({ BrowserWindow }) => {
            const win = BrowserWindow.getAllWindows().find((w) =>
                w.webContents.getURL().includes("#usage"),
            );
            return win ? win.getBounds() : null;
        });
        expect(bounds_before).not.toBeNull();
        if (!bounds_before) return;

        await l2_btn.click();
        await page.waitForTimeout(600);

        const bounds_after = await omni.app.evaluate(({ BrowserWindow }) => {
            const win = BrowserWindow.getAllWindows().find((w) =>
                w.webContents.getURL().includes("#usage"),
            );
            return win ? win.getBounds() : null;
        });
        expect(bounds_after).not.toBeNull();
        if (!bounds_after) return;

        // 切换多账号明细后，窗口高度应自动撑高
        expect(bounds_after.height).toBeGreaterThan(bounds_before.height);
    });
});
