import type { Page } from "@playwright/test";

export class SettingsPage {
    constructor(private page: Page) {}

    async waitReady() {
        await this.page.waitForSelector('[data-testid="settings-sidebar"]', { timeout: 10_000 });
    }

    async hasPlugin(name: string) {
        return this.page.locator(`text=${name}`).first().isVisible();
    }
}
