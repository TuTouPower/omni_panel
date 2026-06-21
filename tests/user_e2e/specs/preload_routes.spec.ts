import { test, expect } from "../fixtures/test";
import type { Page } from "@playwright/test";

/**
 * Phase 31.3: Verify preload route-based API restrictions.
 *
 * popup / tray → config_readonly (only get)
 * settings      → config_full (get + save + saveSecrets + duplicate)
 */

async function getConfigApiKeys(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        const c = (window as unknown as Record<string, unknown>)["usageboard"] as
            | Record<string, unknown>
            | undefined;
        const cfg = c?.["config"] as Record<string, unknown> | undefined;
        return cfg ? Object.keys(cfg).sort() : [];
    });
}

test.describe("preload route API restriction", () => {
    test("popup window has config_readonly (only get)", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        // Open the popup (default route)
        await page.waitForLoadState("domcontentloaded");
        const keys = await getConfigApiKeys(page);
        // config_readonly: only get
        expect(keys).toEqual(["get"]);
    });
});
