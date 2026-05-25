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
}
