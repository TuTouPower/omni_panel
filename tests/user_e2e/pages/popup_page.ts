import type { Page } from "@playwright/test";

export class PopupPage {
    constructor(private page: Page) {}

    async waitReady() {
        await this.page.waitForSelector(".app-title", { timeout: 10_000 });
    }

    async getTitle() {
        return this.page.locator(".app-title").first().textContent();
    }

    async clickRefresh() {
        await this.page.getByTitle("刷新全部").click();
    }

    async clickSettings() {
        await this.page.getByRole("button", { name: "设置" }).click();
    }

    errorBanner() {
        return this.page.locator(".net-banner");
    }

    async hasError() {
        return await this.errorBanner()
            .isVisible()
            .catch(() => false);
    }

    async hasPythonWarning() {
        return this.page
            .getByText("未检测到 Python")
            .isVisible()
            .catch(() => false);
    }
}
