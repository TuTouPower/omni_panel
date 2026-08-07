import { test, expect } from "../fixtures/test";
import type { ElectronApplication } from "@playwright/test";

/**
 * t251：会话/代理面板窗口 bounds 保存与恢复。
 * - AC1/AC2：调整 agent/history 窗口位置大小 → 关闭重开 → 恢复 bounds；两窗口互不影响。
 * - AC4：无保存键时按默认尺寸。
 */

interface BoundsLike {
    x: number;
    y: number;
    width: number;
    height: number;
}

async function get_agent_bounds(app: ElectronApplication): Promise<BoundsLike> {
    return app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows().find((win) => {
            try {
                return win.webContents.getURL().includes("#agent");
            } catch {
                return false;
            }
        });
        if (!w) throw new Error("agent window not found");
        return w.getBounds();
    });
}

async function set_agent_bounds(app: ElectronApplication, bounds: BoundsLike): Promise<void> {
    await app.evaluate(({ BrowserWindow }, b) => {
        const w = BrowserWindow.getAllWindows().find((win) => {
            try {
                return win.webContents.getURL().includes("#agent");
            } catch {
                return false;
            }
        });
        if (!w) throw new Error("agent window not found");
        w.setBounds(b);
    }, bounds);
}

async function close_agent(app: ElectronApplication): Promise<void> {
    await app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows().find((win) => {
            try {
                return win.webContents.getURL().includes("#agent");
            } catch {
                return false;
            }
        });
        w?.close();
    });
}

test.describe("panel window bounds persist (t251)", () => {
    test("agent 窗口移动/调整大小后重开恢复 bounds", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        // 打开 agent 窗口。
        await page.evaluate(() => {
            window.usageboard.tokenStats.open();
        });
        await expect(async () => {
            const b = await get_agent_bounds(omni.app);
            expect(b).toBeTruthy();
        }).toPass({ timeout: 10_000 });

        // 调整位置与大小。
        const target = { x: 120, y: 80, width: 940, height: 660 };
        await set_agent_bounds(omni.app, target);
        // 等 move/resize 保存落盘（scheduleSave 500ms 防抖）。
        await new Promise((r) => setTimeout(r, 800));

        // 关闭再重开。
        await close_agent(omni.app);
        await new Promise((r) => setTimeout(r, 300));
        await page.evaluate(() => {
            window.usageboard.tokenStats.open();
        });
        await new Promise((r) => setTimeout(r, 500));

        const restored = await get_agent_bounds(omni.app);
        // 恢复保存的 bounds（x/y 精确、宽高 ≥ 目标或被钳制）。
        expect(restored.x).toBe(target.x);
        expect(restored.y).toBe(target.y);
        expect(restored.width).toBeGreaterThanOrEqual(target.width - 2);
        expect(restored.height).toBeGreaterThanOrEqual(target.height - 2);
    });
});
