import { expect, test } from "../fixtures/test_web";

/**
 * t259 AC2/AC3：网页版四面板互跳（PanelTitleBar 图标 → hash 路由切换）
 * 与「不渲染 min/max/close」断言。web e2e 走 mock local-api + vite preview。
 *
 * 互跳链：agent → session(history) → setting → usage。用量面板（PopupView）
 * 无标题栏（与桌面一致，托盘面板不承载互跳），故不回跳 agent。
 */
test.describe("web panel navigation (t259)", () => {
    test("标题栏互跳图标在浏览器内切换 hash 路由（AC2）", async ({ webPage }) => {
        const page = webPage;
        await page.goto("/#agent");
        await expect(page.locator("[data-panel-titlebar=Agent]")).toBeVisible();

        // Agent → Session（history 路由）。
        await page.getByRole("button", { name: "Session面板" }).click();
        await expect(page.locator(".session-shell").first()).toBeVisible();
        await expect.poll(async () => page.evaluate(() => window.location.hash)).toBe("#history");

        // Session → Settings。
        await page.getByRole("button", { name: "Settings面板" }).click();
        // 设置面板先过 loading（标题栏无 onNavigate），等待真实设置内容挂载。
        await expect(page.locator(".settings").first()).toBeVisible();
        await expect.poll(async () => page.evaluate(() => window.location.hash)).toBe("#setting");

        // Settings → Usage。
        await page.getByRole("button", { name: "Usage面板" }).click();
        await expect.poll(async () => page.evaluate(() => window.location.hash)).toBe("#usage");
    });

    test("当前面板对应互跳入口按桌面规则隐藏（AC2）", async ({ webPage }) => {
        const page = webPage;
        await page.goto("/#agent");
        await expect(page.locator("[data-panel-titlebar=Agent]")).toBeVisible();
        await expect(page.getByRole("button", { name: "Agent面板" })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Usage面板" })).toHaveCount(1);
        await expect(page.getByRole("button", { name: "Session面板" })).toHaveCount(1);
        await expect(page.getByRole("button", { name: "Settings面板" })).toHaveCount(1);

        await page.goto("/#history");
        await expect(page.locator("[data-panel-titlebar=Session]").first()).toBeVisible();
        await expect(page.getByRole("button", { name: "Session面板" })).toHaveCount(0);
        // t259 f004: history 侧其余入口仍可见。
        await expect(page.getByRole("button", { name: "Usage面板" })).toHaveCount(1);
        await expect(page.getByRole("button", { name: "Agent面板" })).toHaveCount(1);
        await expect(page.getByRole("button", { name: "Settings面板" })).toHaveCount(1);
    });

    test("web 不渲染最小化/最大化/关闭控件，控制区其余按钮保留（AC3）", async ({ webPage }) => {
        const page = webPage;
        await page.goto("/#agent");
        await expect(page.locator("[data-panel-titlebar=Agent]")).toBeVisible();
        await expect(page.getByRole("button", { name: "最小化" })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "最大化/还原" })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "关闭" })).toHaveCount(0);
        // 其余控制区与桌面一致：刷新按钮仍在。
        await expect(page.getByRole("button", { name: "刷新" })).toBeVisible();
    });

    test("history 路由渲染会话面板（AC1）", async ({ webPage }) => {
        const page = webPage;
        await page.goto("/#history");
        await expect(page.locator(".session-shell").first()).toBeVisible();
        await expect(page.getByRole("button", { name: "工作台", exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "会话库", exact: true })).toBeVisible();
    });
});
