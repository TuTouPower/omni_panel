/**
 * CLI 模式 argv 解析（t275）。
 *
 * 语法：`--cli serve [--config <path>] [--port <n>]`
 * - `--cli` 是 CLI 模式总开关，本 task 只实现 `serve` 子命令
 * - `--config` 指定启动时导入的配置文件（明文 secret 内嵌），覆盖写入规范 config.json
 * - `--port` 覆盖 local-api 监听端口（优先级高于 `OMNI_PANEL_PORT` 环境变量）
 *
 * 解析器是纯函数，只处理 `--cli` 之后的 token；Electron/Chromium 自身 switch
 * （`--user-data-dir` 等）在 `--cli` 之前或之后出现均不影响本解析。
 */

export interface CliServeOptions {
    configPath?: string;
    port?: number;
}

export interface CliArgs {
    cli: boolean;
    serve?: CliServeOptions;
}

/** 用法错误：调用方转非零退出码 + 可读信息，不留半初始化状态（AC8）。 */
export class CliUsageError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "CliUsageError";
    }
}

export function parse_cli_args(argv: readonly string[]): CliArgs {
    const idx = argv.indexOf("--cli");
    if (idx === -1) return { cli: false };
    const rest = argv.slice(idx + 1);

    const sub = rest[0];
    if (sub === undefined) {
        throw new CliUsageError("--cli 需要子命令（当前支持：serve）");
    }
    if (sub !== "serve") {
        throw new CliUsageError(`未知的 --cli 子命令: ${sub}（当前支持：serve）`);
    }

    const serve: CliServeOptions = {};
    let i = 1;
    while (i < rest.length) {
        const tok = rest[i];
        if (tok === undefined) break;
        if (tok === "--config") {
            const val = rest[i + 1];
            if (val === undefined || val.startsWith("--")) {
                throw new CliUsageError("--config 需要一个文件路径参数");
            }
            serve.configPath = val;
            i += 2;
        } else if (tok === "--port") {
            const val = rest[i + 1];
            if (val === undefined || val.startsWith("--")) {
                throw new CliUsageError("--port 需要一个端口号参数");
            }
            const n = Number(val);
            if (!Number.isInteger(n) || n <= 0 || n > 65535) {
                throw new CliUsageError(`无效端口: ${val}`);
            }
            serve.port = n;
            i += 2;
        } else if (tok.startsWith("--")) {
            // 未知 `--` 开关视为 Electron/Chromium 级参数（--user-data-dir、
            // --disable-gpu 等），CLI 子命令解析跳过，不影响 serve 参数校验。
            i += 1;
        } else {
            throw new CliUsageError(`意外位置参数: ${tok}`);
        }
    }
    return { cli: true, serve };
}
