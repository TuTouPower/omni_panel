import { expect, test } from "../fixtures/test_web";

/**
 * t451 黑盒：代理面板自定义日期链路（Chromium 原生 select 手势）。
 * jsdom userEvent 只能近似手势序列；本文件用真浏览器验证：
 * 下拉选自定义面板保持打开、非法区间行内报错、合法区间应用后保持自定义。
 */
test.describe("web agent custom range (t451)", () => {
    test("AC-001: 下拉选自定义后面板保持打开", async ({ webPage }) => {
        const page = webPage;
        await page.goto("/#agent");
        await expect(page.locator("[data-panel-titlebar=Agent]")).toBeVisible();

        // 原生手势：打开下拉 → 点自定义选项（含选项点击的第二次 click）。
        await page.getByLabel("时间范围").selectOption("custom");
        await expect(page.getByRole("button", { name: "应用" })).toBeVisible();
        await expect(page.getByLabel("时间范围")).toHaveValue("custom");
    });

    test("AC-005: 非法区间应用报错且面板不关闭", async ({ webPage }) => {
        const page = webPage;
        await page.goto("/#agent");
        await expect(page.locator("[data-panel-titlebar=Agent]")).toBeVisible();

        await page.getByLabel("时间范围").selectOption("custom");
        await expect(page.getByRole("button", { name: "应用" })).toBeVisible();

        const inputs = page.locator('input[type="datetime-local"]');
        await inputs.nth(0).fill("2026-06-02T08:00");
        await inputs.nth(1).fill("2026-06-01T08:00");
        await page.getByRole("button", { name: "应用" }).click();

        await expect(page.getByText("结束时间必须晚于开始时间")).toBeVisible();
        await expect(page.getByRole("button", { name: "应用" })).toBeVisible();
    });

    test("AC-004: 合法区间应用后保持自定义", async ({ webPage }) => {
        const page = webPage;
        await page.goto("/#agent");
        await expect(page.locator("[data-panel-titlebar=Agent]")).toBeVisible();

        await page.getByLabel("时间范围").selectOption("custom");
        await expect(page.getByRole("button", { name: "应用" })).toBeVisible();

        const inputs = page.locator('input[type="datetime-local"]');
        await inputs.nth(0).fill("2026-06-01T08:00");
        await inputs.nth(1).fill("2026-06-03T08:00");
        await page.getByRole("button", { name: "应用" }).click();

        // 面板关闭且下拉保持自定义（查询已按新区重发，不断言具体数据）。
        await expect(page.getByRole("button", { name: "应用" })).toHaveCount(0);
        await expect(page.getByLabel("时间范围")).toHaveValue("custom");
    });
});
