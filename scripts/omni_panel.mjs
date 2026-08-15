#!/usr/bin/env node
/**
 * OmniPanel 全局 CLI 入口（方案 C：永远指向 release 打包产物，不回退 dev 产物）。
 *
 * 背景：`pnpm start` 是 GUI 开发模式（electron-vite dev，必然开窗口）；全局命令
 * `omni_panel` 默认是命令行工具（t399）。双击桌面图标（二进制无参）直接进 GUI；
 * 命令行 `omni_panel --gui` 显式进 GUI；其余子命令（serve/quit/...）免 `--cli`
 * 前缀，launcher 自动注入。`--cli` 前缀兼容保留。
 *
 * 用法：
 *   omni_panel <子命令> [选项]                    命令行操作（默认 CLI；无参打印帮助）
 *   omni_panel --gui                              启动图形界面（双击桌面图标同效）
 *   omni_panel serve [--port <n>] [--user-data-dir <dir>] [--foreground]   无窗口常驻服务
 *   omni_panel open|refresh-all|pause|resume|restart|quit|autostart [--port <n>]   瘦客户端控制
 *   omni_panel export                              导出配置
 *   omni_panel help                                子命令帮助
 *
 * 数据：全局命令使用真实用户数据（~/.config/OmniPanel，除非显式
 * `--user-data-dir`）——用户跑 serve 就是要看自己的数据。开发/测试请用仓库内
 * `pnpm cli:serve`（自带 .scratch/dev-serve 沙盒，见 docs/guides/cli-mode.md），
 * 不要用全局命令跑开发实例。
 */
import { existsSync, mkdirSync, openSync, closeSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { get as httpGet } from "node:http";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { parse_cli_json } from "./cli_json_parse.mjs";
import { translate_launcher_args } from "./cli_arg_translate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..");

// electron-builder Linux 产物（`pnpm make:linux` → artifacts/linux-unpacked/）。
// 平台相关产物路径可在此扩展（win-unpacked/OmniPanel.exe 等）。
const RELEASE_BIN =
    process.platform === "win32"
        ? resolve(ROOT, "artifacts/win-unpacked/OmniPanel.exe")
        : resolve(ROOT, "artifacts/linux-unpacked/omni_panel");

const args = process.argv.slice(2);

// t399: 参数翻译（无参→help、--gui→GUI、子命令免 --cli 前缀、--cli 兼容）。
// help 判定置于 RELEASE_BIN 检查前：无产物时也能查看帮助（f001）。
const { mode, forwardArgs } = translate_launcher_args(args);

const HELP_TEXT =
    "OmniPanel CLI\n" +
    "用法：\n" +
    "  omni_panel <子命令> [选项]                    命令行操作（默认 CLI；无参打印本帮助）\n" +
    "  omni_panel --gui                              启动图形界面（双击桌面图标同效）\n" +
    "  omni_panel serve [--port <n>] [--user-data-dir <dir>] [--foreground]   无窗口常驻服务（默认后台；--foreground 前台）\n" +
    "  omni_panel open|refresh-all|pause|resume|restart|quit|autostart [--port <n>]\n" +
    "                                                                        瘦客户端控制\n" +
    "  omni_panel export                                                       导出配置\n" +
    "  omni_panel help                                                         子命令帮助\n" +
    "停止后台服务：omni_panel quit --port <n>\n" +
    "兼容：--cli 前缀仍可用（omni_panel --cli serve ...），行为不变。\n" +
    "数据：全局命令使用真实用户数据（~/.config/OmniPanel，可用 --user-data-dir 覆盖）\n";

if (mode === "help") {
    process.stdout.write(HELP_TEXT);
    process.exit(0);
}
if (mode === "invalid") {
    process.stderr.write(`[omni_panel] 无法识别的命令：${args.join(" ")}\n`);
    process.stderr.write(HELP_TEXT);
    process.exit(1);
}

if (!existsSync(RELEASE_BIN)) {
    console.error(
        `[omni_panel] release 产物缺失：${RELEASE_BIN}\n` +
            "请先在仓库内执行 `pnpm make:linux`（或对应平台 make 命令）打包稳定版。\n" +
            "本命令只服务 release 产物，不回退 dev 产物（out/）——开发构建与全局使用隔离。",
    );
    process.exit(1);
}

async function main() {
    // GUI 模式：剥掉 --gui 后原样转发二进制，无 CLI 处理。
    if (mode === "gui") {
        const child = spawn(RELEASE_BIN, forwardArgs, { stdio: "inherit" });
        child.on("error", (/** @type {Error} */ e) => {
            console.error(`[omni_panel] GUI 启动失败：${e.message}`);
            process.exit(1);
        });
        child.on("exit", (code) => process.exit(code ?? 0));
        // 不 unref：GUI 进程退出即 launcher 退出，无后台语义。
        return;
    }

    // mode === "cli"，forwardArgs 已含 --cli 前缀，转发给二进制。
    const is_serve = forwardArgs.includes("serve");
    const is_foreground = forwardArgs.includes("--foreground");
    const is_background = is_serve && !is_foreground;

    // 默认 dataRoot（~/.config/OmniPanel）或 --user-data-dir <path> 覆盖。
    // 兼容空格形式（--user-data-dir <path>）与 = 形式（--user-data-dir=<path>）。
    /** @type {string | undefined} */
    let user_data_dir;
    const udd_index = forwardArgs.indexOf("--user-data-dir");
    if (udd_index >= 0 && forwardArgs[udd_index + 1]) {
        user_data_dir = forwardArgs[udd_index + 1];
    } else {
        const udd_eq = forwardArgs.find((a) => a.startsWith("--user-data-dir="));
        user_data_dir = udd_eq ? udd_eq.slice("--user-data-dir=".length) : undefined;
    }
    const data_root_candidate = user_data_dir
        ? resolve(user_data_dir)
        : join(homedir(), ".config", "OmniPanel");
    // resolve/join 恒返回 string（AC-002：无 typeof 收窄 / "" 兜底死代码）。
    const data_root = data_root_candidate;

    // serve 启动前：已有可达实例则提示并退出（避免 Electron 单实例锁静默失败后
    // launcher 轮询 15s 报笼统「等待 serve 启动超时」，用户无从得知真实原因）。
    if (is_serve) {
        const running = await probe_running_instance(data_root);
        if (running) {
            console.error(
                `[omni_panel] 实例已在运行（pid=${String(running.pid)}，port=${String(running.port)}）。如需重启请先停止：\n` +
                    `  omni_panel quit --port ${String(running.port)}`,
            );
            process.exit(1);
        }
    }

    if (is_background) {
        // 后台：detached spawn，stdout/stderr 直接落 <dataRoot>/logs/serve-*.log
        // （无 pipe，无 EPIPE/孤儿句柄问题）。launcher 轮询 <dataRoot>/cli.json
        // 拿服务地址（app 启动成功写 cli.json，路径随 userDataDir 变化），
        // 打印后立即返回；child 继续后台。
        const log_dir = join(data_root, "logs");
        mkdirSync(log_dir, { recursive: true });
        const log_path = join(
            log_dir,
            `serve-${new Date().toISOString().replace(/[:.]/g, "-")}.log`,
        );
        const log_fd = openSync(log_path, "a");
        const child = spawn(RELEASE_BIN, forwardArgs, {
            detached: true,
            stdio: ["ignore", log_fd, log_fd],
        });
        child.on("error", (/** @type {Error} */ e) => {
            closeSync(log_fd);
            console.error(`[omni_panel] 后台启动失败：${e.message}`);
            process.exit(1);
        });
        child.on("exit", (code) => {
            closeSync(log_fd);
            if (code !== 0) {
                console.error(`[omni_panel] serve 进程提前退出（code=${String(code)}）；日志：`);
                console.error(`  ${log_path}`);
            }
            process.exit(code ?? 0);
        });
        // 轮询 cli.json 拿服务地址（app 启动成功即写，含 port/url/pid）。
        const cli_json_candidate = join(data_root, "cli.json");
        const cli_json = typeof cli_json_candidate === "string" ? cli_json_candidate : "";
        const deadline = Date.now() + 15_000;
        const poll = setInterval(() => {
            try {
                const parsed = parse_cli_json(cli_json);
                if (!parsed.ok) {
                    // cli.json 未就绪或损坏，继续轮询（或等超时清理）。
                } else {
                    const info = parsed.info;
                    // 仅接受本次启动写入的 cli.json（旧实例残留可能端口不符）。
                    if (info.url && info.pid === child.pid) {
                        clearInterval(poll);
                        process.stdout.write(`OmniPanel CLI mode listening on ${info.url}\n`);
                        console.log(
                            `[omni_panel] 已启动新实例（pid=${String(child.pid)}）；日志：`,
                        );
                        console.log(`  ${log_path}`);
                        console.log(`  停止：omni_panel quit --port ${String(info.port)}`);
                        child.unref();
                        process.exit(0);
                    }
                }
            } catch {
                // cli.json 尚未写出，继续轮询。
            }
            if (Date.now() > deadline) {
                clearInterval(poll);
                closeSync(log_fd);
                // 清理未就绪的 serve 子进程，避免遗留孤儿实例。
                if (child.exitCode === null && !child.killed) {
                    child.kill();
                }
                console.error("[omni_panel] 等待 serve 启动超时；日志：");
                console.error(`  ${log_path}`);
                process.exit(1);
            }
        }, 200);
        // 轮询 interval 保持事件循环活跃，直到 cli.json 出现（成功）或超时（失败）。
        // child 在成功路径才 unref（退出 launcher 后继续后台）。
    } else {
        const child = spawn(RELEASE_BIN, forwardArgs, {
            stdio: ["inherit", "inherit", "pipe"],
        });

        // Electron/Chromium 在无图形会话（headless/WSL 无 dbus）下会向 stderr 打
        // "Failed to connect to the bus" 噪音；应用自身日志已走文件（CLI 模式不刷
        // stdout）。CLI 场景过滤掉 dbus 噪音，用户终端只看到干净输出。
        let stderrBuf = "";
        child.stderr.on("data", (/** @type {Buffer} */ d) => {
            stderrBuf += d.toString();
            const lines = stderrBuf.split("\n");
            stderrBuf = lines.pop() ?? "";
            for (const line of lines) {
                if (/dbus|DBus|object_proxy|bus\.cc/i.test(line)) continue;
                process.stderr.write(line + "\n");
            }
        });
        child.stderr.on("end", () => {
            if (stderrBuf && !/dbus|DBus|object_proxy|bus\.cc/i.test(stderrBuf)) {
                process.stderr.write(stderrBuf);
            }
        });

        child.on("exit", (code) => process.exit(code ?? 0));
    }
}

/**
 * 探测 dataRoot 下 cli.json 记录的实例是否仍在运行。可达返回实例信息，否则 null。
 * cli.json 在实例退出后保留（见 cli-json.ts 注释），所以不可达 = 残留文件 = 无实例。
 * 契约单一来源：CliInstanceInfo 见 ./cli_json_parse.d.mts。
 * @param {string} data_root
 * @returns {Promise<import("./cli_json_parse.d.mts").CliInstanceInfo | null>}
 */
function probe_running_instance(data_root) {
    let info;
    try {
        const candidate = join(data_root, "cli.json");
        const parsed = parse_cli_json(candidate);
        if (!parsed.ok) return Promise.resolve(null);
        info = parsed.info;
    } catch {
        return Promise.resolve(null);
    }
    return new Promise((resolve) => {
        const req = httpGet(
            { host: "localhost", port: info.port, path: "/v1/health", timeout: 1500 },
            (res) => {
                res.resume();
                resolve(info);
            },
        );
        req.on("timeout", () => {
            req.destroy();
            resolve(null);
        });
        req.on("error", () => {
            resolve(null);
        });
    });
}

// 无入口守卫：本文件只作为 bin 直执行（不被 import），`omni_panel --gui` /
// 子命令 / `--cli` 均由 main() 分派。守卫（import.meta.url 对比 argv[1]）在
// symlink 安装（npm link / pnpm i -g 的 bin 软链）下 process.argv[1] 是软链路径、
// import.meta.url 是 realpath，二者不等会静默不执行（t399 review f001）。
await main();
