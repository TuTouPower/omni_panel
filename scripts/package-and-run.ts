import { execSync, spawn } from "node:child_process";
import { resolve } from "node:path";
import { platform } from "node:os";
import { existsSync, rmSync } from "node:fs";

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

function clear_plugin_cache(): void {
    const is_win = platform() === "win32";
    const app_data = is_win
        ? process.env["APPDATA"]
        : process.env["HOME"]
          ? resolve(process.env["HOME"], ".config")
          : undefined;
    if (!app_data) return;
    const cache_dir = resolve(app_data, "OmniUsage", "states");
    if (existsSync(cache_dir)) {
        rmSync(cache_dir, { recursive: true, force: true });
        log(`cleared plugin cache: ${cache_dir}`);
    }
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

    // Step 3: clear plugin cache (avoids stale garbled data after encoding changes)
    clear_plugin_cache();

    // Step 4: package (skip if --no-build)
    if (!no_build) {
        log("running electron-vite build...");
        execSync("electron-vite build", {
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
    }

    // Step 5: run
    run_packaged();
}

main();
