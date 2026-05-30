import type { ElectronApplication, Page } from "@playwright/test";
import { launchApp, closeApp, type LaunchedApp } from "./electron_app";

export interface AppFixtureOptions {
    /** Called before Electron launches — seed plugins, config, etc. Only called on first start. */
    setupPlugins?: (userDataDir: string) => void;
}

export class AppFixture {
    private launched: LaunchedApp | null = null;
    private options: AppFixtureOptions = {};
    private seeded = false;
    private savedUserDataDir: string | null = null;

    get app(): ElectronApplication {
        if (!this.launched) throw new Error("App not started");
        return this.launched.app;
    }

    configure(options: AppFixtureOptions): void {
        this.options = options;
    }

    async start(): Promise<ElectronApplication> {
        // Only call setupPlugins on the first start to avoid re-creating tmp dirs.
        // Subsequent starts (e.g. restart tests) reuse the same userData dir.
        const launchOptions =
            !this.seeded && this.options.setupPlugins
                ? { onReady: this.options.setupPlugins }
                : this.savedUserDataDir
                  ? { userDataDir: this.savedUserDataDir }
                  : undefined;

        this.launched = await launchApp(launchOptions);
        if (!this.seeded) {
            this.savedUserDataDir = this.launched.userDataDir;
            this.seeded = true;
        }
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
