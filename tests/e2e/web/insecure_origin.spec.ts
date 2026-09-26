import { test, expect } from "@playwright/test";

const E2E_WEB_PORT = process.env["E2E_WEB_PORT"] ?? "5274";

test.describe("非安全上下文（非 loopback HTTP origin）web 启动 (t527 AC-005)", () => {
    test("经 omni-insecure.test 加载时 isSecureContext 为 false，#root 非空且无 pageerror", async ({
        page,
    }) => {
        const pageerrors: Error[] = [];
        page.on("pageerror", (err) => {
            pageerrors.push(err);
        });

        const target_url = `http://omni-insecure.test:${E2E_WEB_PORT}/#usage`;
        await page.goto(target_url);

        // 验证非安全上下文环境
        const is_secure = await page.evaluate(() => window.isSecureContext);
        expect(is_secure).toBe(false);

        // 验证 Secure Context 专属 API 不可用
        const has_random_uuid = await page.evaluate(() => typeof crypto.randomUUID === "function");
        expect(has_random_uuid).toBe(false);

        // 验证 web bridge 已成功安装
        const is_web = await page.evaluate(
            () => document.documentElement.getAttribute("data-web") === "1",
        );
        expect(is_web).toBe(true);

        // 验证 #root 非空并正常渲染 UI
        const root = page.locator("#root");
        await expect(root).not.toBeEmpty();
        await expect(
            root.locator('[data-popup="live"]').locator('[data-testid="popup-scroll"]'),
        ).toBeVisible();

        // 验证无任何 pageerror（特别是 crypto.randomUUID is not a function）
        expect(pageerrors).toHaveLength(0);
    });
});
