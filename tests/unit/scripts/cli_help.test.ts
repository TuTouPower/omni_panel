import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { CLI_HELP_TEXT } from "../../../scripts/cli_help.mjs";
import { translate_launcher_args } from "../../../scripts/cli_arg_translate.mjs";

/** 四入口（无参 / --help / -h / help）均应落到 launcher help 模式，不转发主进程。 */
const LAUNCHER_HELP_ARGS: readonly (readonly string[])[] = [[], ["--help"], ["-h"], ["help"]];

const REQUIRED_SUBCOMMANDS = [
    "serve",
    "open",
    "refresh-all",
    "pause",
    "resume",
    "restart",
    "quit",
    "autostart",
    "export",
] as const;

describe("CLI_HELP_TEXT 单一真相源（t400）", () => {
    it("AC-002: 含 --gui 用法与全部 CLI 子命令", () => {
        expect(CLI_HELP_TEXT).toContain("omni_panel --gui");
        expect(CLI_HELP_TEXT).toMatch(/启动图形界面/);
        for (const cmd of REQUIRED_SUBCOMMANDS) {
            expect(CLI_HELP_TEXT).toContain(cmd);
        }
    });

    it("AC-001: 四入口均解析为 help 模式（launcher 直接打印，不 spawn 主进程）", () => {
        for (const args of LAUNCHER_HELP_ARGS) {
            expect(translate_launcher_args(args), `args=${JSON.stringify(args)}`).toEqual({
                mode: "help",
                forwardArgs: [],
            });
        }
    });

    it("AC-003: --cli help 仍转发主进程（由主进程打印同一 CLI_HELP_TEXT）", () => {
        expect(translate_launcher_args(["--cli", "help"])).toEqual({
            mode: "cli",
            forwardArgs: ["--cli", "help"],
        });
    });

    it("AC-004: launcher 与主进程均引用 scripts/cli_help.mjs，无内联旧帮助正文", () => {
        const root = resolve(__dirname, "../../..");
        const launcher = readFileSync(resolve(root, "scripts/omni_panel.mjs"), "utf8");
        const main = readFileSync(resolve(root, "src/main/index.ts"), "utf8");

        expect(launcher).toMatch(/from\s+["']\.\/cli_help\.mjs["']/);
        expect(main).toMatch(/from\s+["'][^"']*cli_help\.mjs["']/);

        // 旧主进程内联标题不得残留
        expect(main).not.toContain("OmniPanel CLI 子命令：");
        // 旧 launcher 内联多行拼接不得残留（以唯一旧开场白为锚）
        expect(launcher).not.toMatch(
            /const\s+HELP_TEXT\s*=\s*[\s\S]*OmniPanel CLI\\n/,
        );
    });

    it("帮助文本以换行结尾且为非空字符串", () => {
        expect(typeof CLI_HELP_TEXT).toBe("string");
        expect(CLI_HELP_TEXT.length).toBeGreaterThan(40);
        expect(CLI_HELP_TEXT.endsWith("\n")).toBe(true);
    });
});
