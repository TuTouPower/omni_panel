/**
 * CLI 模式 argv 解析（t275 serve + t276 控制子命令）。
 *
 * 语法：
 *   `--cli serve [--config <path>] [--port <n>]`   无窗口常驻服务（t275）
 *   `--cli open|refresh-all|pause|resume|restart|quit|autostart [--port <n>]`
 *                                                   瘦客户端，执行即退出（t276）
 * - `--cli` 是 CLI 模式总开关
 * - `--config` 仅 serve 支持：启动时导入配置文件（明文 secret 内嵌），覆盖写入规范 config.json
 * - `--port` 覆盖 local-api 端口（serve：监听端口；控制命令：实例发现覆盖）
 *
 * 解析器是纯函数，只处理 `--cli` 之后的 token；Electron/Chromium 自身 switch
 * （`--user-data-dir` 等）在 `--cli` 之前或之后出现均不影响本解析。
 */

export interface CliServeOptions {
    configPath?: string;
    port?: number;
    /** 覆盖 userData 目录（`--user-data-dir <path>`）；serve 时生效，影响 getDataRoot。 */
    userDataDir?: string;
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
    | {
          type: "open" | "refresh-all" | "pause" | "resume" | "restart" | "quit" | "autostart";
          options: CliControlOptions;
      };

export interface CliArgs {
    cli: boolean;
    command?: CliCommand;
}

/** 控制子命令白名单。 */
export const CONTROL_COMMANDS = [
    "open",
    "refresh-all",
    "pause",
    "resume",
    "restart",
    "quit",
    "autostart",
] as const;

/** 用法错误：调用方转非零退出码 + 可读信息，不留半初始化状态（AC8）。 */
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

export function parse_cli_args(argv: readonly string[]): CliArgs {
    const idx = argv.indexOf("--cli");
    if (idx === -1) return { cli: false };
    const rest = argv.slice(idx + 1);

    const sub = rest[0];
    if (sub === undefined) {
        throw new CliUsageError(
            "--cli 需要子命令（serve / open / refresh-all / pause / resume / restart / quit / autostart）",
        );
    }

    // serve：常驻子命令，支持 --config 与 --port。
    if (sub === "serve") {
        const options: CliServeOptions = {};
        let i = 1;
        while (i < rest.length) {
            const tok = rest[i];
            if (tok === undefined) break;
            if (tok === "--config") {
                const val = rest[i + 1];
                if (val === undefined || val.startsWith("--")) {
                    throw new CliUsageError("--config 需要一个文件路径参数");
                }
                options.configPath = val;
                i += 2;
            } else if (tok === "--port") {
                options.port = parse_port(rest[i + 1], "--port");
                i += 2;
            } else if (tok === "--user-data-dir") {
                const val = rest[i + 1];
                if (val === undefined || val.startsWith("--")) {
                    throw new CliUsageError("--user-data-dir 需要一个目录路径参数");
                }
                options.userDataDir = val;
                i += 2;
            } else if (tok.startsWith("--")) {
                // 未知 `--` 开关视为 Electron/Chromium 级参数，跳过。
                i += 1;
            } else {
                throw new CliUsageError(`意外位置参数: ${tok}`);
            }
        }
        return { cli: true, command: { type: "serve", options } };
    }

    if (sub === "export") {
        const options: CliExportOptions = {};
        let i = 1;
        while (i < rest.length) {
            const tok = rest[i];
            if (tok === undefined) break;
            if (tok === "--include-secrets") {
                options.includeSecrets = true;
                i += 1;
            } else if (tok === "--port") {
                options.port = parse_port(rest[i + 1], "--port");
                options.includeSecrets ??= false;
                i += 2;
            } else if (tok.startsWith("--")) {
                i += 1;
            } else {
                throw new CliUsageError(`意外位置参数: ${tok}`);
            }
        }
        return { cli: true, command: { type: "export", options } };
    }

    // 控制子命令：瘦客户端，支持 --port 覆盖实例发现。
    const command = CONTROL_COMMANDS.find((c) => c === sub);
    if (!command) {
        throw new CliUsageError(`未知的 --cli 子命令: ${sub}`);
    }
    const options: CliControlOptions = {};
    let i = 1;
    while (i < rest.length) {
        const tok = rest[i];
        if (tok === undefined) break;
        if (tok === "--port") {
            options.port = parse_port(rest[i + 1], "--port");
            i += 2;
        } else if (tok.startsWith("--")) {
            i += 1;
        } else {
            throw new CliUsageError(`意外位置参数: ${tok}`);
        }
    }
    return { cli: true, command: { type: command, options } };
}
