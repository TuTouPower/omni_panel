import { app } from "electron";
import { CLI_HELP_TEXT } from "../cli/help-text";
import { check_single_instance_lock } from "./single-instance";
import { is_test_build } from "../core/paths";
import { extract_user_argv, resolve_entry, type CliArgs } from "../cli/args";
import { run_background_serve_parent } from "../cli/background_serve";
import { createLogger } from "../../shared/lib/logger";

const process_log = createLogger("process");

export interface CliBootstrapResult {
    readonly cliMode: boolean;
    readonly cli_args: CliArgs;
    readonly has_single_instance_lock: boolean;
}

export function bootstrap_cli_and_locks(): CliBootstrapResult {
    // Suppress EPIPE when stdout pipe is closed (e.g. launched from script with broken pipe)
    process.on("uncaughtException", (err: NodeJS.ErrnoException) => {
        if (err.code === "EPIPE") return;
        process_log.error("Uncaught exception", err);
    });

    process.on("unhandledRejection", (reason: unknown) => {
        process_log.error(
            "Unhandled promise rejection",
            reason instanceof Error ? reason : String(reason),
        );
    });

    // 单一入口：用户 argv → help / gui / cli（含 serve 默认后台）。
    const entry = resolve_entry(extract_user_argv(process.argv), {
        stdout_is_tty: process.stdout.isTTY,
    });
    if (entry.kind === "help") {
        process.stdout.write(CLI_HELP_TEXT);
        process.exit(0);
    }
    if (entry.kind === "invalid") {
        process.stderr.write(`OmniPanel: ${entry.message}\n`);
        process.stdout.write(CLI_HELP_TEXT);
        process.exit(1);
    }
    if (entry.kind === "cli" && entry.background_serve && entry.command.type === "serve") {
        run_background_serve_parent(entry.command.options);
    }
    const cli_args: CliArgs =
        entry.kind === "cli" ? { cli: true, command: entry.command } : { cli: false };
    const cliMode = cli_args.cli;

    // Prevent white screen on systems where GPU process crashes
    app.disableHardwareAcceleration();

    // 测试构建：setName 让单实例锁与 userData 独立于正常实例。
    // app.name 决定 requestSingleInstanceLock 的锁标识与 %APPDATA%/<name> 目录。
    if (is_test_build()) {
        app.setName("OmniPanelTest");
    }

    // t322: serve 支持 `--user-data-dir <path>` 覆盖 userData 目录。
    if (cliMode && cli_args.command?.type === "serve" && cli_args.command.options.userDataDir) {
        app.setPath("userData", cli_args.command.options.userDataDir);
    }

    // Single-instance lock — prevent duplicate app instances.
    let has_single_instance_lock = true;
    const is_thin_client =
        cliMode && cli_args.command !== undefined && cli_args.command.type !== "serve";
    if (!is_thin_client) {
        has_single_instance_lock = check_single_instance_lock(
            () => app.requestSingleInstanceLock(),
            () => {
                app.quit();
            },
        );
    }

    return { cliMode, cli_args, has_single_instance_lock };
}
