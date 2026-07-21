import { execSync, spawn } from "node:child_process";
import { resolve } from "node:path";
import { platform } from "node:os";

const ROOT = process.cwd();

function log(msg: string) {
    console.log(`[package:run] ${msg}`);
}

function kill_omni(): void {
    const is_win = platform() === "win32";
    const procs = is_win ? ["OmniUsage.exe", "electron.exe"] : ["OmniUsage", "electron"];

    for (const proc of procs) {
        try {
            if (is_win) {
                execSync(`taskkill /f /t /im ${proc} 2>nul`, { stdio: "pipe" });
            } else {
                execSync(`pkill -f ${proc}`, { stdio: "pipe" });
            }
        } catch {
            // process not running
        }
    }
}

function wait_for_exit(max_ms = 5000): void {
    const is_win = platform() === "win32";
    const deadline = Date.now() + max_ms;
    while (Date.now() < deadline) {
        let running = false;
        try {
            if (is_win) {
                running = execSync('tasklist /fi "imagename eq OmniUsage.exe" /nh', {
                    stdio: "pipe",
                })
                    .toString()
                    .includes("OmniUsage.exe");
            } else {
                execSync("pgrep -f OmniUsage", { stdio: "pipe" });
                running = true;
            }
        } catch {
            // not running
        }
        if (!running) {
            log("all OmniUsage processes exited");
            return;
        }
        execSync("timeout /t 1 /nobreak >nul 2>&1 || sleep 1", {
            shell: is_win ? "cmd.exe" : "/bin/sh",
            stdio: "pipe",
        });
    }
    log("warning: OmniUsage still running after timeout, forcing kill");
    try {
        execSync("taskkill /f /t /im OmniUsage.exe 2>nul || pkill -9 -f OmniUsage", {
            shell: platform() === "win32" ? "cmd.exe" : "/bin/sh",
            stdio: "pipe",
        });
    } catch {
        // best effort
    }
}

function clear_runtime_state(): void {
    // 之前删 states/ 整目录导致 runtime-store cache 丢失，
    // app 重启后 snapshot instanceId 不匹配 observation-store 历史 -> 数据"丢失"。
    // states/ 只存 runtime-store cache（非用户数据），删它弊大于利，不再清理。
    // 如需重置 connector 运行时状态，应在 app 内通过 UI 操作（非打包脚本强制）。
    log("clear_runtime_state: skipped (states/ preserved to avoid instanceId orphan)");
}

function run_packaged(): void {
    const is_win = platform() === "win32";
    const exe = resolve(
        ROOT,
        is_win
            ? "artifacts/win-unpacked/OmniUsage.exe"
            : "artifacts/mac/OmniUsage.app/Contents/MacOS/OmniUsage",
    );

    log(`starting: ${exe}`);

    const child = spawn(exe, [], {
        detached: true,
        stdio: "ignore",
    });
    child.unref();

    log("packaged app started");
}

function main(): void {
    const no_build = process.argv.includes("--no-build");

    // Step 1: kill existing process
    kill_omni();

    // Step 2: wait for processes to fully exit
    wait_for_exit();

    // Step 3: clear runtime state
    clear_runtime_state();

    // Step 4: package (skip if --no-build)
    if (!no_build) {
        log("ensuring Electron ABI for better-sqlite3...");
        execSync("node scripts/ensure_electron_abi.mjs", { cwd: ROOT, stdio: "inherit" });
        log("running electron-vite build...");
        execSync("electron-vite build", {
            cwd: ROOT,
            stdio: "inherit",
        });
        log("running web build...");
        execSync("vite build --config vite.web.config.ts", {
            cwd: ROOT,
            stdio: "inherit",
        });
        log("running electron-builder --dir...");
        execSync("electron-builder --dir", {
            cwd: ROOT,
            stdio: "inherit",
            env: {
                ...process.env,
                ELECTRON_MIRROR: "https://npmmirror.com/mirrors/electron/",
            },
        });
        log("restoring Node ABI for better-sqlite3...");
        execSync("node scripts/ensure_node_abi.mjs", { cwd: ROOT, stdio: "inherit" });
    }

    // Step 5: run
    run_packaged();
}

main();
