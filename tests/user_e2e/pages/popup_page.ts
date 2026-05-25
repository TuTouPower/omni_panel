import type { Page } from "@playwright/test";

export class PopupPage {
    constructor(private page: Page) {}

    async waitReady() {
        await this.page.waitForSelector("text=OmniUsage", { timeout: 10_000 });
    }

    async getTitle() {
        return this.page.locator("h1").first().textContent();
    }

    async clickRefresh() {
        await this.page.getByLabel("刷新").click();
    }

    async clickSettings() {
        await this.page.getByRole("button", { name: "设置" }).click();
    }

    pluginCard(name: string) {
        return this.page.locator(`text=${name}`).first();
    }

    async hasPluginCard(name: string) {
        return await this.pluginCard(name).isVisible();
    }

    errorBanner() {
        return this.page.locator('[class*="ErrorBanner"]');
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
