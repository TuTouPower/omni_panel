import { _electron as electron, test, expect } from "@playwright/test";
import { resolve, join } from "node:path";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const ROOT = process.cwd();

const EXE_BY_PLATFORM: Record<string, string> = {
    win32: resolve(ROOT, "out/OmniUsage-win32-x64/OmniUsage.exe"),
    darwin: resolve(ROOT, "out/OmniUsage-darwin-arm64/OmniUsage.app/Contents/MacOS/OmniUsage"),
    linux: resolve(ROOT, "out/OmniUsage-linux-x64/OmniUsage"),
};
const PACKAGED_EXE = EXE_BY_PLATFORM[process.platform];

const exeExists = PACKAGED_EXE !== undefined && existsSync(PACKAGED_EXE);

const skipIfNoExe = {
    skip: !exeExists,
    reason: exeExists ? "" : `packaged binary not found at ${PACKAGED_EXE ?? "unknown platform"}`,
};

// Isolated userData per test run — avoids pollution from other runs
const smokeUserData = mkdtempSync(join(tmpdir(), "omniusage-smoke-"));

async function launchPackagedApp() {
    if (!PACKAGED_EXE) throw new Error("PACKAGED_EXE is undefined");
    const app = await electron.launch({
        executablePath: PACKAGED_EXE,
        args: [`--user-data-dir=${smokeUserData}`],
        env: {
            ...process.env,
            E2E: "1",
        },
    });

    // Log stdout/stderr for debugging
    app.process().stdout?.on("data", (data: Buffer) => {
        console.log("[packaged stdout]", data.toString());
    });
    app.process().stderr?.on("data", (data: Buffer) => {
        console.log("[packaged stderr]", data.toString());
    });

    return app;
}

test.describe("packaged binary smoke", () => {
    test("packaged app launches without white screen", async () => {
        test.skip(skipIfNoExe.skip, skipIfNoExe.reason);

        const app = await launchPackagedApp();
        try {
            const page = await app.firstWindow();

            // Collect page errors (JS runtime exceptions)
            const pageErrors: Error[] = [];
            page.on("pageerror", (err) => pageErrors.push(err));

            await page.waitForLoadState("domcontentloaded");

            // Wait for identifying text — the app title "OmniUsage" appears in the popup
            await expect(page.getByText("OmniUsage")).toBeVisible({
                timeout: 15_000,
            });

            // No JS errors should have fired
            expect(pageErrors).toEqual([]);
        } finally {
            await app.close();
        }
    });

    test("bundled plugins are discovered", async () => {
        test.skip(skipIfNoExe.skip, skipIfNoExe.reason);

        const app = await launchPackagedApp();
        try {
            const page = await app.firstWindow();
            await page.waitForLoadState("domcontentloaded");

            // Plugin cards use class "card" with inner ".card-name"
            // Wait for at least one card-name element to appear
            const cardNames = page.locator(".card-name");
            await expect(cardNames.first()).toBeVisible({ timeout: 15_000 });
        } finally {
            await app.close();
        }
    });
});
