import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/test_web";

/**
 * Web e2e：会话面板（SessionShell 单壳双页签）关键路径（t228 AC1）。
 * 覆盖：双页签切换状态保留、打开会话装入槽位与消息渲染、槽满 toast、
 * 摘选三格式复制、会话库搜索/筛选/排序/预览/并排打开闭环。
 * 数据来自 synthetic fixture（tests/e2e/fixtures/synthetic.json）。
 */

async function open_history(page: Page): Promise<void> {
    await page.goto("/#history");
    await page.locator(".session-shell").first().waitFor({ state: "visible" });
}

/** 从会话库把指定标题的会话单独打开，等待工作台出现槽位。 */
async function open_session_from_library(page: Page, title: string): Promise<void> {
    const card = page
        .locator(".lib-card")
        .filter({ has: page.getByText(title, { exact: false }) })
        .first();
    await card.hover();
    await card.getByRole("button", { name: "单独打开" }).first().click();
    await page.getByRole("button", { name: "工作台", exact: true }).click();
}

test.describe("session panel (web, t228)", () => {
    test("双页签切换后工作台槽位与已选状态保留", async ({ webPage }) => {
        const page = webPage;
        await open_history(page);
        // 从会话库打开一个会话（消息数据来自 fixture）。
        await page.getByRole("button", { name: "会话库", exact: true }).click();
        await open_session_from_library(page, "登录页 bug 修复");
        // 工作台出现槽位与消息。
        await expect(page.locator(".slot-pane").first()).toBeVisible();
        await expect(page.locator(".pane-msg-row").first()).toBeVisible();
        const loc_key = await page.locator(".slot-pane").first().getAttribute("data-loc-key");
        // 勾选第一条消息产生已选状态。
        await page.locator(".pane-msg-check").first().click();
        await expect(page.locator(".selection-tray.expanded")).toBeVisible();
        await expect(page.locator(".pane-msg-row.selected").first()).toBeVisible();
        // 切到会话库再切回，槽位与已选状态保留。
        await page.getByRole("button", { name: "会话库", exact: true }).click();
        await expect(page.locator(".session-library").first()).toBeVisible();
        await page.getByRole("button", { name: "工作台", exact: true }).click();
        await expect(page.locator(".slot-pane").first()).toBeVisible();
        expect(await page.locator(".slot-pane").first().getAttribute("data-loc-key")).toBe(loc_key);
        expect(loc_key).toBeTruthy();
        await expect(page.locator(".pane-msg-row.selected").first()).toBeVisible();
        await expect(page.locator(".selection-tray.expanded")).toBeVisible();
    });

    test("会话库打开会话装入槽位并渲染消息", async ({ webPage }) => {
        const page = webPage;
        await open_history(page);
        await page.getByRole("button", { name: "会话库", exact: true }).click();
        await open_session_from_library(page, "登录页 bug 修复");
        // 消息行渲染（s1 的 fixture 消息）。
        await expect(page.locator(".pane-msg-row").first()).toBeVisible();
        await expect(page.locator(".pane-msg-row").first()).toContainText(/用户|Agent/);
    });

    test("工作台槽位满时再打开显示 toast 拒绝", async ({ webPage }) => {
        const page = webPage;
        await open_history(page);
        await page.getByRole("button", { name: "会话库", exact: true }).click();
        await expect(page.locator(".lib-card").first()).toBeVisible();
        // 勾选全部 8 个会话。
        for (const id of ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"]) {
            await page.getByRole("button", { name: `会话 ${id}` }).click();
        }
        await expect(page.getByText("8/8")).toBeVisible();
        // 并排打开 → 工作台 8 槽满。
        await page.getByRole("button", { name: /并排打开/ }).click();
        await expect(page.locator(".slot-pane")).toHaveCount(8);
        // 再打开第 9 个（s9，不在已勾选的 8 个里）→ toast 槽位已满。
        await page.getByRole("button", { name: "会话库", exact: true }).click();
        const card = page.locator(".lib-card").filter({
            has: page.getByText("部署发布", { exact: false }),
        });
        await card.hover();
        await card.getByRole("button", { name: "单独打开" }).first().click();
        await expect(page.locator(".workspace-toast")).toContainText("槽位已满");
    });

    test("摘选后三种格式复制内容正确", async ({ webPage }) => {
        const page = webPage;
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        await open_history(page);
        await page.getByRole("button", { name: "会话库", exact: true }).click();
        await open_session_from_library(page, "登录页 bug 修复");
        // 勾选第一条消息。
        await page.locator(".pane-msg-check").first().click();
        await expect(page.locator(".selection-tray.expanded")).toBeVisible();
        // 复制到剪贴板（markdown 格式）。
        await page.getByRole("button", { name: "复制" }).first().click();
        const md = await page.evaluate(() => navigator.clipboard.readText());
        expect(md).toContain("## 会话：");
        expect(md).toContain("登录页 404");
        // 纯文本格式。
        await page.getByLabel("复制格式").selectOption("plain");
        await page.getByRole("button", { name: "复制" }).first().click();
        const plain = await page.evaluate(() => navigator.clipboard.readText());
        expect(plain).not.toContain("## 会话：");
        expect(plain.length).toBeGreaterThan(0);
        // 按会话分组格式。
        await page.getByLabel("复制格式").selectOption("grouped");
        await page.getByRole("button", { name: "复制" }).first().click();
        const grouped = await page.evaluate(() => navigator.clipboard.readText());
        expect(grouped).toContain("# ");
    });

    test("会话库搜索/筛选/排序/预览/并排打开闭环", async ({ webPage }) => {
        const page = webPage;
        await open_history(page);
        await page.getByRole("button", { name: "会话库", exact: true }).click();
        await expect(page.locator(".lib-card").first()).toBeVisible();
        // 统计行。
        await expect(page.getByText(/9 个会话/)).toBeVisible();
        // 搜索：目录关键词过滤。
        await page.getByPlaceholder(/搜索/).fill("auth");
        await expect(page.locator(".lib-card")).toHaveCount(1);
        await expect(page.getByText("登录页 bug 修复")).toBeVisible();
        // 清空搜索。
        await page.getByPlaceholder(/搜索/).fill("");
        await expect(page.locator(".lib-card")).toHaveCount(9);
        // agent 芯片过滤：Claude。
        await page.getByRole("button", { name: /^Claude/ }).click();
        await expect(page.locator(".lib-card")).toHaveCount(3);
        await page.getByRole("button", { name: /^Claude/ }).click();
        await expect(page.locator(".lib-card")).toHaveCount(9);
        // 排序：calls → 首卡为轮次最多会话（s1 calls=12 最大）。
        await page.getByLabel("排序方式").selectOption("calls");
        await expect(page.locator(".lib-card-title").first()).toHaveText("登录页 bug 修复");
        // 预览抽屉：前 5 条消息可见。
        const card = page.locator(".lib-card").first();
        await card.hover();
        await card.getByRole("button", { name: "预览" }).first().click();
        await expect(page.locator(".lib-preview-msg").first()).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.locator(".lib-preview")).toHaveCount(0);
        // 并排打开 2 个会话 → 工作台 2 槽。
        await page.getByRole("button", { name: "会话 s1" }).click();
        await page.getByRole("button", { name: "会话 s2" }).click();
        await page.getByRole("button", { name: /并排打开/ }).click();
        await expect(page.locator(".slot-pane")).toHaveCount(2);
        await expect(page.locator(".pane-msg-row").first()).toBeVisible();
    });
});
