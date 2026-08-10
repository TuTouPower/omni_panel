import { expect, test } from "../fixtures/test";
import { _electron as electron, type ElectronApplication } from "@playwright/test";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { createServer, get as httpGet, request as httpRequest } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
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

function post_json(url: string, timeout = 2000): Promise<{ status: number; body: unknown }> {
    return new Promise((resolveResult, reject) => {
        const target = new URL(url);
        const req = httpRequest(
            {
                hostname: target.hostname,
                port: target.port,
                path: target.pathname,
                method: "POST",
            },
            (res) => {
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
            },
        );
        req.setTimeout(timeout, () => req.destroy(new Error("timeout")));
        req.on("error", reject);
        req.end();
    });
}

async function start_deepseek_mock(): Promise<{
    url: string;
    seen_auth: string[];
    close: () => Promise<void>;
}> {
    const seen_auth: string[] = [];
    const server = createServer((req, res) => {
        if (req.url !== "/user/balance") {
            res.writeHead(404);
            res.end();
            return;
        }
        seen_auth.push(req.headers.authorization ?? "");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
            JSON.stringify({
                code: 200,
                balance_infos: [{ currency: "USD", total_balance: "12.34" }],
            }),
        );
    });
    await new Promise<void>((resolveListen, rejectListen) => {
        server.once("error", rejectListen);
        server.listen(0, "127.0.0.1", resolveListen);
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
        throw new Error("DeepSeek mock did not expose a TCP port");
    }
    return {
        url: `http://127.0.0.1:${String(address.port)}`,
        seen_auth,
        close: () =>
            new Promise<void>((resolveClose, rejectClose) => {
                server.close((error) => {
                    if (error) {
                        rejectClose(error);
                    } else {
                        resolveClose();
                    }
                });
            }),
    };
}

async function wait_for_ready(
    port: number,
    instance_id: string,
): Promise<{
    status?: unknown;
    items?: unknown[];
    error?: unknown;
}> {
    const deadline = Date.now() + 15000;
    let last: unknown;
    while (Date.now() < deadline) {
        try {
            const result = await httpJson(
                `http://localhost:${String(port)}/v1/connectors/${encodeURIComponent(instance_id)}/state`,
            );
            last = result.body;
            const state = result.body as {
                status?: unknown;
                items?: unknown[];
                error?: unknown;
            };
            if (result.status === 200 && state.status === "ready" && state.items?.length) {
                return state;
            }
            if (result.status === 200 && state.status === "failed") {
                throw new Error(`connector refresh failed: ${JSON.stringify(state)}`);
            }
        } catch (error: unknown) {
            if (error instanceof Error && error.message.startsWith("connector refresh failed:")) {
                throw error;
            }
        }
        await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`connector did not become ready: ${JSON.stringify(last)}`);
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

/** 以真实 Electron 子进程执行瘦客户端，避免 app.exit 让 Playwright launch reject。 */
function runThinClient(
    args: string[],
    userDataDir: string,
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
    return new Promise((resolveResult) => {
        const child: ChildProcess = spawn(
            ELECTRON,
            [MAIN_ENTRY, ...args, `--user-data-dir=${userDataDir}`],
            {
                cwd: ROOT,
                env: { ...process.env, E2E: "1", E2E_HEADLESS: "1" },
            },
        );
        let stdout = "";
        let stderr = "";
        child.stdout?.on("data", (data: Buffer) => {
            stdout += data.toString();
        });
        child.stderr?.on("data", (data: Buffer) => {
            stderr += data.toString();
        });
        const timer = setTimeout(() => {
            child.kill();
            resolveResult({ exitCode: null, stdout, stderr });
        }, 8000);
        child.on("exit", (code) => {
            clearTimeout(timer);
            resolveResult({ exitCode: code, stdout, stderr });
        });
    });
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

    test("t277 AC3/AC7：含密钥导出可被新 CLI 实例导入并完成采集", async () => {
        const source_port = 18706;
        const target_port = 18707;
        const secret = "sk-t277-roundtrip-synthetic";
        const instance_id = "t277-roundtrip";
        const files_dir = mkdtempSync(join(tmpdir(), "omnipanel-t277-roundtrip-"));
        const import_file = join(files_dir, "source.json");
        const export_file = join(files_dir, "exported.json");
        const mock = await start_deepseek_mock();
        let source_app: ElectronApplication | null = null;
        let target_app: ElectronApplication | null = null;
        let source_user_data_dir: string | null = null;
        let target_user_data_dir: string | null = null;
        let client_user_data_dir: string | null = null;

        writeFileSync(
            import_file,
            JSON.stringify({
                schemaVersion: 1,
                language: "zh-Hans",
                plugins: [
                    {
                        instanceId: instance_id,
                        stateId: instance_id,
                        name: "DeepSeek roundtrip",
                        enabled: true,
                        executablePath: resolve(ROOT, "connectors/deepseek"),
                        refreshIntervalSeconds: 300,
                        manualRefreshOnly: true,
                        parameterValues: { API_KEY: secret, LIMIT: "100" },
                        endpointOverrides: { default: mock.url },
                    },
                ],
                launchAtLogin: false,
            }),
        );

        try {
            const source = await launchCli([
                "--cli",
                "serve",
                "--port",
                String(source_port),
                "--config",
                import_file,
            ]);
            source_app = source.app;
            source_user_data_dir = source.userDataDir;
            await wait_for_health(source_port);

            const redacted_export = await httpJson(
                `http://localhost:${String(source_port)}/v1/config/export?includeSecrets=false`,
            );
            expect(redacted_export.status).toBe(200);
            expect(JSON.stringify(redacted_export.body)).not.toContain(secret);

            const plaintext_export = await httpJson(
                `http://localhost:${String(source_port)}/v1/config/export?includeSecrets=true`,
            );
            expect(plaintext_export.status).toBe(200);
            const exported_config = plaintext_export.body as {
                plugins?: {
                    instanceId?: string;
                    parameterValues?: Record<string, string | number>;
                }[];
            };
            expect(exported_config.plugins?.[0]?.instanceId).toBe(instance_id);
            expect(exported_config.plugins?.[0]?.parameterValues?.["API_KEY"]).toBe(secret);

            // AC4：真实瘦客户端必须走相同 LocalAPI，且两种输出与端点导出等价。
            client_user_data_dir = mkdtempSync(join(tmpdir(), "omnipanel-t277-export-client-"));
            const cli_redacted = await runThinClient(
                ["--cli", "export", "--port", String(source_port)],
                client_user_data_dir,
            );
            expect(cli_redacted.exitCode).toBe(0);
            expect(JSON.parse(cli_redacted.stdout.trim()) as unknown).toEqual(redacted_export.body);
            const cli_plaintext = await runThinClient(
                ["--cli", "export", "--include-secrets", "--port", String(source_port)],
                client_user_data_dir,
            );
            expect(cli_plaintext.exitCode).toBe(0);
            expect(JSON.parse(cli_plaintext.stdout.trim()) as unknown).toEqual(
                plaintext_export.body,
            );

            writeFileSync(export_file, JSON.stringify(exported_config));
            const auth_count_before_import = mock.seen_auth.length;
            const source_stdout = source.stdout();
            await closeApp(source_app);
            source_app = null;
            expect(source_stdout).not.toContain(secret);

            const target = await launchCli([
                "--cli",
                "serve",
                "--port",
                String(target_port),
                "--config",
                export_file,
            ]);
            target_app = target.app;
            target_user_data_dir = target.userDataDir;
            await wait_for_health(target_port);

            const persisted = JSON.parse(
                readFileSync(join(target_user_data_dir, "config.json"), "utf8"),
            ) as {
                plugins: { instanceId: string; parameterValues: Record<string, string | number> }[];
            };
            expect(persisted.plugins[0]?.instanceId).toBe(instance_id);
            expect(persisted.plugins[0]?.parameterValues).not.toHaveProperty("API_KEY");
            expect(JSON.stringify(persisted)).not.toContain(secret);

            const vault_path = join(target_user_data_dir, "secrets.vault");
            expect(existsSync(vault_path)).toBe(true);
            expect(readFileSync(vault_path, "utf8")).not.toContain(secret);
            expect(target.stdout()).not.toContain(secret);

            const stored_secrets = await httpJson(
                `http://localhost:${String(target_port)}/v1/secrets?instanceId=${instance_id}`,
            );
            expect(stored_secrets.status).toBe(200);
            expect((stored_secrets.body as Record<string, string>)["API_KEY"]).toBe(secret);

            const refresh = await post_json(
                `http://localhost:${String(target_port)}/v1/connectors/${instance_id}/refresh`,
            );
            expect(refresh.status).toBe(200);
            const state = await wait_for_ready(target_port, instance_id);
            expect(state.items?.length).toBeGreaterThan(0);
            expect(mock.seen_auth.slice(auth_count_before_import)).toContain(`Bearer ${secret}`);
        } finally {
            if (source_app) await closeApp(source_app).catch(() => undefined);
            if (target_app) await closeApp(target_app).catch(() => undefined);
            await mock.close().catch(() => undefined);
            if (source_user_data_dir)
                rmSync(source_user_data_dir, { recursive: true, force: true });
            if (target_user_data_dir)
                rmSync(target_user_data_dir, { recursive: true, force: true });
            if (client_user_data_dir)
                rmSync(client_user_data_dir, { recursive: true, force: true });
            rmSync(files_dir, { recursive: true, force: true });
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
