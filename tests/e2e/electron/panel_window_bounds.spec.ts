import { test, expect } from "../fixtures/test";
import type { ElectronApplication } from "@playwright/test";

/**
 * t251：会话/代理面板窗口 bounds 保存与恢复。
 * - AC1/AC2：调整 agent/history 窗口位置大小 → 关闭重开 → 恢复 bounds；两窗口互不影响。
 * - AC4：无保存键时按默认尺寸。
 * - t262：history 窗口 bounds 保存 → 关闭 → 重开恢复独立用例。
 */

interface BoundsLike {
    x: number;
    y: number;
    width: number;
    height: number;
}

async function get_window_bounds(app: ElectronApplication, route: string): Promise<BoundsLike> {
    return app.evaluate(({ BrowserWindow }, r) => {
        const w = BrowserWindow.getAllWindows().find((win) => {
            try {
                return win.webContents.getURL().includes(`#${r}`);
            } catch {
                return false;
            }
        });
        if (!w) throw new Error(`${r} window not found`);
        return w.getBounds();
    }, route);
}

async function set_window_bounds(
    app: ElectronApplication,
    route: string,
    bounds: BoundsLike,
): Promise<void> {
    await app.evaluate(
        ({ BrowserWindow }, { r, b }) => {
            const w = BrowserWindow.getAllWindows().find((win) => {
                try {
                    return win.webContents.getURL().includes(`#${r}`);
                } catch {
                    return false;
                }
            });
            if (!w) throw new Error(`${r} window not found`);
            w.setBounds(b);
        },
        { r: route, b: bounds },
    );
}

async function get_agent_bounds(app: ElectronApplication): Promise<BoundsLike> {
    return get_window_bounds(app, "agent");
}

async function set_agent_bounds(app: ElectronApplication, bounds: BoundsLike): Promise<void> {
    await set_window_bounds(app, "agent", bounds);
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

    test("history 窗口调整大小后重开恢复 bounds（t262）", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        // 打开 history 窗口（会话历史，无会话数据亦可创建）。
        await page.evaluate(() => {
            void window.usageboard.sessionHistory.open("", "", "");
        });
        await expect(async () => {
            const b = await get_window_bounds(omni.app, "history");
            expect(b).toBeTruthy();
        }).toPass({ timeout: 10_000 });

        // 调整位置与大小（不触发 min 钳制）。
        const target = { x: 90, y: 60, width: 960, height: 680 };
        await set_window_bounds(omni.app, "history", target);
        await new Promise((r) => setTimeout(r, 800));

        // 关闭再重开。
        await app_close_history(omni.app);
        await new Promise((r) => setTimeout(r, 300));
        await page.evaluate(() => {
            void window.usageboard.sessionHistory.open("", "", "");
        });
        await new Promise((r) => setTimeout(r, 500));

        const restored = await get_window_bounds(omni.app, "history");
        expect(restored.x).toBe(target.x);
        expect(restored.y).toBe(target.y);
        expect(restored.width).toBeGreaterThanOrEqual(target.width - 2);
        expect(restored.height).toBeGreaterThanOrEqual(target.height - 2);
    });
});

async function app_close_history(app: ElectronApplication): Promise<void> {
    await app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows().find((win) => {
            try {
                return win.webContents.getURL().includes("#history");
            } catch {
                return false;
            }
        });
        w?.close();
    });
}
