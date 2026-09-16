import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, is_e2e_headless, headless_skip_reason } from "../fixtures/test";
import type { ElectronApplication, Page } from "@playwright/test";

/**
 * t252：四面板统一自绘控制区（AC3/AC4/AC5/AC7/AC9）。
 * - AC9 + AC4：agent 窗口系统标题为面板标题、无原生菜单栏。
 * - AC5：标题栏为拖拽区（DOM 断言；真实拖拽/双击最大化不可被 Playwright 模拟）。
 * - AC3：用量面板隐藏按钮隐藏窗口而非销毁；agent 窗口最小化/最大化正确。
 * - AC7：去原生菜单后输入框 copy/paste 编辑快捷键仍可用。
 */

/** 取某窗口属性的布尔值（BrowserWindow 对象不能序列化回测试进程，须在主进程内求值）。 */
async function bw_flag(
    app: ElectronApplication,
    url_fragment: string,
    getter: "isMinimized" | "isMaximized" | "isMenuBarVisible" | "isVisible",
): Promise<boolean> {
    return app.evaluate(
        ({ BrowserWindow }, { frag, g }) => {
            const w = BrowserWindow.getAllWindows().find((win) => {
                try {
                    return win.webContents.getURL().includes(frag);
                } catch {
                    return false;
                }
            });
            if (!w) throw new Error(`window not found: ${frag}`);
            return w[g]();
        },
        { frag: url_fragment, g: getter },
    );
}

async function bw_title(app: ElectronApplication, url_fragment: string): Promise<string> {
    return app.evaluate(({ BrowserWindow }, frag) => {
        const w = BrowserWindow.getAllWindows().find((win) => {
            try {
                return win.webContents.getURL().includes(frag);
            } catch {
                return false;
            }
        });
        if (!w) throw new Error(`window not found: ${frag}`);
        return w.getTitle();
    }, url_fragment);
}

async function open_agent_page(omni: ElectronApplication, popup: Page): Promise<Page> {
    await popup.evaluate(() => {
        window.usageboard.tokenStats.open();
    });
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
        const win = omni.windows().find((p) => p.url().includes("#agent"));
        if (win) return win;
        await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error("agent window page not found");
}

test.describe("panel window controls (t252)", () => {
    test("agent 窗口系统标题为面板标题（AC9）", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await page.waitForSelector('[data-testid="app-title"]', { timeout: 10_000 });
        const agent_page = await open_agent_page(omni.app, page);
        await agent_page.waitForSelector(".token-stats", { timeout: 15_000 });

        await expect(async () => {
            expect(await bw_title(omni.app, "#agent")).toBe("Omni Panel - Agent");
        }).toPass({ timeout: 10_000 });
    });

    test("agent 窗口无原生菜单栏（AC4）", async ({ omni }) => {
        // macOS 的菜单栏是应用级全局菜单，窗口级 isMenuBarVisible 恒为 true，
        // 该断言只在 Windows/Linux 有意义（平台适配见 t252）。
        test.skip(process.platform === "darwin", "macOS 菜单栏为全局，窗口级 API 不适用");
        const page = await omni.app.firstWindow();
        await page.waitForSelector('[data-testid="app-title"]', { timeout: 10_000 });
        const agent_page = await open_agent_page(omni.app, page);
        await agent_page.waitForSelector(".token-stats", { timeout: 15_000 });

        expect(await bw_flag(omni.app, "#agent", "isMenuBarVisible")).toBe(false);
    });

    test("标题栏为拖拽区（AC5 DOM 断言）", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await page.waitForSelector('[data-testid="app-title"]', { timeout: 10_000 });
        const region = await page.evaluate(() => {
            const el =
                document.querySelector("[data-panel-titlebar]") ??
                document.querySelector('[data-panel-titlebar="Usage"]');
            if (!el) return null;
            return getComputedStyle(el).getPropertyValue("-webkit-app-region");
        });
        expect(region).toContain("drag");
    });

    test("agent 窗口最小化/最大化按钮正确（AC3）", async ({ omni }) => {
        test.skip(
            is_e2e_headless(),
            headless_skip_reason("最小化/最大化状态（isMinimized/isMaximized）"),
        );
        const page = await omni.app.firstWindow();
        await page.waitForSelector('[data-testid="app-title"]', { timeout: 10_000 });
        const agent_page = await open_agent_page(omni.app, page);
        await agent_page.waitForSelector(".token-stats", { timeout: 15_000 });

        await agent_page.getByTitle("最小化").click();
        await expect(async () => {
            expect(await bw_flag(omni.app, "#agent", "isMinimized")).toBe(true);
        }).toPass({ timeout: 10_000 });

        await omni.app.evaluate(({ BrowserWindow }) => {
            const w = BrowserWindow.getAllWindows().find((win) => {
                try {
                    return win.webContents.getURL().includes("#agent");
                } catch {
                    return false;
                }
            });
            w?.restore();
        });

        await agent_page.getByTitle("最大化/还原").click();
        await expect(async () => {
            expect(await bw_flag(omni.app, "#agent", "isMaximized")).toBe(true);
        }).toPass({ timeout: 10_000 });
    });

    test("agent 窗口关闭按钮销毁窗口（AC3）", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await page.waitForSelector('[data-testid="app-title"]', { timeout: 10_000 });
        const agent_page = await open_agent_page(omni.app, page);
        await agent_page.waitForSelector(".token-stats", { timeout: 15_000 });

        await agent_page.getByRole("button", { name: "关闭" }).click();

        await expect(async () => {
            const exists = await omni.app.evaluate(({ BrowserWindow }) => {
                return BrowserWindow.getAllWindows().some((win) => {
                    try {
                        return win.webContents.getURL().includes("#agent");
                    } catch {
                        return false;
                    }
                });
            });
            expect(exists).toBe(false);
        }).toPass({ timeout: 10_000 });
    });

    test("agent 窗口内编辑快捷键 copy/paste 可用（AC7）", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await page.waitForSelector('[data-testid="app-title"]', { timeout: 10_000 });
        const agent_page = await open_agent_page(omni.app, page);
        await agent_page.waitForSelector(".token-stats", { timeout: 15_000 });

        await agent_page.evaluate(() => {
            const input = document.createElement("input");
            input.id = "ac7-src";
            input.value = "t252-copy-paste";
            document.body.appendChild(input);
            input.focus();
            input.select();
        });
        const modifier = process.platform === "darwin" ? "Meta" : "Control";
        await agent_page.keyboard.press(`${modifier}+c`);
        await agent_page.evaluate(() => {
            const paste = document.createElement("input");
            paste.id = "ac7-paste";
            document.body.appendChild(paste);
            paste.focus();
        });
        await agent_page.keyboard.press(`${modifier}+v`);
        await expect(agent_page.locator("#ac7-paste")).toHaveValue("t252-copy-paste", {
            timeout: 5_000,
        });
    });
});

/**
 * AC3：隐藏到托盘按钮只在 floating 模式渲染。主面板模式 `system` 的默认解析随平台而异
 * （`resolve_main_panel_mode`：darwin → popup，其余 → floating），因此这里显式 seed
 * `mainPanelMode: "floating"`，让该用例在所有平台测同一行为，而不是依赖宿主平台默认。
 */
test.describe("floating 模式：用量面板隐藏到托盘（AC3）", () => {
    test.use({
        omniOptions: {
            setupPlugins: (userDataDir: string) => {
                writeFileSync(
                    join(userDataDir, "config.json"),
                    JSON.stringify({
                        schemaVersion: 1,
                        language: "zh-Hans",
                        launchAtLogin: false,
                        mainPanelMode: "floating",
                        plugins: [],
                    }),
                );
            },
        },
    });

    test("用量面板隐藏按钮隐藏窗口而非销毁（AC3）", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await page.waitForSelector('[data-testid="app-title"]', { timeout: 10_000 });
        await page.getByRole("button", { name: "隐藏用量面板" }).click();

        await expect(async () => {
            const visible = await bw_flag(omni.app, "#usage", "isVisible");
            expect(visible).toBe(false);
        }).toPass({ timeout: 10_000 });
    });
});
