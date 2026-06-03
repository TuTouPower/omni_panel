import type { ElectronApplication, Page } from "@playwright/test";

export class SettingsPage {
    constructor(public page: Page) {}

    async waitReady() {
        await this.page.waitForSelector('[data-testid="settings-sidebar"]', { timeout: 10_000 });
    }

    async hasPlugin(name: string) {
        return this.page.locator(`text=${name}`).first().isVisible();
    }

    /** Open settings window via IPC from any existing page. */
    static async openViaIpc(app: ElectronApplication, fromPage: Page): Promise<SettingsPage> {
        await fromPage.evaluate(() => {
            window.usageboard.settings.open();
        });
        const settingsWindow = await app.waitForEvent("window", { timeout: 10_000 });
        await settingsWindow.waitForLoadState("domcontentloaded");
        const page = new SettingsPage(settingsWindow);
        await page.waitReady();
        return page;
    }
}
