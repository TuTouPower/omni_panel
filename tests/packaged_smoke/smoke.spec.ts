import { chromium, test, expect, type Browser, type Page } from "@playwright/test";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
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

interface PackagedAppHandle {
    browser: Browser;
    page: Page;
    process: ChildProcessByStdio<null, Readable, Readable>;
}

function wait(ms: number): Promise<void> {
    return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

async function connectToDebugPort(port: number, logs: string[]): Promise<Browser> {
    const deadline = Date.now() + 20_000;
    let lastError: unknown;
    while (Date.now() < deadline) {
        try {
            return await chromium.connectOverCDP(`http://127.0.0.1:${String(port)}`);
        } catch (error) {
            lastError = error;
            await wait(250);
        }
    }
    throw new Error(
        `Timed out connecting to packaged app CDP: ${String(lastError)}\n${logs.join("")}`,
    );
}

async function firstRendererPage(browser: Browser): Promise<Page> {
    const context = browser.contexts()[0];
    if (!context) throw new Error("Packaged app did not expose a browser context");

    const existing = context.pages().find((p) => p.url().includes("index.html"));
    if (existing) return existing;

    return context.waitForEvent("page", { timeout: 15_000 });
}

async function launchPackagedApp(port: number): Promise<PackagedAppHandle> {
    if (!PACKAGED_EXE) throw new Error("PACKAGED_EXE is undefined");

    const userData = mkdtempSync(join(tmpdir(), "omniusage-smoke-"));
    const logs: string[] = [];
    const child = spawn(
        PACKAGED_EXE,
        [`--user-data-dir=${userData}`, `--remote-debugging-port=${String(port)}`],
        {
            env: {
                ...process.env,
                E2E: "1",
            },
            stdio: ["ignore", "pipe", "pipe"],
        },
    );

    child.stdout.on("data", (data: Buffer) => {
        const text = data.toString();
        logs.push(text);
        console.log("[packaged stdout]", text);
    });
    child.stderr.on("data", (data: Buffer) => {
        const text = data.toString();
        logs.push(text);
        console.log("[packaged stderr]", text);
    });

    const browser = await connectToDebugPort(port, logs);
    const page = await firstRendererPage(browser);
    await page.waitForLoadState("domcontentloaded", { timeout: 15_000 });

    return { browser, page, process: child };
}

async function closePackagedApp(handle: PackagedAppHandle): Promise<void> {
    await handle.browser.close().catch(() => undefined);
    if (!handle.process.killed) {
        handle.process.kill();
    }
}

test.describe("packaged binary smoke", () => {
    test("packaged app launches without white screen", async ({}, testInfo) => {
        test.skip(skipIfNoExe.skip, skipIfNoExe.reason);

        const app = await launchPackagedApp(47000 + testInfo.workerIndex * 10);
        try {
            const pageErrors: Error[] = [];
            app.page.on("pageerror", (err) => pageErrors.push(err));

            await expect(app.page.locator(".app-title").first()).toContainText("OmniUsage", {
                timeout: 15_000,
            });
            expect(pageErrors).toEqual([]);
        } finally {
            await closePackagedApp(app);
        }
    });

    test("provider overview is available without CPA provider tab", async ({}, testInfo) => {
        test.skip(skipIfNoExe.skip, skipIfNoExe.reason);

        const app = await launchPackagedApp(47001 + testInfo.workerIndex * 10);
        try {
            const providerNav = app.page.locator(".tabs-wrap");
            await expect(providerNav.getByRole("button", { name: /总览/ })).toBeVisible({
                timeout: 15_000,
            });
            await expect(providerNav.getByRole("button", { name: /^Claude$/ })).toBeVisible();
            await expect(providerNav.getByRole("button", { name: /^DeepSeek$/ })).toBeVisible();
            await expect(providerNav.getByRole("button", { name: /^CPA$/ })).toHaveCount(0);
        } finally {
            await closePackagedApp(app);
        }
    });

    test("popup root fills the packaged window height", async ({}, testInfo) => {
        test.skip(skipIfNoExe.skip, skipIfNoExe.reason);

        const app = await launchPackagedApp(47002 + testInfo.workerIndex * 10);
        try {
            await expect(app.page.locator(".app-title").first()).toContainText("OmniUsage", {
                timeout: 15_000,
            });

            const layout = await app.page.evaluate(() => {
                const root = document.querySelector(".window");
                const scroll = document.querySelector(".scroll");
                const statusbar = document.querySelector(".statusbar");
                if (!(root instanceof HTMLElement)) throw new Error("Popup root not found");
                if (!(scroll instanceof HTMLElement))
                    throw new Error("Popup scroll area not found");
                if (!(statusbar instanceof HTMLElement))
                    throw new Error("Popup statusbar not found");
                const root_rect = root.getBoundingClientRect();
                const scroll_rect = scroll.getBoundingClientRect();
                const statusbar_rect = statusbar.getBoundingClientRect();
                return {
                    root_height: root_rect.height,
                    scroll_bottom: scroll_rect.bottom,
                    statusbar_bottom: statusbar_rect.bottom,
                    statusbar_top: statusbar_rect.top,
                    viewport_height: window.innerHeight,
                };
            });

            expect(Math.abs(layout.root_height - layout.viewport_height)).toBeLessThanOrEqual(1);
            expect(Math.abs(layout.statusbar_bottom - layout.viewport_height)).toBeLessThanOrEqual(
                1,
            );
            expect(layout.scroll_bottom).toBeLessThanOrEqual(layout.statusbar_top + 1);
        } finally {
            await closePackagedApp(app);
        }
    });
});
