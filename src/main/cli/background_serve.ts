/**
 * serve 默认后台：父进程 spawn 自身（带 --foreground），轮询 cli.json 后 exit。
 * 同步实现，在 index 顶层、app 初始化前完成。
 */
import { spawn, spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { format_local_iso } from "../../shared/lib/local-time";
import { parse_cli_json } from "../../../scripts/cli_json_parse.mjs";
import type { CliServeOptions } from "./args";

/** 单轮启动探测结果:父进程据此决定 继续等待 / 成功退出 / 失败退出。 */
export type PollOutcome =
    | { kind: "continue" }
    | { kind: "ready"; url: string; port: number }
    | { kind: "exited"; code: number }
    | { kind: "exited_code0" };

interface PollInput {
    /** 子进程退出码;null = 仍在运行。 */
    exitCode: number | null;
    childPid: number;
    cliInfo: { port: number; url?: string; pid?: number } | null;
}

/**
 * 判定单轮后台启动探测结果。
 * 顺序有意固定:退出优先于 cli.json——子进程一旦退出(code 0 或非 0)即失败,
 * 不再把它当「仍在启动」空等。code 0 对应 Electron 单实例锁冲突等静默早退
 * (app.quit() 在日志初始化前,serve 日志 0 字节)。
 */
export function classify_poll_result(input: PollInput): PollOutcome {
    const { exitCode, childPid, cliInfo } = input;
    if (exitCode !== null && exitCode !== 0) return { kind: "exited", code: exitCode };
    if (exitCode === 0) return { kind: "exited_code0" };
    if (cliInfo?.pid === childPid && cliInfo.url) {
        return { kind: "ready", url: cliInfo.url, port: cliInfo.port };
    }
    return { kind: "continue" };
}

/** 子进程早退诊断文案:按退出形态输出可诊断提示,均含 serve 日志路径。 */
export function build_early_exit_msg(
    msg: { kind: "exited_code0" } | { kind: "exited"; code: number },
    log_path: string,
): string {
    if (msg.kind === "exited_code0") {
        return (
            `[omni_panel] serve 进程启动即退出（code=0）。通常为单实例锁冲突——另一实例正在启动或关闭。` +
            `若刚执行过 quit 请稍候重试；日志：\n  ${log_path}\n`
        );
    }
    return `[omni_panel] serve 进程提前退出（code=${String(msg.code)}）；日志：\n  ${log_path}\n`;
}

function data_root_from_options(options: CliServeOptions): string {
    if (options.userDataDir) return resolve(options.userDataDir);
    return join(homedir(), ".config", "OmniPanel");
}

function build_child_user_args(options: CliServeOptions): string[] {
    const args = ["serve", "--foreground"];
    if (options.port !== undefined) {
        args.push("--port", String(options.port));
    }
    if (options.userDataDir) {
        args.push("--user-data-dir", options.userDataDir);
    }
    if (options.configPath) {
        args.push("--config", options.configPath);
    }
    return args;
}

export function spawn_self_args(user_args: readonly string[]): {
    command: string;
    args: string[];
} {
    const command = process.execPath;
    if (process.defaultApp && process.argv[1]) {
        return { command, args: [process.argv[1], ...user_args] };
    }
    return { command, args: [...user_args] };
}

function sleep_ms(ms: number): void {
    const sab = new SharedArrayBuffer(4);
    const ia = new Int32Array(sab);
    Atomics.wait(ia, 0, 0, ms);
}

/** 同步 health：用 PATH 上的 node 发一次 HTTP（execPath 可能是 electron）。 */
function health_reachable(port: number): boolean {
    const script =
        `require("http").get({host:"127.0.0.1",port:${String(port)},path:"/v1/health",timeout:1500},` +
        `(r)=>{r.resume();process.exit(r.statusCode&&r.statusCode<500?0:1)}).on("error",()=>process.exit(1))` +
        `.on("timeout",function(){this.destroy();process.exit(1)})`;
    const r = spawnSync("node", ["-e", script], { timeout: 2500, encoding: "utf8" });
    return r.status === 0;
}

export function probe_running_instance_sync(
    data_root: string,
): { port: number; pid: number; url?: string } | null {
    const candidate = join(data_root, "cli.json");
    const parsed = parse_cli_json(candidate);
    if (!parsed.ok) return null;
    const info = parsed.info;
    return health_reachable(info.port) ? info : null;
}

/**
 * 父进程：冲突检测 → 后台子进程 → 打印 URL → process.exit（不返回）。
 */
export function run_background_serve_parent(options: CliServeOptions): never {
    const data_root = data_root_from_options(options);
    const running = probe_running_instance_sync(data_root);
    if (running) {
        process.stderr.write(
            `[omni_panel] 实例已在运行（pid=${String(running.pid)}，port=${String(running.port)}）。如需重启请先停止：\n` +
                `  omni_panel quit --port ${String(running.port)}\n`,
        );
        process.exit(1);
    }

    const log_dir = join(data_root, "logs");
    mkdirSync(log_dir, { recursive: true });
    const log_path = join(log_dir, `serve-${format_local_iso().replace(/[:+.]/g, "-")}.log`);
    const log_fd = openSync(log_path, "a");
    const child_user = build_child_user_args(options);
    const { command, args } = spawn_self_args(child_user);
    const child = spawn(command, args, {
        detached: true,
        stdio: ["ignore", log_fd, log_fd],
        env: process.env,
    });

    child.on("error", (e: Error) => {
        closeSync(log_fd);
        process.stderr.write(`[omni_panel] 后台启动失败：${e.message}\n`);
        process.exit(1);
    });

    const cli_json = join(data_root, "cli.json");
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
        const parsed = parse_cli_json(cli_json);
        const outcome = classify_poll_result({
            exitCode: child.exitCode,
            childPid: child.pid ?? 0,
            cliInfo: parsed.ok ? parsed.info : null,
        });
        if (outcome.kind === "exited") {
            closeSync(log_fd);
            process.stderr.write(
                build_early_exit_msg({ kind: "exited", code: outcome.code }, log_path),
            );
            process.exit(outcome.code);
        }
        if (outcome.kind === "exited_code0") {
            closeSync(log_fd);
            process.stderr.write(build_early_exit_msg({ kind: "exited_code0" }, log_path));
            process.exit(1);
        }
        if (outcome.kind === "ready") {
            process.stdout.write(`OmniPanel CLI mode listening on ${outcome.url}\n`);
            process.stderr.write(
                `[omni_panel] 已启动新实例（pid=${String(child.pid)}）；日志：\n` +
                    `  ${log_path}\n` +
                    `  停止：omni_panel quit --port ${String(outcome.port)}\n`,
            );
            child.unref();
            closeSync(log_fd);
            process.exit(0);
        }
        sleep_ms(200);
    }

    closeSync(log_fd);
    if (child.exitCode === null && !child.killed) {
        child.kill();
    }
    process.stderr.write(`[omni_panel] 等待 serve 启动超时；日志：\n  ${log_path}\n`);
    process.exit(1);
}
