import { expect, test } from "@playwright/test";
import { _electron as electron, type ElectronApplication } from "@playwright/test";
import { resolve_electron_binary } from "../fixtures/electron_binary";
import { canonical_config_document } from "../fixtures/config_transfer";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { get as httpGet, request as httpRequest } from "node:http";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = process.cwd();
const MAIN_ENTRY = resolve(ROOT, "out/main/index.js");
const ELECTRON = resolve_electron_binary();

function httpJson(url: string, timeout = 2000): Promise<{ status: number; body: unknown }> {
    return new Promise((resolveResult, reject) => {
        const req = httpGet(url, (r) => {
            let data = "";
            r.on("data", (c: Buffer) => {
                data += c.toString();
            });
            r.on("end", () => {
                let body: unknown = data;
                try {
                    body = JSON.parse(data);
                } catch {
                    // keep raw
                }
                resolveResult({ status: r.statusCode ?? 0, body });
            });
        });
        req.setTimeout(timeout, () => {
            req.destroy(new Error("timeout"));
        });
        req.on("error", reject);
    });
}

/** POST 控制端点（quit/restart 等）。 */
function postJson(url: string, timeout = 2000): Promise<{ status: number }> {
    return new Promise((resolveResult, reject) => {
        const u = new URL(url);
        const req = httpRequest(
            { hostname: u.hostname, port: u.port, path: u.pathname, method: "POST" },
            (r) => {
                r.resume();
                r.on("end", () => {
                    resolveResult({ status: r.statusCode ?? 0 });
                });
            },
        );
        req.setTimeout(timeout, () => {
            req.destroy(new Error("timeout"));
        });
        req.on("error", reject);
        req.end();
    });
}

async function waitHealth(port: number, ms = 15000): Promise<void> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        try {
            const r = await httpJson(`http://localhost:${String(port)}/v1/health`, 1000);
            if (r.status === 200) return;
        } catch {
            // retry
        }
        await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`CLI not healthy on ${String(port)}`);
}

/**
 * 起真实无头实例（serve --foreground，含 --config 导入），返回 app + 面板 URL。
 * SPIKE 2 验证：playwright `_electron.launch` 传 argv 起 serve --foreground，
 * stdout 打印 URL，chromium 可访问。
 */
async function launchCliWithConfig(): Promise<{
    app: ElectronApplication;
    url: string;
    userDataDir: string;
    importDir: string;
}> {
    const port = 18860;
    const userDataDir = mkdtempSync(join(tmpdir(), "omnipanel-cli-flow-"));
    const importDir = mkdtempSync(join(tmpdir(), "omnipanel-cli-flow-import-"));
    const importFile = join(importDir, "import.json");
    // --config 只接受 canonical v2 信封（裸 AppConfiguration 会被判「不支持的导入文件版本」）
    writeFileSync(
        importFile,
        JSON.stringify(
            canonical_config_document({
                schemaVersion: 1,
                language: "zh-Hans",
                plugins: [],
                launchAtLogin: false,
            }),
        ),
    );

    let stdout = "";
    const app = await electron.launch({
        args: [
            MAIN_ENTRY,
            "serve",
            "--foreground",
            "--port",
            String(port),
            "--config",
            importFile,
            `--user-data-dir=${userDataDir}`,
        ],
        executablePath: ELECTRON,
        cwd: ROOT,
    });
    app.process().stdout?.on("data", (d: Buffer) => {
        stdout += d.toString();
    });
    app.process().stderr?.on("data", (d: Buffer) => {
        stdout += d.toString();
    });

    await waitHealth(port);
    // stdout 打印可访问 URL
    const urlMatch = /listening on (http:\/\/[^\s]+)/.exec(stdout);
    if (!urlMatch) {
        throw new Error(`CLI serve did not print URL. stdout=${stdout.slice(0, 300)}`);
    }
    const url = urlMatch[1] ?? "";
    // 实例零窗口
    const winCount = await app.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows().length;
    });
    expect(winCount).toBe(0);
    return { app, url, userDataDir, importDir };
}

async function closeApp(app: ElectronApplication): Promise<void> {
    const proc = app.process();
    await app.close();
    if (proc.exitCode === null && !proc.killed) {
        const timer = setTimeout(() => {
            proc.kill();
        }, 3000);
        await new Promise<void>((resolveExit) => {
            proc.once("exit", () => {
                clearTimeout(timer);
                resolveExit();
            });
            setTimeout(resolveExit, 3500);
        });
    }
}

test.describe("CLI 全栈 e2e（t280 AC3）", () => {
    test("chromium 访问真实无头实例的面板，dashboard 与 config 端点可用", async ({ page }) => {
        const { app, url, userDataDir, importDir } = await launchCliWithConfig();
        try {
            // 面板加载（web SPA 首页）
            const response = await page.goto(url);
            expect(response?.status()).toBeLessThan(500);

            // chromium 侧 headless（本项目 use.headless=true）驱动 web UI
            await page.waitForLoadState("domcontentloaded");
            // 面板 SPA 实际挂载（#root 非空，非仅静态节点）
            await page.waitForSelector("#root > *", { timeout: 10000 });

            // dashboard 端点可用（真实数据链路，非 mock）
            const dash = await httpJson(
                `${url}v1/dashboard?agent=all&platform=all&start=0&end=86400000&metric=tokens&xaxis=time&gran=day`,
            );
            expect(dash.status).toBe(200);

            // 配置读取：/v1/config 返回导入的空配置（language zh-Hans、空 plugins）
            const cfg = await httpJson(`${url}v1/config`);
            expect(cfg.status).toBe(200);
            const cfgBody = cfg.body as {
                config?: { language?: string; plugins?: unknown[] };
            };
            expect(cfgBody.config?.language).toBe("zh-Hans");
            expect(cfgBody.config?.plugins).toEqual([]);
        } finally {
            await closeApp(app);
            rmSync(userDataDir, { recursive: true, force: true });
            rmSync(importDir, { recursive: true, force: true });
        }
    });

    test("实例在测后干净退出（quit 控制）", async () => {
        const { app, url, userDataDir, importDir } = await launchCliWithConfig();
        const port = new URL(url).port;
        try {
            // 经 quit 控制端点关闭
            await postJson(`http://localhost:${port}/v1/control/quit`, 2000);
            // 等实例退出（health 不可达）
            let gone = false;
            const deadline = Date.now() + 10000;
            while (Date.now() < deadline) {
                const after = await httpJson(`http://localhost:${port}/v1/health`, 800).catch(
                    () => ({ status: 0 }),
                );
                if (after.status !== 200) {
                    gone = true;
                    break;
                }
                await new Promise((r) => setTimeout(r, 300));
            }
            expect(gone).toBe(true);
        } finally {
            await closeApp(app).catch(() => undefined);
            rmSync(userDataDir, { recursive: true, force: true });
            rmSync(importDir, { recursive: true, force: true });
        }
    });

    test("真实 LocalAPI schema 错误经 Web bridge 显示可读消息", async ({ page }) => {
        const { app, url, userDataDir, importDir } = await launchCliWithConfig();
        try {
            await page.goto(`${url}#setting`);
            await page.waitForSelector('[data-testid="settings-sidebar"]');
            await page.locator('[data-testid="settings-plugin-nav-data"]').click();
            const import_row = page
                .locator('[data-testid="set-row"]')
                .filter({ hasText: "导入设置" });
            const import_button = import_row.getByRole("button");
            page.once("dialog", (dialog) => {
                void dialog.accept();
            });
            const chooser = page.waitForEvent("filechooser");
            await import_button.click();
            await (
                await chooser
            ).setFiles({
                name: "schema-invalid.json",
                mimeType: "application/json",
                // 信封合法（canonical v2）、内层 config schema 无效 → 触发「配置格式无效」
                // 而非「不支持的导入文件版本」（后者要求裸/旧版本文件）。
                buffer: Buffer.from(
                    JSON.stringify(
                        canonical_config_document({
                            schemaVersion: 1,
                            language: "zh-Hans",
                            plugins: [],
                            launchAtLogin: "wrong",
                        }),
                    ),
                ),
            });

            await expect(import_button).toHaveText("失败");
            await expect(page.getByRole("alert")).toContainText("导入的配置格式无效");
        } finally {
            await closeApp(app);
            rmSync(userDataDir, { recursive: true, force: true });
            rmSync(importDir, { recursive: true, force: true });
        }
    });

    test("真实 LocalAPI 配置 SSE 驱动第二页面主题更新", async ({ page }) => {
        const { app, url, userDataDir, importDir } = await launchCliWithConfig();
        const page_b = await page.context().newPage();
        try {
            await page.goto(`${url}#setting`);
            await page.waitForSelector('[data-testid="settings-sidebar"]');
            await page_b.goto(`${url}#agent`);
            await page_b.waitForSelector('[data-testid="app-title"]');
            await expect
                .poll(() =>
                    page_b.evaluate(() => document.documentElement.getAttribute("data-theme")),
                )
                .not.toBeNull();

            await page.locator('[data-testid="settings-plugin-nav-appearance"]').click();
            const current_theme = await page_b.evaluate(() =>
                document.documentElement.getAttribute("data-theme"),
            );
            const next_theme = current_theme === "dark" ? "light" : "dark";
            await page
                .getByRole("button", { name: next_theme === "dark" ? "深色" : "浅色" })
                .click();

            await expect
                .poll(() =>
                    page_b.evaluate(() => document.documentElement.getAttribute("data-theme")),
                )
                .toBe(next_theme);
            const config = await httpJson(`${url}v1/config`);
            expect(config.status).toBe(200);
            expect((config.body as { config?: { theme?: string } }).config?.theme).toBe(next_theme);
        } finally {
            await page_b.close();
            await closeApp(app);
            rmSync(userDataDir, { recursive: true, force: true });
            rmSync(importDir, { recursive: true, force: true });
        }
    });
});
