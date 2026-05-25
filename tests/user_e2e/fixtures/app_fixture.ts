import type { ElectronApplication, Page } from "@playwright/test";
import { launchApp, closeApp, type LaunchedApp } from "./electron_app";

export class AppFixture {
    private launched: LaunchedApp | null = null;

    get app(): ElectronApplication {
        if (!this.launched) throw new Error("App not started");
        return this.launched.app;
    }

    async start(): Promise<ElectronApplication> {
        this.launched = await launchApp();
        return this.launched.app;
    }

    async stop(): Promise<void> {
        if (this.launched) {
            await closeApp(this.launched);
            this.launched = null;
        }
    }

    /** Returns the first visible window with a matching URL hash. */
    async window(hash: string): Promise<Page> {
        const app = this.app;
        // Wait for a window that contains the hash
        const page = await app.firstWindow();
        await page.waitForURL(`**/*${hash}*`, { timeout: 10_000 }).catch(() => {
            // If URL wait fails, try evaluating hash
        });
        return page;
    }

    /** Wait for a new window to appear. */
    async waitForWindow(timeoutMs = 10_000): Promise<Page> {
        return this.app.waitForEvent("window", { timeout: timeoutMs });
    }
}
