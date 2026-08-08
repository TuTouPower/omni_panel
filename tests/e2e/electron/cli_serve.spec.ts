import { expect, test } from "../fixtures/test";
import { _electron as electron, type ElectronApplication } from "@playwright/test";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { get as httpGet } from "node:http";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = process.cwd();
const MAIN_ENTRY = resolve(ROOT, "out/main/index.js");
const ELECTRON = resolve(ROOT, "node_modules/electron/dist/electron");

async function httpJson(url: string): Promise<{ status: number; body: unknown }> {
    return new Promise((resolveResult, reject) => {
        httpGet(url, (res) => {
            let data = "";
            res.on("data", (c: Buffer) => (data += c.toString()));
            res.on("end", () => {
                let body: unknown;
                try {
                    body = JSON.parse(data);
                } catch {
                    body = data;
                }
                resolveResult({ status: res.statusCode ?? 0, body });
            });
        }).on("error", reject);
    });
}

/** 起一个 CLI 模式实例，返回 app + userDataDir + stdout 缓冲。 */
async function launchCli(
    args: string[],
    options: { env?: Record<string, string> } = {},
): Promise<{
    app: ElectronApplication;
    userDataDir: string;
    stdout: () => string;
}> {
    const userDataDir = mkdtempSync(join(tmpdir(), "omnipanel-cli-"));
    let out = "";
    const app = await electron.launch({
        args: [MAIN_ENTRY, ...args, `--user-data-dir=${userDataDir}`],
        executablePath: ELECTRON,
        cwd: ROOT,
        env: { ...process.env, ...options.env } as Record<string, string>,
    });
    app.process().stdout?.on("data", (d: Buffer) => {
        out += d.toString();
    });
    app.process().stderr?.on("data", (d: Buffer) => {
        out += d.toString();
    });
    return { app, userDataDir, stdout: () => out };
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

/** 等 Electron 进程退出，返回退出码；超时返回 null。 */
async function wait_exit_code(app: ElectronApplication, timeoutMs: number): Promise<number | null> {
    const proc = app.process();
    if (proc.exitCode !== null) return proc.exitCode;
    return new Promise<number | null>((resolveExit) => {
        const timer = setTimeout(() => {
            resolveExit(null);
        }, timeoutMs);
        proc.once("exit", (code) => {
            clearTimeout(timer);
            resolveExit(code);
        });
    });
}

async function wait_for_health(port: number): Promise<void> {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
        try {
            const res = await httpJson(`http://localhost:${String(port)}/v1/health`);
            if (res.status === 200) return;
        } catch {
            // not up yet
        }
        await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`CLI instance did not become healthy on port ${String(port)}`);
}

test.describe("CLI 模式 serve（t275）", () => {
    test("AC1/AC2：--cli serve 无窗口，local-api 响应，stdout 打印 URL，cli.json 端口一致", async () => {
        const port = 18701;
        const { app, userDataDir, stdout } = await launchCli([
            "--cli",
            "serve",
            "--port",
            String(port),
        ]);
        try {
            await wait_for_health(port);

            // AC1：无任何 BrowserWindow
            const winCount = await app.evaluate(({ BrowserWindow }) => {
                return BrowserWindow.getAllWindows().length;
            });
            expect(winCount).toBe(0);

            // AC1：local-api 响应（dashboard 端点）
            const health = await httpJson(`http://localhost:${String(port)}/v1/health`);
            expect(health.status).toBe(200);
            expect((health.body as { status: string }).status).toBe("ok");

            // f005：dashboard 端点可达（合法 query：1 天窗口，空数据返回 200 空结果）
            const dashboard = await httpJson(
                `http://localhost:${String(port)}/v1/dashboard?agent=all&platform=all&start=0&end=86400000&metric=tokens&xaxis=time&gran=day`,
            );
            expect(dashboard.status).toBe(200);

            // AC2：stdout 打印可访问 URL
            await expect
                .poll(() => stdout(), { timeout: 5000 })
                .toContain("OmniPanel CLI mode listening on");

            // AC2：cli.json 端口与实际监听一致
            const cliJson = JSON.parse(readFileSync(join(userDataDir, "cli.json"), "utf8")) as {
                port: number;
                url: string;
            };
            expect(cliJson.port).toBe(port);
            expect(cliJson.url).toBe(`http://localhost:${String(port)}/`);
        } finally {
            await closeApp(app);
            rmSync(userDataDir, { recursive: true, force: true });
        }
    });

    test("AC3：--config 导入生效，规范 config.json 无明文 secret", async () => {
        const port = 18702;
        const configImport = mkdtempSync(join(tmpdir(), "omnipanel-cli-import-"));
        const importFile = join(configImport, "import.json");
        const config = {
            schemaVersion: 1,
            language: "zh-Hans",
            plugins: [
                {
                    instanceId: "cli-import-test",
                    stateId: "cli-import-test",
                    name: "Test",
                    enabled: true,
                    executablePath: resolve(ROOT, "connectors/deepseek"),
                    refreshIntervalSeconds: 300,
                    parameterValues: { API_KEY: "sk-synthetic-cli-e2e" },
                    endpointOverrides: {},
                },
            ],
            launchAtLogin: false,
        };
        writeFileSync(importFile, JSON.stringify(config));

        const { app, userDataDir } = await launchCli([
            "--cli",
            "serve",
            "--port",
            String(port),
            "--config",
            importFile,
        ]);
        try {
            await wait_for_health(port);

            // 规范 config.json 已覆盖写入导入内容，且无明文 secret
            const configPath = join(userDataDir, "config.json");
            expect(existsSync(configPath)).toBe(true);
            const persisted = JSON.parse(readFileSync(configPath, "utf8")) as {
                plugins: { instanceId: string; parameterValues: Record<string, string> }[];
            };
            expect(persisted.plugins[0]?.instanceId).toBe("cli-import-test");
            expect(persisted.plugins[0]?.parameterValues).toEqual({});
            expect(JSON.stringify(persisted)).not.toContain("sk-synthetic-cli-e2e");

            // vault 文件存在（加密存储）且不含明文 secret
            const vaultPath = join(userDataDir, "secrets.vault");
            expect(existsSync(vaultPath)).toBe(true);
            expect(readFileSync(vaultPath, "utf8")).not.toContain("sk-synthetic-cli-e2e");

            // f001：真实 vault 往返——经 /v1/secrets 读回明文密钥可用（运行中应用能读回）
            const secretsRes = await httpJson(
                `http://localhost:${String(port)}/v1/secrets?instanceId=cli-import-test`,
            );
            expect(secretsRes.status).toBe(200);
            // send_result 成功时直接返回 data（明文 secrets 对象），无 ok 包装
            const secretsBody = secretsRes.body as Record<string, string>;
            expect(secretsBody["API_KEY"]).toBe("sk-synthetic-cli-e2e");
        } finally {
            await closeApp(app);
            rmSync(userDataDir, { recursive: true, force: true });
            rmSync(configImport, { recursive: true, force: true });
        }
    });

    test("AC8：缺子命令非零退出码", async () => {
        const userDataDir = mkdtempSync(join(tmpdir(), "omnipanel-cli-bad-"));
        // 缺子命令的 `--cli` 在启动初期 process.exit(1)，launch 会因非零退出抛错。
        await expect(
            electron.launch({
                args: [MAIN_ENTRY, "--cli", `--user-data-dir=${userDataDir}`],
                executablePath: ELECTRON,
                cwd: ROOT,
            }),
        ).rejects.toThrow();
        // 不留半初始化状态：userData 未被创建（退出早于任何写盘）。
        expect(existsSync(join(userDataDir, "config.json"))).toBe(false);
        rmSync(userDataDir, { recursive: true, force: true });
    });

    test("AC8：--config 指向不存在文件给出可读错误与非零退出码", async () => {
        const userDataDir = mkdtempSync(join(tmpdir(), "omnipanel-cli-badcfg-"));
        const missing = join(userDataDir, "no-such.json");
        // 导入失败发生在 whenReady().then 内（CDP 已建立，launch 会 resolve），
        // 进程随后以非零码退出——等 exit 事件断言退出码。
        const app = await electron.launch({
            args: [
                MAIN_ENTRY,
                "--cli",
                "serve",
                "--config",
                missing,
                `--user-data-dir=${userDataDir}`,
            ],
            executablePath: ELECTRON,
            cwd: ROOT,
        });
        const exitCode = await wait_exit_code(app, 10000);
        expect(exitCode).not.toBe(0);
        // 不留半初始化状态：config.json 即使存在也未被导入破坏（auto_seed 产物，合法 JSON）。
        // 导入失败中止于写盘前，config.json 不含导入文件的任何内容。
        const configPath = join(userDataDir, "config.json");
        if (existsSync(configPath)) {
            const raw = readFileSync(configPath, "utf8");
            expect(raw).not.toContain("sk-synthetic-cli-e2e");
            expect(() => JSON.parse(raw) as unknown).not.toThrow();
        }
        rmSync(userDataDir, { recursive: true, force: true });
    });

    test("AC8：--config 指向非法 JSON 非零退出且 config.json 未破坏", async () => {
        const userDataDir = mkdtempSync(join(tmpdir(), "omnipanel-cli-badjcfg-"));
        const badFile = join(userDataDir, "bad.json");
        writeFileSync(badFile, "{ not valid json !!");
        const app = await electron.launch({
            args: [
                MAIN_ENTRY,
                "--cli",
                "serve",
                "--config",
                badFile,
                `--user-data-dir=${userDataDir}`,
            ],
            executablePath: ELECTRON,
            cwd: ROOT,
        });
        const exitCode = await wait_exit_code(app, 10000);
        expect(exitCode).not.toBe(0);
        // config.json 未被导入破坏：即使 auto_seed 创建了种子配置，它仍是合法 JSON。
        const configPath = join(userDataDir, "config.json");
        if (existsSync(configPath)) {
            const raw = readFileSync(configPath, "utf8");
            expect(raw).not.toContain("{ not valid json");
            expect(() => JSON.parse(raw) as unknown).not.toThrow();
        }
        rmSync(userDataDir, { recursive: true, force: true });
    });

    test("AC6：--port 与 OMNI_PANEL_PORT 并存时 --port 优先", async () => {
        const port = 18703;
        const envPort = 18704;
        const { app, userDataDir } = await launchCli(["--cli", "serve", "--port", String(port)], {
            env: { OMNI_PANEL_PORT: String(envPort) },
        });
        try {
            await wait_for_health(port);
            // --port 生效，非 OMNI_PANEL_PORT
            const cliJson = JSON.parse(readFileSync(join(userDataDir, "cli.json"), "utf8")) as {
                port: number;
            };
            expect(cliJson.port).toBe(port);
            // OMNI_PANEL_PORT 端口未被监听
            const wrongPort = await httpJson(`http://localhost:${String(envPort)}/v1/health`).catch(
                () => ({ status: 0, body: null }),
            );
            expect(wrongPort.status).toBe(0);
        } finally {
            await closeApp(app);
            rmSync(userDataDir, { recursive: true, force: true });
        }
    });

    test("AC4：无 --config 时沿用预置 config.json", async () => {
        const port = 18705;
        // 预置规范 config.json（deepseek connector，无明文 secret）
        const userDataDir = mkdtempSync(join(tmpdir(), "omnipanel-cli-preset-"));
        writeFileSync(
            join(userDataDir, "config.json"),
            JSON.stringify({
                schemaVersion: 1,
                language: "zh-Hans",
                plugins: [
                    {
                        instanceId: "preset-ds",
                        stateId: "preset-ds",
                        name: "Preset",
                        enabled: true,
                        executablePath: resolve(ROOT, "connectors/deepseek"),
                        refreshIntervalSeconds: 300,
                        parameterValues: {},
                        endpointOverrides: {},
                    },
                ],
                launchAtLogin: false,
            }),
        );
        const { app } = await launchCli(["--cli", "serve", "--port", String(port)]);
        try {
            await wait_for_health(port);
            // 预置配置被沿用：config.json 未被覆盖改写
            const persisted = JSON.parse(
                readFileSync(join(userDataDir, "config.json"), "utf8"),
            ) as { plugins: { instanceId: string }[] };
            expect(persisted.plugins[0]?.instanceId).toBe("preset-ds");
        } finally {
            await closeApp(app);
            rmSync(userDataDir, { recursive: true, force: true });
        }
    });
});
