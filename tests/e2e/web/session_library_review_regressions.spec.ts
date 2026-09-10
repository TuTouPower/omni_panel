import { expect, test } from "../fixtures/test_web";

/** PR #7: exercise real browser layout rather than asserting Tailwind class names. */
test("会话库按内容宽度排布，窄屏不挤成两列，超宽最多五列", async ({ webPage: page }) => {
    await page.goto("/#session");
    await page.getByRole("button", { name: "会话库", exact: true }).click();
    const grid = page.getByTestId("library-grid");
    await expect(grid).toBeVisible();
    for (const [width, columns] of [
        [650, 1],
        [800, 1],
        [1100, 2],
        [1280, 3],
        [2400, 5],
    ] as const) {
        await page.setViewportSize({ width, height: 900 });
        await expect
            .poll(() =>
                grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length),
            )
            .toBe(columns);
        const sizes = await grid.evaluate((el) => ({
            client: el.clientWidth,
            scroll: el.scrollWidth,
            tracks: getComputedStyle(el).gridTemplateColumns.split(" ").map(parseFloat),
        }));
        expect(sizes.scroll).toBeLessThanOrEqual(sizes.client);
        expect(Math.min(...sizes.tracks)).toBeGreaterThanOrEqual(280);
    }
});

// 替代旧 session_panel 中已失效的下拉排序/页头统计场景；保留原业务断言。
test("新版侧边栏搜索/筛选/排序/预览/并排打开闭环", async ({ webPage }) => {
    const page = webPage;
    await page.goto("/#session");
    await page.getByRole("button", { name: "会话库", exact: true }).click();
    await expect(page.locator('[data-testid="library-card"]').first()).toBeVisible();
    // 统计行。
    await expect(page.getByTestId("library-count")).toHaveText("9 / 9 条会话");
    // 搜索：目录关键词过滤。
    await page.getByPlaceholder("标题 / 消息内容 / 会话 ID").fill("auth");
    await expect(page.locator('[data-testid="library-card"]')).toHaveCount(1);
    await expect(page.getByText("登录页 bug 修复")).toBeVisible();
    // 清空搜索。
    await page.getByPlaceholder("标题 / 消息内容 / 会话 ID").fill("");
    await expect(page.locator('[data-testid="library-card"]')).toHaveCount(9);
    // agent 芯片过滤：Claude。
    await page.getByRole("button", { name: /^Claude/ }).click();
    await expect(page.locator('[data-testid="library-card"]')).toHaveCount(3);
    await page.getByRole("button", { name: /^Claude/ }).click();
    await expect(page.locator('[data-testid="library-card"]')).toHaveCount(9);
    // 排序：calls → 首卡为轮次最多会话（s1 calls=12 最大）。
    await page.getByRole("button", { name: "按轮次排序", exact: true }).click();
    await expect(page.locator('[data-testid="library-card-title"]').first()).toHaveText(
        "登录页 bug 修复",
    );
    // 预览抽屉：前 5 条消息可见。
    const card = page.locator('[data-testid="library-card"]').first();
    await card.hover();
    await card.getByRole("button", { name: "预览" }).first().click();
    await expect(page.locator('[data-testid="preview-message"]').first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-testid="preview-panel"]')).toHaveCount(0);
    // 并排打开 2 个会话 → 工作台 2 槽。
    await page.getByRole("button", { name: "会话 s1" }).click();
    await page.getByRole("button", { name: "会话 s2" }).click();
    await page.getByRole("button", { name: /并排打开/ }).click();
    await expect(page.locator('[data-testid="session-cell"]')).toHaveCount(2);
    await expect(page.locator('[data-testid="conversation-message-row"]').first()).toBeVisible();
});

test("统计接口失败时仍保留会话卡片，明确显示总量未知", async ({ webPage: page }) => {
    await page.route("**/v1/sessionStats", async (route) => {
        await route.fulfill({ status: 500, json: { error: "statistics unavailable" } });
    });
    await page.goto("/#session");
    await page.getByRole("button", { name: "会话库", exact: true }).click();
    await expect(page.getByTestId("library-count")).toHaveText("9 / 总量未知 条会话");
    await expect(page.getByTestId("library-card")).toHaveCount(9);
});
