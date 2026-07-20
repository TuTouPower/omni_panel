/* eslint-disable react-hooks/rules-of-hooks -- Playwright fixtures, not React hooks */
import { test as base, expect as baseExpect, type Page } from "@playwright/test";

/**
 * Web e2e fixture：Playwright chromium 驱动 out/web SPA，后端由 vite preview 的
 * mock_api_plugin 回放录的真实响应。无 Electron、无桌面 app。
 *
 * baseURL 由 playwright config 的 web project `use.baseURL` 提供。
 * 每个测试自带独立 context（Playwright 默认），隔离 localStorage/cookie。
 */
export const test = base.extend<{ webPage: Page }>({
    webPage: async ({ page }, use) => {
        await page.goto("/#usage");
        await use(page);
    },
});

export const expect = baseExpect;
