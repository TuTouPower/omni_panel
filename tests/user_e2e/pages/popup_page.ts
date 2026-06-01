import type { Page } from "@playwright/test";

export class PopupPage {
    private live;

    constructor(page: Page) {
        this.live = page.locator('[data-popup="live"]');
    }

    async waitReady() {
        await this.live.locator(".app-title").waitFor({ timeout: 10_000 });
    }

    async getTitle() {
        return this.live.locator(".app-title").first().textContent();
    }

    async clickRefresh() {
        await this.live.getByTitle("刷新全部").click();
    }

    async clickSettings() {
        await this.live.getByRole("button", { name: "设置" }).click();
    }

    errorBanner() {
        return this.live.locator(".net-banner");
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
