/**
 * 二进制入口 argv 解析（唯一入口语义）。
 *
 * - 终端无参 / help / --help / -h → 打印帮助
 * - 桌面双击（无参且非 TTY）/ --gui → GUI
 * - serve|quit|… → CLI 子命令（无额外开关前缀）
 */

export interface CliServeOptions {
    configPath?: string;
    port?: number;
    /** 覆盖 userData 目录（`--user-data-dir <path>`）。 */
    userDataDir?: string;
    /** 前台运行 serve（默认后台：父进程拉起子进程后退出）。 */
    foreground?: boolean;
}

export interface CliControlOptions {
    port?: number;
}

export interface CliExportOptions {
    port?: number;
    includeSecrets?: boolean;
}

export type CliCommand =
    | { type: "serve"; options: CliServeOptions }
    | { type: "export"; options: CliExportOptions }
    | { type: "help" }
    | {
          type: "open" | "refresh-all" | "pause" | "resume" | "restart" | "quit" | "autostart";
          options: CliControlOptions;
      };

export interface CliArgs {
    cli: boolean;
    command?: CliCommand;
}

/** 入口决议（解析结果 + 是否由本进程做后台 serve 父进程）。 */
export type EntryDecision =
    | { kind: "help" }
    | { kind: "gui" }
    | { kind: "cli"; command: CliCommand; background_serve: boolean }
    | { kind: "invalid"; message: string };

export const CONTROL_COMMANDS = [
    "open",
    "refresh-all",
    "pause",
    "resume",
    "restart",
    "quit",
    "autostart",
] as const;

const CLI_COMMANDS = new Set<string>(["serve", "export", "help", ...CONTROL_COMMANDS]);

const VALUE_FLAGS = new Set(["--port", "--user-data-dir", "--config"]);

export class CliUsageError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "CliUsageError";
    }
}

function parse_port(val: string | undefined, arg: string): number {
    if (val === undefined || val.startsWith("--")) {
        throw new CliUsageError(`${arg} 需要一个端口号参数`);
    }
    const n = Number(val);
    if (!Number.isInteger(n) || n <= 0 || n > 65535) {
        throw new CliUsageError(`无效端口: ${val}`);
    }
    return n;
}

/**
 * 从 process.argv 抽出用户参数（去掉 electron/二进制与主脚本路径）。
 *
 * d055：`_electron.launch` 会在主脚本前注入 Chromium 开关（--no-sandbox 等），
 * 主脚本 `.js` 可能不在 rest[0]。只剥「路径形态」的 `.js` 条目，且跳过
 * `VALUE_FLAGS` 的值位置，避免打包态 `serve --config /tmp/cfg.js` 误删配置路径。
 */
export function extract_user_argv(process_argv: readonly string[]): string[] {
    const rest = process_argv.slice(1);
    const script_idx = rest.findIndex((arg, i) => {
        if (arg.startsWith("-")) return false;
        if (!/\.(c|m)?js$/i.test(arg)) return false;
        const prev = i > 0 ? rest[i - 1] : undefined;
        if (prev !== undefined && VALUE_FLAGS.has(prev)) return false;
        // 开发态常见 rest[0]=index.js；playwright 注入开关后主脚本在中间且为路径形态。
        if (i === 0) return true;
        return /[/\\]/.test(arg);
    });
    if (script_idx >= 0) {
        return rest.filter((_, i) => i !== script_idx);
    }
    return [...rest];
}

function find_command_index(args: readonly string[]): number {
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === undefined) break;
        if (a.startsWith("-")) {
            if (VALUE_FLAGS.has(a)) i++;
            continue;
        }
        return i;
    }
    return -1;
}

function parse_serve_options(tokens: readonly string[]): CliServeOptions {
    const options: CliServeOptions = {};
    let i = 0;
    while (i < tokens.length) {
        const tok = tokens[i];
        if (tok === undefined) break;
        if (tok === "--config") {
            const val = tokens[i + 1];
            if (val === undefined || val.startsWith("--")) {
                throw new CliUsageError("--config 需要一个文件路径参数");
            }
            options.configPath = val;
            i += 2;
        } else if (tok === "--port") {
            options.port = parse_port(tokens[i + 1], "--port");
            i += 2;
        } else if (tok === "--user-data-dir") {
            const val = tokens[i + 1];
            if (val === undefined || val.startsWith("--")) {
                throw new CliUsageError("--user-data-dir 需要一个目录路径参数");
            }
            options.userDataDir = val;
            i += 2;
        } else if (tok === "--foreground") {
            options.foreground = true;
            i += 1;
        } else if (tok.startsWith("--")) {
            i += 1;
        } else {
            throw new CliUsageError(`意外位置参数: ${tok}`);
        }
    }
    return options;
}

function parse_export_options(tokens: readonly string[]): CliExportOptions {
    const options: CliExportOptions = {};
    let i = 0;
    while (i < tokens.length) {
        const tok = tokens[i];
        if (tok === undefined) break;
        if (tok === "--include-secrets") {
            options.includeSecrets = true;
            i += 1;
        } else if (tok === "--port") {
            options.port = parse_port(tokens[i + 1], "--port");
            options.includeSecrets ??= false;
            i += 2;
        } else if (tok.startsWith("--")) {
            i += 1;
        } else {
            throw new CliUsageError(`意外位置参数: ${tok}`);
        }
    }
    return options;
}

function parse_control_options(tokens: readonly string[]): CliControlOptions {
    const options: CliControlOptions = {};
    let i = 0;
    while (i < tokens.length) {
        const tok = tokens[i];
        if (tok === undefined) break;
        if (tok === "--port") {
            options.port = parse_port(tokens[i + 1], "--port");
            i += 2;
        } else if (tok.startsWith("--")) {
            i += 1;
        } else {
            throw new CliUsageError(`意外位置参数: ${tok}`);
        }
    }
    return options;
}

/**
 * 解析用户 argv → 入口决议。
 * @param stdout_is_tty 终端无参时打印帮助；非 TTY（桌面图标）无参开 GUI
 */
export function resolve_entry(
    user_args: readonly string[],
    opts: { stdout_is_tty: boolean },
): EntryDecision {
    if (user_args.length === 0) {
        return opts.stdout_is_tty ? { kind: "help" } : { kind: "gui" };
    }

    if (user_args[0] === "--gui") {
        return { kind: "gui" };
    }

    if (user_args.includes("--help") || user_args.includes("-h")) {
        return { kind: "help" };
    }

    const cmd_idx = find_command_index(user_args);
    if (cmd_idx < 0) {
        // 仅有 Chromium/Electron 开关、无子命令：与无参相同（终端 help / 桌面 GUI）
        return opts.stdout_is_tty ? { kind: "help" } : { kind: "gui" };
    }

    const command = user_args[cmd_idx];
    if (command === undefined) {
        return opts.stdout_is_tty ? { kind: "help" } : { kind: "gui" };
    }

    if (command === "help") {
        return { kind: "help" };
    }

    if (!CLI_COMMANDS.has(command)) {
        return { kind: "invalid", message: `未知命令: ${command}` };
    }

    const tail = user_args.filter((_, i) => i !== cmd_idx);

    try {
        if (command === "serve") {
            const options = parse_serve_options(tail);
            const background_serve = options.foreground !== true;
            return {
                kind: "cli",
                command: { type: "serve", options },
                background_serve,
            };
        }
        if (command === "export") {
            return {
                kind: "cli",
                command: { type: "export", options: parse_export_options(tail) },
                background_serve: false,
            };
        }
        const control = CONTROL_COMMANDS.find((c) => c === command);
        if (!control) {
            return { kind: "invalid", message: `未知命令: ${command}` };
        }
        return {
            kind: "cli",
            command: { type: control, options: parse_control_options(tail) },
            background_serve: false,
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { kind: "invalid", message };
    }
}

/** 供测试与内部：用户 argv → CliArgs（后台 serve 仍标 cli=true）。 */
export function parse_cli_args(
    process_argv: readonly string[],
    opts?: { stdout_is_tty?: boolean },
): CliArgs {
    const user = extract_user_argv(process_argv);
    const entry = resolve_entry(user, {
        stdout_is_tty: opts?.stdout_is_tty ?? true,
    });
    if (entry.kind === "gui") return { cli: false };
    if (entry.kind === "help") return { cli: true, command: { type: "help" } };
    if (entry.kind === "invalid") throw new CliUsageError(entry.message);
    return { cli: true, command: entry.command };
}
