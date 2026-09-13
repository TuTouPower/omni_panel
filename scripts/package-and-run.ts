import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { platform } from "node:os";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();

function log(msg: string) {
    console.log(`[package:run] ${msg}`);
}

/**
 * p223: Linux 下 pkill/pgrep 的 -f 全命令行匹配 pattern。必须只命中打包产物
 * （`artifacts/linux-unpacked/omni_panel`），不能用裸 `omni_panel`——tsx 自身
 * 命令行含仓库路径 `.../omni_panel/scripts/package-and-run.ts`，裸串会自杀（exit 143）。
 */
export function linux_proc_match_pattern(): string {
    return "linux-unpacked/omni_panel";
}

function kill_omni(): void {
    const is_win = platform() === "win32";
    // t369 AC-001: 产物名 Linux 为 omni_panel（小写），pkill 大小写不匹配杀不掉旧实例。
    const procs = is_win ? ["OmniPanel.exe"] : [linux_proc_match_pattern()];

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
    const procs = is_win ? ["OmniPanel.exe"] : [linux_proc_match_pattern()];
    const deadline = Date.now() + max_ms;
    while (Date.now() < deadline) {
        let running = false;
        try {
            if (is_win) {
                running = execSync('tasklist /fi "imagename eq OmniPanel.exe" /nh', {
                    stdio: "pipe",
                })
                    .toString()
                    .includes("OmniPanel.exe");
            } else {
                execSync(`pgrep -f ${procs[0] ?? linux_proc_match_pattern()}`, { stdio: "pipe" });
                running = true;
            }
        } catch {
            // not running
        }
        if (!running) {
            log("all OmniPanel processes exited");
            return;
        }
        // t369 AC-002: Linux 去 `>nul`（win 专属重定向），用 sleep 1。
        execSync(is_win ? "timeout /t 1 /nobreak >nul 2>&1" : "sleep 1", {
            shell: is_win ? "cmd.exe" : "/bin/sh",
            stdio: "pipe",
        });
    }
    log("warning: OmniPanel still running after timeout, forcing kill");
    try {
        // t369 AC-002: Linux 分支用 pkill 小写名，不执行 win 的 >nul 串。
        execSync(
            is_win
                ? "taskkill /f /t /im OmniPanel.exe 2>nul"
                : `pkill -9 -f ${procs[0] ?? linux_proc_match_pattern()}`,
            {
                shell: is_win ? "cmd.exe" : "/bin/sh",
                stdio: "pipe",
            },
        );
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

/**
 * electron-builder --dir 在 macOS 下按架构输出到 artifacts/mac-arm64 或
 * artifacts/mac；旧实现硬编码 artifacts/mac，arm64 机器上 spawn ENOENT。
 */
export function mac_app_rel_path(arch: string = process.arch): string {
    const dir = arch === "arm64" ? "artifacts/mac-arm64" : "artifacts/mac";
    return `${dir}/OmniPanel.app`;
}

/**
 * 无 Developer ID 时 electron-builder 跳过签名，但 electronFuses 的
 * enableEmbeddedAsarIntegrityValidation + hardenedRuntime 要求有效签名，
 * 未重签会在启动瞬间 SIGKILL (Code Signature Invalid)。这里做 ad-hoc 重签。
 * 注意：重签会改动 asar 完整性哈希，fuse 校验以重签后的 seal 为准。
 */
function adhoc_sign_mac(app_dir: string): void {
    const app = resolve(ROOT, app_dir);
    log(`ad-hoc signing: ${app}`);
    execSync(`codesign --force --deep --sign - ${JSON.stringify(app)}`, {
        cwd: ROOT,
        stdio: "inherit",
    });
}

function run_packaged(): void {
    let rel_path: string;
    if (platform() === "win32") {
        rel_path = "artifacts/win-unpacked/OmniPanel.exe";
    } else if (platform() === "darwin") {
        const app_dir = mac_app_rel_path();
        adhoc_sign_mac(app_dir);
        rel_path = `${app_dir}/Contents/MacOS/OmniPanel`;
    } else {
        rel_path = "artifacts/linux-unpacked/omni_panel";
    }
    const exe = resolve(ROOT, rel_path);

    if (!existsSync(exe)) {
        throw new Error(`packaged binary not found: ${exe}`);
    }

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
        run_package_build();
    }

    // Step 5: run
    run_packaged();
}

export function run_package_build(): void {
    try {
        log("ensuring Electron ABI for better-sqlite3...");
        execSync("node scripts/ensure_sqlite_abi.mjs electron", { cwd: ROOT, stdio: "inherit" });
        log("regenerating build-info...");
        execSync("tsx scripts/gen-build-info.ts", { cwd: ROOT, stdio: "inherit" });
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
    } finally {
        // t375 AC-003: 无论构建成功/中断，better-sqlite3 恢复 Node ABI——
        // 原实现只在成功路径末尾恢复，中途抛错会让后续 node 进程用错 ABI。
        log("restoring Node ABI for better-sqlite3...");
        execSync("node scripts/ensure_sqlite_abi.mjs node", { cwd: ROOT, stdio: "inherit" });
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
