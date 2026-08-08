import { chromium, test, expect, type Browser, type Page } from "@playwright/test";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { resolve, join } from "node:path";
import { existsSync, mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { scrubber } from "../../../src/shared/lib/logger";

const ROOT = process.cwd();

// CDP targets loopback only; the test host's global HTTP proxy would hijack
// connectOverCDP's /json/version probe and answer 400. Clear proxy env vars
// for this test process (the packaged app still uses its own proxy detection).
for (const key of [
    "HTTP_PROXY",
    "http_proxy",
    "HTTPS_PROXY",
    "https_proxy",
    "ALL_PROXY",
    "all_proxy",
]) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete process.env[key];
}

const EXE_BY_PLATFORM: Record<string, string> = {
    win32: resolve(ROOT, "artifacts/win-unpacked/OmniPanel.exe"),
    darwin: resolve(ROOT, "artifacts/mac/OmniPanel.app/Contents/MacOS/OmniPanel"),
    linux: resolve(ROOT, "artifacts/linux-unpacked/omni-panel"),
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

function scrub_log_text(text: string): string {
    return scrubber
        .scrub_text(text)
        .replace(/(Cookie|SESSION_COOKIE|API_KEY|token|password)=([^\s;&]+)/gi, "$1=***");
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
        `Timed out connecting to packaged app CDP: ${scrub_log_text(String(lastError))}\n${logs.join("")}`,
    );
}

async function firstRendererPage(browser: Browser): Promise<Page> {
    const context = browser.contexts()[0];
    if (!context) throw new Error("Packaged app did not expose a browser context");

    const existing = context.pages().find((p) => p.url().includes("index.html"));
    if (existing) return existing;

    return context.waitForEvent("page", { timeout: 15_000 });
}

async function read_debug_port(user_data: string): Promise<number> {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
        try {
            const content = await readFile(join(user_data, "DevToolsActivePort"), "utf8");
            const port = Number.parseInt(content.split("\n")[0] ?? "", 10);
            if (Number.isInteger(port) && port > 0) return port;
        } catch {
            // Chrome creates DevToolsActivePort only after the CDP listener is ready.
        }
        await wait(250);
    }
    throw new Error("Timed out waiting for packaged app dynamic CDP port");
}

async function launchPackagedApp(): Promise<PackagedAppHandle> {
    if (!PACKAGED_EXE) throw new Error("PACKAGED_EXE is undefined");

    const userData = mkdtempSync(join(tmpdir(), "omnipanel-smoke-"));
    const logs: string[] = [];
    const child = spawn(
        PACKAGED_EXE,
        [`--user-data-dir=${userData}`, "--remote-debugging-port=0"],
        {
            env: {
                ...process.env,
                E2E: "1",
            },
            stdio: ["ignore", "pipe", "pipe"],
        },
    );

    child.stdout.on("data", (data: Buffer) => {
        logs.push(scrub_log_text(data.toString()));
    });
    child.stderr.on("data", (data: Buffer) => {
        logs.push(scrub_log_text(data.toString()));
    });

    const port = await read_debug_port(userData);
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
    test("packaged app launches without white screen", async () => {
        test.skip(skipIfNoExe.skip, skipIfNoExe.reason);

        const app = await launchPackagedApp();
        try {
            const pageErrors: Error[] = [];
            app.page.on("pageerror", (err) => pageErrors.push(err));

            await expect(app.page.locator(".app-title").first()).toContainText("Omni Panel", {
                timeout: 15_000,
            });
            expect(pageErrors).toEqual([]);
        } finally {
            await closePackagedApp(app);
        }
    });

    test("provider overview is available without CPA provider tab", async () => {
        test.skip(skipIfNoExe.skip, skipIfNoExe.reason);

        const app = await launchPackagedApp();
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

    test("agent (token-stats) panel opens and the dashboard query runs in the packaged app (t193 AC6)", async () => {
        test.skip(skipIfNoExe.skip, skipIfNoExe.reason);

        const app = await launchPackagedApp();
        try {
            const pageErrors: Error[] = [];
            app.page.on("pageerror", (err) => pageErrors.push(err));

            // Open the singleton agent window through the same preload entry the
            // panel uses; this forks the isolated query-worker utilityProcess
            // inside the packaged app (asarUnpack + electron-Abi sqlite).
            await app.page.evaluate(() => {
                window.usageboard.tokenStats.open();
            });

            const context = app.browser.contexts()[0];
            if (!context) throw new Error("Packaged app did not expose a browser context");
            const agent_page =
                context.pages().find((p) => p.url().includes("#agent")) ??
                (await Promise.race([
                    context.waitForEvent("page", { timeout: 20_000 }),
                    new Promise<never>((_, reject) =>
                        setTimeout(() => {
                            reject(new Error("agent window did not open"));
                        }, 20_000),
                    ),
                ]));
            await agent_page.waitForLoadState("domcontentloaded", { timeout: 15_000 });

            // The dashboard aggregate renders (KPI cards + session table) once
            // the isolated worker answers; no white screen, no page errors.
            await expect(agent_page.locator(".token-stats").first()).toBeVisible({
                timeout: 20_000,
            });
            await expect(agent_page.locator(".token-stats")).not.toBeEmpty();

            // Prove the dashboard query itself ran through the isolated query
            // worker (asarUnpack entry + electron-Abi sqlite). preload unwraps
            // IpcResult, so getDashboard resolves with the DTO directly and
            // rejects with [QUERY_FAILED] if the worker failed to answer.
            const dashboard_result = await agent_page.evaluate(async () => {
                const end = Date.now();
                const dto = await (
                    window as unknown as {
                        usageboard: {
                            tokenStats: {
                                getDashboard: (q: unknown) => Promise<{
                                    data_version: number;
                                    sessions: { total: number };
                                }>;
                            };
                        };
                    }
                ).usageboard.tokenStats.getDashboard({
                    agent: "all",
                    platform: "all",
                    start: end - 7 * 24 * 3600_000,
                    end,
                    metric: "tokens",
                    xaxis: "time",
                    gran: "day",
                });
                return dto;
            });
            expect(dashboard_result.data_version).toEqual(expect.any(Number));
            expect(typeof dashboard_result.sessions.total).toBe("number");

            expect(pageErrors).toEqual([]);
        } finally {
            await closePackagedApp(app);
        }
    });

    test("popup root fills the packaged window height", async () => {
        test.skip(skipIfNoExe.skip, skipIfNoExe.reason);

        const app = await launchPackagedApp();
        try {
            await expect(app.page.locator(".app-title").first()).toContainText("Omni Panel", {
                timeout: 15_000,
            });

            const layout = await app.page.evaluate(() => {
                const root = document.querySelector(".window");
                const scroll = document.querySelector(".scroll");
                if (!(root instanceof HTMLElement)) throw new Error("Popup root not found");
                if (!(scroll instanceof HTMLElement))
                    throw new Error("Popup scroll area not found");
                const root_rect = root.getBoundingClientRect();
                const scroll_rect = scroll.getBoundingClientRect();
                return {
                    root_height: root_rect.height,
                    scroll_bottom: scroll_rect.bottom,
                    viewport_height: window.innerHeight,
                };
            });

            expect(Math.abs(layout.root_height - layout.viewport_height)).toBeLessThanOrEqual(1);
            expect(layout.scroll_bottom).toBeLessThanOrEqual(layout.root_height + 1);
        } finally {
            await closePackagedApp(app);
        }
    });
});
