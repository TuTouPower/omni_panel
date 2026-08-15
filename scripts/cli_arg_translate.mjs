/**
 * launcher 参数翻译（t399）。命令行语义反转：
 * - 无参 → help（打印 CLI 帮助，不启动任何进程）
 * - --gui → GUI 模式（剥掉 --gui 转发给二进制）
 * - serve/quit/... 等子命令免 --cli 前缀，自动注入 --cli
 * - --cli 前缀兼容保留（主进程唯一 CLI 开关不变，launcher 只做翻译）
 */

export const CLI_COMMANDS = new Set([
    "serve",
    "open",
    "refresh-all",
    "pause",
    "resume",
    "restart",
    "quit",
    "autostart",
    "export",
    "help",
]);

// 带值 flag：后随一个独立 token 作为其值（--port <n> 等）。
const VALUE_FLAGS = new Set(["--port", "--user-data-dir", "--config"]);

/**
 * 翻译 launcher argv 为转发形态。
 * @param {readonly string[]} args
 * @returns {{ mode: "help" | "gui" | "cli" | "invalid", forwardArgs: string[] }}
 */
export function translate_launcher_args(args) {
    if (args.length === 0) return { mode: "help", forwardArgs: [] };

    // --cli 兼容：原样转发。
    if (args.includes("--cli")) return { mode: "cli", forwardArgs: [...args] };

    // --gui 仅首参生效（`omni_panel --gui`）；后置的 --gui（如 serve --gui）按子命令处理，
    // 避免 `serve --gui` 误入 GUI 模式。
    if (args[0] === "--gui") {
        return { mode: "gui", forwardArgs: args.slice(1) };
    }

    // 顶层 --help / -h：打印全局帮助，不启动进程。
    if (args.includes("--help") || args.includes("-h")) {
        return { mode: "help", forwardArgs: [] };
    }

    // 找第一个子命令 token（跳过 flag 及其值）。
    let command = null;
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a.startsWith("-")) {
            if (VALUE_FLAGS.has(a)) i++; // 跳过 flag 的值 token
            continue;
        }
        command = a;
        break;
    }

    if (command === null) return { mode: "help", forwardArgs: [] };
    if (CLI_COMMANDS.has(command)) {
        return { mode: "cli", forwardArgs: ["--cli", ...args] };
    }
    return { mode: "invalid", forwardArgs: [] };
}
