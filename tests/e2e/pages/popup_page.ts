import type { Page } from "@playwright/test";

export class PopupPage {
    private live;

    constructor(page: Page) {
        this.live = page.locator('[data-popup="live"]');
    }

    async waitReady() {
        await this.live.locator('[data-testid="app-title"]').waitFor({ timeout: 10_000 });
    }

    async getTitle() {
        return this.live.locator('[data-testid="app-title"]').first().textContent();
    }

    async clickRefresh() {
        await this.live.getByTitle("刷新全部").click();
    }

    async clickSettings() {
        // t311：web 下设置入口为原生链接、桌面为按钮；title 属性两态一致，据此跨态定位。
        await this.live.getByTitle("设置").click();
    }

    refresh_all_button() {
        return this.live.getByTitle("刷新全部");
    }

    provider_refresh_button(label: string) {
        return this.live.getByRole("button", { name: `刷新 ${label}` });
    }

    errorBanner() {
        // t270: NetBanner 迁移到语义类，定位其唯一文案（网络连接异常）。
        return this.live.getByText("网络连接异常，部分数据可能不是最新");
    }

    async hasError() {
        return await this.errorBanner()
            .isVisible()
            .catch(() => false);
    }

    async hasPythonWarning() {
        return this.live
            .getByText("未检测到 Python")
            .isVisible()
            .catch(() => false);
    }

    /** Locator scoped to the live popup tree (excludes offscreen mirrors). */
    root() {
        return this.live;
    }
}
