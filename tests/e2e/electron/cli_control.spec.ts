import { expect, test } from "../fixtures/test";
import { _electron as electron, type ElectronApplication } from "@playwright/test";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { get as httpGet } from "node:http";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = process.cwd();
const MAIN_ENTRY = resolve(ROOT, "out/main/index.js");
const ELECTRON = resolve(ROOT, "node_modules/electron/dist/electron");

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
                    // keep raw string
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

async function launchServe(args: string[]): Promise<{
    app: ElectronApplication;
    userDataDir: string;
}> {
    const userDataDir = mkdtempSync(join(tmpdir(), "omnipanel-cli-serve-"));
    const app = await electron.launch({
        args: [MAIN_ENTRY, ...args, `--user-data-dir=${userDataDir}`],
        executablePath: ELECTRON,
        cwd: ROOT,
    });
    return { app, userDataDir };
}

async function closeServe(app: ElectronApplication): Promise<void> {
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

/**
 * 回收 restart 产生的 relaunch 新进程（p095）：relaunch 进程脱离 playwright
 * ElectronApplication 句柄，closeServe 管不到；按 --user-data-dir 唯一定位后
 * SIGTERM 整树回收并等其退出，避免孤儿进程持续监听端口跨 run 堆积。
 * 仅 Linux（pgrep 依赖 /proc）；cli e2e 本就 Linux-only（ELECTRON 无 .exe）。
 */
async function reap_user_data_dir_processes(userDataDir: string): Promise<void> {
    if (process.platform === "win32") return;
    const pids = (): number[] => {
        try {
            const out = execFileSync("pgrep", ["-f", userDataDir], {
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"],
            });
            return out
                .trim()
                .split("\n")
                .filter(Boolean)
                .map(Number)
                .filter((n) => Number.isFinite(n));
        } catch {
            return [];
        }
    };
    for (const pid of pids()) {
        try {
            process.kill(pid, "SIGTERM");
        } catch {
            // 已退出
        }
    }
    // 等进程退出（SIGTERM 优雅退出，最多 3s）；超时未退出的 SIGKILL 兜底，不留孤儿。
    const deadline = Date.now() + 3000;
    let remaining = pids();
    while (Date.now() < deadline && remaining.length > 0) {
        await new Promise((r) => setTimeout(r, 200));
        remaining = pids();
    }
    for (const pid of remaining) {
        try {
            process.kill(pid, "SIGKILL");
        } catch {
            // 已退出
        }
    }
}

/** 以子进程方式跑瘦客户端（app.exit 快退，Playwright launch 会 reject）。 */
function runThinClient(
    args: string[],
    userDataDir: string,
): Promise<{
    exitCode: number | null;
    stdout: string;
    stderr: string;
}> {
    return new Promise((resolveResult) => {
        const child: ChildProcess = spawn(
            ELECTRON,
            [MAIN_ENTRY, ...args, `--user-data-dir=${userDataDir}`],
            { cwd: ROOT, env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" } },
        );
        let stdout = "";
        let stderr = "";
        child.stdout?.on("data", (d: Buffer) => (stdout += d.toString()));
        child.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));
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

/** 订阅 /v1/events SSE，返回事件收集器。 */
function subscribeEvents(port: number): {
    events: string[];
    close: () => void;
} {
    const events: string[] = [];
    const req = httpGet(`http://localhost:${String(port)}/v1/events`, (res) => {
        res.on("data", (chunk: Buffer) => {
            events.push(chunk.toString());
        });
    });
    req.on("error", () => undefined);
    return {
        events,
        close: () => {
            req.destroy();
        },
    };
}

/** 等 cli.json 出现并返回解析对象；超时抛错。 */
async function waitCliJson(
    userDataDir: string,
    ms = 10000,
): Promise<{ pid: number; port: number }> {
    const path = join(userDataDir, "cli.json");
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
        try {
            const parsed = JSON.parse(readFileSync(path, "utf8")) as { pid: number; port: number };
            return parsed;
        } catch {
            // 未就绪
        }
        await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`cli.json not ready at ${path}`);
}

test.describe("CLI 控制子命令（t276）", () => {
    test("AC1/AC2/AC3/AC7：refresh-all/pause/resume/restart/quit 作用于运行中实例", async () => {
        const port = 18810;
        const { app, userDataDir } = await launchServe(["--cli", "serve", "--port", String(port)]);
        try {
            await waitHealth(port);

            // refresh-all
            let r = await runThinClient(["--cli", "refresh-all"], userDataDir);
            expect(r.exitCode).toBe(0);
            expect(r.stdout).toContain("refresh-all 已发送");

            // pause（幂等：重复不报错）
            r = await runThinClient(["--cli", "pause"], userDataDir);
            expect(r.exitCode).toBe(0);
            r = await runThinClient(["--cli", "pause"], userDataDir);
            expect(r.exitCode).toBe(0);

            // resume
            r = await runThinClient(["--cli", "resume"], userDataDir);
            expect(r.exitCode).toBe(0);

            // quit 使实例干净退出
            r = await runThinClient(["--cli", "quit"], userDataDir);
            expect(r.exitCode).toBe(0);
            expect(r.stdout).toContain("quit 已发送");

            // 实例已退出：health 不可达
            const after = await httpJson(`http://localhost:${String(port)}/v1/health`, 800).catch(
                () => ({ status: 0 }),
            );
            expect(after.status).toBe(0);
        } finally {
            await closeServe(app).catch(() => undefined);
            await reap_user_data_dir_processes(userDataDir);
            rmSync(userDataDir, { recursive: true, force: true });
        }
    });

    test("AC3：restart 后实例重新可访问且 cli.json 端口刷新", async () => {
        const port = 18811;
        const { app, userDataDir } = await launchServe(["--cli", "serve", "--port", String(port)]);
        try {
            await waitHealth(port);
            const beforePid = (await waitCliJson(userDataDir)).pid;

            const r = await runThinClient(["--cli", "restart"], userDataDir);
            expect(r.exitCode).toBe(0);

            // 等 cli.json 被新实例重写（pid 变化 = restart 生效，端口可能因旧进程
            // 未完全释放而随机回退，以 cli.json 为准）
            let after = await waitCliJson(userDataDir, 3000);
            const deadline = Date.now() + 20000;
            while (Date.now() < deadline) {
                const parsed = await waitCliJson(userDataDir, 3000);
                if (parsed.pid !== beforePid) {
                    after = parsed;
                    break;
                }
                await new Promise((r2) => setTimeout(r2, 400));
            }
            // 新实例端口 health 可访问（cli.json 反映真实端口）
            await waitHealth(after.port, 10000);
            // restart 产生新进程（pid 变化）
            expect(after.pid).not.toBe(beforePid);
        } finally {
            await closeServe(app).catch(() => undefined);
            // restart 产生的 relaunch 新进程脱离 playwright 句柄，须按 user-data-dir 回收。
            await reap_user_data_dir_processes(userDataDir);
            rmSync(userDataDir, { recursive: true, force: true });
        }
    });

    test("AC4：open 输出面板 URL 且退出码正常", async () => {
        const port = 18812;
        const { app, userDataDir } = await launchServe(["--cli", "serve", "--port", String(port)]);
        try {
            await waitHealth(port);
            const r = await runThinClient(["--cli", "open"], userDataDir);
            expect(r.exitCode).toBe(0);
            expect(r.stdout).toContain("面板地址");
            expect(r.stdout).toContain(`http://localhost:${String(port)}/`);
        } finally {
            await closeServe(app).catch(() => undefined);
            rmSync(userDataDir, { recursive: true, force: true });
        }
    });

    test("AC5：autostart 在 Linux 返回 unsupported", async () => {
        const userDataDir = mkdtempSync(join(tmpdir(), "omnipanel-cli-auto-"));
        const r = await runThinClient(["--cli", "autostart"], userDataDir);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain("autostart 在 Linux 上不受支持");
        rmSync(userDataDir, { recursive: true, force: true });
    });

    test("AC6：实例未运行时控制命令给出可读错误与非零退出码", async () => {
        const userDataDir = mkdtempSync(join(tmpdir(), "omnipanel-cli-norun-"));
        const r = await runThinClient(["--cli", "pause"], userDataDir);
        expect(r.exitCode).not.toBe(0);
        expect(r.stderr).toContain("实例未运行");
        rmSync(userDataDir, { recursive: true, force: true });
    });

    test("AC1：--port 覆盖实例发现", async () => {
        const port = 18813;
        const { app, userDataDir } = await launchServe(["--cli", "serve", "--port", String(port)]);
        try {
            await waitHealth(port);
            // 用错误 userData（无 cli.json）但 --port 覆盖，仍可连到实例
            const otherData = mkdtempSync(join(tmpdir(), "omnipanel-cli-other-"));
            const r = await runThinClient(
                ["--cli", "refresh-all", "--port", String(port)],
                otherData,
            );
            expect(r.exitCode).toBe(0);
            rmSync(otherData, { recursive: true, force: true });
        } finally {
            await closeServe(app).catch(() => undefined);
            rmSync(userDataDir, { recursive: true, force: true });
        }
    });

    test("AC1：refresh-all 触发实例侧刷新（SSE 推送通道收到状态事件）", async () => {
        const port = 18814;
        const { app, userDataDir } = await launchServe(["--cli", "serve", "--port", String(port)]);
        try {
            await waitHealth(port);
            // 订阅 SSE 推送通道
            const sub = subscribeEvents(port);
            try {
                const r = await runThinClient(["--cli", "refresh-all"], userDataDir);
                expect(r.exitCode).toBe(0);
                // refresh-all 触发 connector 刷新 → runtimeStore 状态变化 → SSE 推送
                const deadline = Date.now() + 8000;
                while (Date.now() < deadline && sub.events.length === 0) {
                    await new Promise((r2) => setTimeout(r2, 300));
                }
                expect(sub.events.length).toBeGreaterThan(0);
            } finally {
                sub.close();
            }
        } finally {
            await closeServe(app).catch(() => undefined);
            rmSync(userDataDir, { recursive: true, force: true });
        }
    });

    test("AC7：桌面实例（E2E=1）同样可被 CLI 控制", async () => {
        const desktopPort = 18270;
        const userDataDir = mkdtempSync(join(tmpdir(), "omnipanel-cli-desktop-"));
        const app = await electron.launch({
            args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
            executablePath: ELECTRON,
            cwd: ROOT,
            env: { ...process.env, E2E: "1", OMNI_PANEL_PORT: String(desktopPort) },
        });
        try {
            // 桌面实例不写 cli.json；OMNI_PANEL_PORT 固定 local-api 端口
            await waitHealth(desktopPort, 20000);
            // 桌面实例被 refresh-all 控制
            const r = await runThinClient(
                ["--cli", "refresh-all", "--port", String(desktopPort)],
                userDataDir,
            );
            expect(r.exitCode).toBe(0);
            expect(r.stdout).toContain("refresh-all 已发送");
        } finally {
            await closeServe(app).catch(() => undefined);
            rmSync(userDataDir, { recursive: true, force: true });
        }
    });
});
