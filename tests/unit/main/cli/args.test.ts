import { describe, it, expect } from "vitest";
import {
    parse_cli_args,
    resolve_entry,
    extract_user_argv,
    CliUsageError,
} from "../../../../src/main/cli/args";
import { CLI_HELP_TEXT } from "../../../../src/main/cli/help-text";

describe("extract_user_argv", () => {
    it("打包二进制：去掉 execPath", () => {
        expect(extract_user_argv(["/opt/omni_panel", "serve", "--port", "1"])).toEqual([
            "serve",
            "--port",
            "1",
        ]);
    });

    it("electron 开发：去掉主脚本路径", () => {
        expect(
            extract_user_argv(["electron", "out/main/index.js", "serve", "--foreground"]),
        ).toEqual(["serve", "--foreground"]);
    });
});

describe("resolve_entry", () => {
    it("终端无参 → help", () => {
        expect(resolve_entry([], { stdout_is_tty: true })).toEqual({ kind: "help" });
    });

    it("非 TTY 无参 → gui（桌面图标）", () => {
        expect(resolve_entry([], { stdout_is_tty: false })).toEqual({ kind: "gui" });
    });

    it("--gui → gui", () => {
        expect(resolve_entry(["--gui"], { stdout_is_tty: true })).toEqual({ kind: "gui" });
    });

    it("--help / -h / help → help", () => {
        expect(resolve_entry(["--help"], { stdout_is_tty: true })).toEqual({ kind: "help" });
        expect(resolve_entry(["-h"], { stdout_is_tty: true })).toEqual({ kind: "help" });
        expect(resolve_entry(["help"], { stdout_is_tty: true })).toEqual({ kind: "help" });
    });

    it("serve 默认 background_serve", () => {
        expect(resolve_entry(["serve"], { stdout_is_tty: true })).toEqual({
            kind: "cli",
            command: { type: "serve", options: {} },
            background_serve: true,
        });
    });

    it("serve --foreground → 前台", () => {
        expect(resolve_entry(["serve", "--foreground"], { stdout_is_tty: true })).toEqual({
            kind: "cli",
            command: { type: "serve", options: { foreground: true } },
            background_serve: false,
        });
    });

    it("未知命令 → invalid", () => {
        expect(resolve_entry(["frobnicate"], { stdout_is_tty: true })).toEqual({
            kind: "invalid",
            message: "未知命令: frobnicate",
        });
    });
});

describe("parse_cli_args", () => {
    it("无用户参数（GUI）", () => {
        expect(parse_cli_args(["electron", "out/main/index.js"], { stdout_is_tty: false })).toEqual(
            { cli: false },
        );
    });

    it("serve 合法：无附加参数", () => {
        expect(parse_cli_args(["electron", "index.js", "serve"])).toEqual({
            cli: true,
            command: { type: "serve", options: {} },
        });
    });

    it("serve --config <path> 解析 configPath", () => {
        expect(
            parse_cli_args(["electron", "index.js", "serve", "--config", "/tmp/import.json"]),
        ).toEqual({
            cli: true,
            command: { type: "serve", options: { configPath: "/tmp/import.json" } },
        });
    });

    it("serve --port 12345 解析端口", () => {
        expect(parse_cli_args(["electron", "index.js", "serve", "--port", "12345"])).toEqual({
            cli: true,
            command: { type: "serve", options: { port: 12345 } },
        });
    });

    it("--config 与 --port 组合", () => {
        expect(
            parse_cli_args([
                "electron",
                "index.js",
                "serve",
                "--config",
                "/tmp/import.json",
                "--port",
                "9999",
            ]),
        ).toEqual({
            cli: true,
            command: {
                type: "serve",
                options: { configPath: "/tmp/import.json", port: 9999 },
            },
        });
    });

    it("serve --user-data-dir <path> 解析 userDataDir", () => {
        expect(
            parse_cli_args(["electron", "index.js", "serve", "--user-data-dir", "/tmp/data"]),
        ).toEqual({
            cli: true,
            command: { type: "serve", options: { userDataDir: "/tmp/data" } },
        });
    });

    it("--user-data-dir 缺参数抛 CliUsageError", () => {
        expect(() => parse_cli_args(["electron", "index.js", "serve", "--user-data-dir"])).toThrow(
            /--user-data-dir 需要一个目录路径参数/,
        );
    });

    it("help 解析为 help 命令", () => {
        expect(parse_cli_args(["electron", "index.js", "help"])).toEqual({
            cli: true,
            command: { type: "help" },
        });
    });

    it("未知子命令抛 CliUsageError", () => {
        expect(() => parse_cli_args(["electron", "index.js", "deploy"])).toThrow(CliUsageError);
    });

    it("--config 缺参数抛 CliUsageError", () => {
        expect(() => parse_cli_args(["electron", "index.js", "serve", "--config"])).toThrow(
            /--config 需要一个文件路径参数/,
        );
    });

    it("--port 非数字抛 CliUsageError", () => {
        expect(() => parse_cli_args(["electron", "index.js", "serve", "--port", "abc"])).toThrow(
            /无效端口/,
        );
    });

    it("--port 越界抛 CliUsageError", () => {
        expect(() => parse_cli_args(["electron", "index.js", "serve", "--port", "70000"])).toThrow(
            /无效端口/,
        );
    });

    it.each(["open", "refresh-all", "pause", "resume", "restart", "quit", "autostart"] as const)(
        "%s 解析为控制命令",
        (cmd) => {
            expect(parse_cli_args(["electron", "index.js", cmd])).toEqual({
                cli: true,
                command: { type: cmd, options: {} },
            });
        },
    );

    it("refresh-all --port", () => {
        expect(parse_cli_args(["electron", "index.js", "refresh-all", "--port", "12345"])).toEqual({
            cli: true,
            command: { type: "refresh-all", options: { port: 12345 } },
        });
    });

    it("export --include-secrets", () => {
        expect(parse_cli_args(["electron", "index.js", "export", "--include-secrets"])).toEqual({
            cli: true,
            command: { type: "export", options: { includeSecrets: true } },
        });
    });

    it("export --port", () => {
        expect(parse_cli_args(["electron", "index.js", "export", "--port", "18263"])).toEqual({
            cli: true,
            command: {
                type: "export",
                options: { port: 18263, includeSecrets: false },
            },
        });
    });
});

describe("CLI_HELP_TEXT", () => {
    it("覆盖全部 CLI 子命令与 --gui", () => {
        expect(CLI_HELP_TEXT).toContain("--gui");
        expect(CLI_HELP_TEXT).toContain("serve");
        for (const cmd of [
            "open",
            "refresh-all",
            "pause",
            "resume",
            "restart",
            "quit",
            "autostart",
        ]) {
            expect(CLI_HELP_TEXT).toContain(cmd);
        }
        expect(CLI_HELP_TEXT).toContain("export");
        expect(CLI_HELP_TEXT).toContain("--include-secrets");
        expect(CLI_HELP_TEXT).toContain("--help");
    });
});
