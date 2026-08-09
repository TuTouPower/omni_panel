/* eslint-disable react-hooks/rules-of-hooks -- Playwright fixtures, not React hooks */
import { test as base, expect as baseExpect, type Page } from "@playwright/test";

/**
 * Web e2e fixture：Playwright chromium 驱动 out/web SPA，后端由 vite preview 的
 * mock_api_plugin 回放录的真实响应。无 Electron、无桌面 app。
 *
 * baseURL 由 playwright config 的 web project `use.baseURL` 提供。
 * 每个测试自带独立 context（Playwright 默认），隔离 localStorage/cookie。
 *
 * t274: mock 的 /v1/config 是进程内可变状态（跨用例共享同一 preview server）。
 * popup 的偏好写回（activeUsageTab/expandedProviders…）会经 config.save 持久化，
 * 污染后续 spec 初始状态（如上次页签被恢复、overview 卡片不渲染）。因此每用例
 * 开跑前 POST /v1/config/reset 复位到录制 fixture，保证用例间初始 config 一致。
 */
export const test = base.extend<{ webPage: Page }>({
    webPage: async ({ page }, use) => {
        await page.request.post("/v1/config/reset");
        await page.goto("/#usage");
        await use(page);
    },
});

export const expect = baseExpect;
