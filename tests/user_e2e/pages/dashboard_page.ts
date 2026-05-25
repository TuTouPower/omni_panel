import type { Page } from "@playwright/test";

export class DashboardPage {
    constructor(private page: Page) {}

    async waitReady() {
        await this.page.waitForSelector("text=OmniUsage Dashboard", { timeout: 10_000 });
    }

    async getTitle() {
        return this.page.locator("h1").first().textContent();
    }

    async clickRefresh() {
        await this.page.getByLabel("刷新").click();
    }

    async clickSettings() {
        await this.page.getByText("设置").click();
    }

    async hasPluginCard(name: string) {
        return this.page.locator(`text=${name}`).first().isVisible();
    }

    async hasPythonWarning() {
        return this.page
            .getByText("未检测到 Python")
            .isVisible()
            .catch(() => false);
    }
}
