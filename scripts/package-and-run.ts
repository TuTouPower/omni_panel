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

export function omni_proc_match_pattern(): string {
    if (platform() === "win32") return "OmniPanel.exe";
    if (platform() === "darwin") return "OmniPanel.app/Contents/MacOS/OmniPanel";
    return linux_proc_match_pattern();
}

function kill_omni(): void {
    const is_win = platform() === "win32";
    const proc = omni_proc_match_pattern();
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

function wait_for_exit(max_ms = 5000): void {
    const is_win = platform() === "win32";
    const proc = omni_proc_match_pattern();
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
                execSync(`pgrep -f ${proc}`, { stdio: "pipe" });
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
        execSync(is_win ? "taskkill /f /t /im OmniPanel.exe 2>nul" : `pkill -9 -f ${proc}`, {
            shell: is_win ? "cmd.exe" : "/bin/sh",
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

/**
 * electron-builder --dir 在 macOS 下按架构输出到 artifacts/mac-arm64 或
 * artifacts/mac；旧实现硬编码 artifacts/mac，arm64 机器上 spawn ENOENT。
 */
export function mac_app_rel_path(arch: string = process.arch): string {
    const dir = arch === "arm64" ? "artifacts/mac-arm64" : "artifacts/mac";
    return `${dir}/OmniPanel.app`;
}

/**
 * 稳定签名身份名（p245）。macOS 钥匙串条目的 ACL 绑定代码签名的 designated
 * requirement：ad-hoc 签名（`-`）绑定二进制内容哈希，每次构建都不同 → 每次启动
 * 都要求重新授权（cookie 加密密钥 `"OmniPanel Safe Storage"`）。改用固定的自签
 * 证书后，DR = `certificate root = H"<cert>"`，跨构建稳定，只需授权一次。
 * 未安装该证书（新机器/CI）时退回 ad-hoc，行为与之前一致。
 */
const MAC_SIGN_IDENTITY_NAME = "OmniPanel Local Dev";

/** 返回 codesign 用的身份：优先环境变量覆盖，其次查找证书，找不到回退 ad-hoc `-`。 */
export function mac_sign_identity(): string {
    const override = process.env["OMNIPANEL_MAC_SIGN_IDENTITY"];
    if (override !== undefined && override.trim().length > 0) return override.trim();
    try {
        const output = execSync("security find-identity -p codesigning", {
            stdio: "pipe",
        }).toString();
        const line = output
            .split("\n")
            .find((candidate) => candidate.includes(MAC_SIGN_IDENTITY_NAME));
        const hash = line?.match(/[0-9A-Fa-f]{40}/)?.[0];
        if (hash !== undefined) return hash;
    } catch {
        // security 不可用：按 ad-hoc 处理。
    }
    return "-";
}

/**
 * 本地打包默认 ad-hoc：t500 后 Cookie 加密 fuse 已关，运行时不碰钥匙串，
 * p245 稳定证书 DR 绑定已无必要。ad-hoc 从不访问钥匙串、不弹密码。
 * 仅限本机运行，不得分发。要走钥匙串身份时设 OMNI_SIGN=1。
 * OMNI_SKIP_SIGN=1 仍视为免签（旧入口兼容）。
 */
export function skip_sign(): boolean {
    if (process.env["OMNI_SIGN"] === "1") return false;
    return true;
}

/**
 * 无 Developer ID 时 electron-builder 跳过签名，但 electronFuses 的
 * enableEmbeddedAsarIntegrityValidation + hardenedRuntime 要求有效签名，
 * 未签会在启动瞬间 SIGKILL (Code Signature Invalid)。默认 ad-hoc 重签；
 * OMNI_SIGN=1 时用稳定自签身份（p245）。
 * 注意：重签会改动 asar 完整性哈希，fuse 校验以重签后的 seal 为准。
 */
function sign_mac_app(app_dir: string): void {
    const app = resolve(ROOT, app_dir);
    const identity = skip_sign() ? "-" : mac_sign_identity();
    log(
        identity === "-"
            ? `ad-hoc signing: ${app}`
            : `signing with stable identity ${identity}: ${app}`,
    );
    execSync(`codesign --force --deep --sign ${JSON.stringify(identity)} ${JSON.stringify(app)}`, {
        cwd: ROOT,
        stdio: "inherit",
    });
}

function run_packaged(): void {
    if (platform() === "darwin") {
        const app_dir = mac_app_rel_path();
        sign_mac_app(app_dir);
        const app_path = resolve(ROOT, app_dir);
        if (!existsSync(app_path)) {
            throw new Error(`packaged app not found: ${app_path}`);
        }
        log(`starting: ${app_path}`);
        execSync(`open ${JSON.stringify(app_path)}`);
        log("packaged app started");
        return;
    }

    let rel_path: string;
    if (platform() === "win32") {
        rel_path = "artifacts/win-unpacked/OmniPanel.exe";
    } else {
        rel_path = "artifacts/linux-unpacked/omni_panel";
    }
    const exe = resolve(ROOT, rel_path);

    if (!existsSync(exe)) {
        throw new Error(`packaged binary not found: ${exe}`);
    }

    log(`starting: ${exe}`);

    const child = spawn(exe, ["--gui"], {
        detached: true,
        stdio: "ignore",
    });
    child.unref();

    log("packaged app started");
}

function main(): void {
    const no_build = process.argv.includes("--no-build");

    if (skip_sign()) {
        log(
            "ad-hoc seal (default): no keychain prompts. Do not distribute. OMNI_SIGN=1 to use a keychain identity.",
        );
    } else {
        log("OMNI_SIGN=1: signing with keychain identity");
    }

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
        // 默认 -c.mac.identity=null 跳过 electron-builder 自动发现钥匙串身份；
        // seal 由后续 sign_mac_app 的 ad-hoc 重签补上。OMNI_SIGN=1 才让 builder 自己签。
        const skip = skip_sign();
        log(
            skip
                ? "running electron-builder --dir (unsigned, identity=null)..."
                : "running electron-builder --dir...",
        );
        execSync(`electron-builder --dir${skip ? " -c.mac.identity=null" : ""}`, {
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
