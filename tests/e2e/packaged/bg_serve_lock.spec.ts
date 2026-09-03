/**
 * 后台 serve 单实例锁冲突打包形态进程级 e2e（t443）。
 *
 * 先以打包二进制 `serve --foreground` 起健康实例（临时 user-data-dir + 固定端口），
 * 再以同 user-data-dir 执行后台 `serve`（无 --foreground），断言父进程秒级失败 +
 * 非 0 退出 + stderr 锁冲突诊断（而非「等待 serve 启动超时」）。
 *
 * 打包形态 argv 直通 `--user-data-dir`（d050：electron dev 形态被 electron 消费，
 * 无法用 dev electron 复现，故只覆盖打包形态）。
 */
import { test, expect } from "@playwright/test";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import { execFileSync } from "node:child_process";
import type { Readable } from "node:stream";
import { resolve } from "node:path";
import { existsSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { get as httpGet } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    linux: resolve(ROOT, "artifacts/linux-unpacked/omni_panel"),
};
const PACKAGED_EXE = EXE_BY_PLATFORM[process.platform];

const exeExists = PACKAGED_EXE !== undefined && existsSync(PACKAGED_EXE);

const skipIfNoExe = {
    skip: !exeExists,
    reason: exeExists ? "" : `packaged binary not found at ${PACKAGED_EXE ?? "unknown platform"}`,
};

function scrub_log_text(text: string): string {
    return scrubber
        .scrub_text(text)
        .replace(/(Cookie|SESSION_COOKIE|API_KEY|token|password)=([^\s;&]+)/gi, "$1=***");
}

function wait(ms: number): Promise<void> {
    return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

async function wait_for_health(port: number, timeoutMs = 15_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await new Promise<{ status: number }>((resolveResult, reject) => {
                httpGet(`http://127.0.0.1:${String(port)}/v1/health`, (resp) => {
                    resp.resume();
                    resolveResult({ status: resp.statusCode ?? 0 });
                }).on("error", reject);
            });
            if (res.status === 200) return;
        } catch {
            // not up yet
        }
        await wait(300);
    }
    throw new Error(`packaged serve did not become healthy on port ${String(port)}`);
}

/**
 * 按 --user-data-dir 唯一定位回收进程树（t288 模式，cli_control.spec.ts 同源）：
 * 健康实例的 foreground 子进程脱离本用例直接句柄管理时兜底，避免孤儿跨 run
 * 堆积阻塞端口。仅 Linux（pgrep 依赖 /proc）；本用例本就 Linux-only。
 */
async function reap_user_data_dir_processes(userDataDir: string): Promise<void> {
    if (process.platform === "win32" || process.platform === "darwin") return;
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
    const deadline = Date.now() + 3000;
    let remaining = pids();
    while (Date.now() < deadline && remaining.length > 0) {
        await wait(200);
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

interface BgResult {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    elapsedMs: number;
}

function run_background_serve(exe: string, userDataDir: string): Promise<BgResult> {
    return new Promise((resolveResult) => {
        const child: ChildProcessByStdio<null, Readable, Readable> = spawn(
            exe,
            ["serve", "--user-data-dir", userDataDir], // 空格分隔：`=` 拼接形态下打包二进制的 --user-data-dir 被静默丢弃（实测），空格形态才被解析
            {
                cwd: ROOT,
                env: { ...process.env, E2E: "1" },
                stdio: ["ignore", "pipe", "pipe"],
            },
        );
        let stdout = "";
        let stderr = "";
        const started = Date.now();
        child.stdout.on("data", (d: Buffer) => {
            stdout += d.toString();
        });
        child.stderr.on("data", (d: Buffer) => {
            stderr += d.toString();
        });
        child.on("exit", (code) => {
            resolveResult({ exitCode: code, stdout, stderr, elapsedMs: Date.now() - started });
        });
    });
}

test.describe("packaged background serve 单实例锁冲突（t443）", () => {
    test("AC-001/AC-002/AC-003：后台 serve 撞已运行实例锁——父进程秒级非 0 退出 + 锁冲突诊断", async () => {
        test.skip(skipIfNoExe.skip, skipIfNoExe.reason);

        if (!PACKAGED_EXE) throw new Error("PACKAGED_EXE is undefined");
        // 本机常驻桌面实例占用默认数据目录（~/.config/OmniPanel）与 18263 端口；
        // 健康实例必须用隔离 user-data-dir + 固定空闲端口，避免 probe 撞见常驻实例。
        const port = 18711;
        const userDataDir = mkdtempSync(join(tmpdir(), "omnipanel-bg-lock-"));

        // 健康实例：打包二进制 serve --foreground（argv 直通 user-data-dir）。
        const healthy: ChildProcessByStdio<null, Readable, Readable> = spawn(
            PACKAGED_EXE,
            ["serve", "--foreground", "--port", String(port), "--user-data-dir", userDataDir],
            {
                cwd: ROOT,
                env: { ...process.env, E2E: "1" },
                stdio: ["ignore", "pipe", "pipe"],
            },
        );
        const healthyLogs: string[] = [];
        healthy.stdout.on("data", (d: Buffer) => {
            healthyLogs.push(scrub_log_text(d.toString()));
        });
        healthy.stderr.on("data", (d: Buffer) => {
            healthyLogs.push(scrub_log_text(d.toString()));
        });
        try {
            await wait_for_health(port);

            // 后台 serve 同 user-data-dir：触发 run_background_serve_parent 顶部
            // probe_running_instance_sync 命中（cli.json 由健康实例写入本隔离目录）→
            // 秒级 exit(1) + 「实例已在运行」。隔离目录是关键：默认数据目录可能被
            // 本机常驻实例占用，probe 会误撞常驻实例而非本用例健康实例。
            const bg = await run_background_serve(PACKAGED_EXE, userDataDir);
            const stderr = scrub_log_text(bg.stderr);

            // AC-001：父进程秒级失败 + 非 0 退出（远小于 15s 空等超时）。
            expect(bg.exitCode).not.toBe(0);
            expect(bg.exitCode).toBe(1);
            expect(bg.elapsedMs).toBeLessThan(15_000);

            // AC-002：stderr 含锁冲突诊断，不含超时误报。
            expect(stderr).toContain("实例已在运行");
            expect(stderr).not.toContain("等待 serve 启动超时");

            // 健康实例确为本用例所起（cli.json pid/端口一致，非误撞陈旧实例）；
            // 且后台 serve 诊断指向本用例健康实例（非本机常驻实例），排除 probe 误撞。
            const cliJson = JSON.parse(readFileSync(join(userDataDir, "cli.json"), "utf8")) as {
                port: number;
                pid: number;
            };
            expect(cliJson.port).toBe(port);
            expect(stderr).toContain(`port=${String(port)}`);
        } finally {
            if (healthy.exitCode === null && !healthy.killed) {
                healthy.kill();
            }
            await reap_user_data_dir_processes(userDataDir);
            rmSync(userDataDir, { recursive: true, force: true });
        }
    });
});
