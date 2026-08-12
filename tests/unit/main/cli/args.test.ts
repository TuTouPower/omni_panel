import { describe, it, expect } from "vitest";
import { parse_cli_args, CliUsageError } from "../../../../src/main/cli/args";

describe("parse_cli_args", () => {
    it("无 --cli 返回 { cli: false }", () => {
        expect(parse_cli_args(["electron", "out/main/index.js"])).toEqual({ cli: false });
    });

    it("--cli serve 合法：无附加参数", () => {
        expect(parse_cli_args(["electron", "index.js", "--cli", "serve"])).toEqual({
            cli: true,
            command: { type: "serve", options: {} },
        });
    });

    it("--cli serve --config <path> 解析 configPath", () => {
        expect(
            parse_cli_args([
                "electron",
                "index.js",
                "--cli",
                "serve",
                "--config",
                "/tmp/import.json",
            ]),
        ).toEqual({
            cli: true,
            command: { type: "serve", options: { configPath: "/tmp/import.json" } },
        });
    });

    it("--cli serve --port 12345 解析端口", () => {
        expect(
            parse_cli_args(["electron", "index.js", "--cli", "serve", "--port", "12345"]),
        ).toEqual({ cli: true, command: { type: "serve", options: { port: 12345 } } });
    });

    it("--config 与 --port 组合", () => {
        expect(
            parse_cli_args([
                "electron",
                "index.js",
                "--cli",
                "serve",
                "--config",
                "/tmp/import.json",
                "--port",
                "9999",
            ]),
        ).toEqual({
            cli: true,
            command: { type: "serve", options: { configPath: "/tmp/import.json", port: 9999 } },
        });
    });

    it("Electron 自带 switch（--user-data-dir=）不影响 --cli 解析", () => {
        expect(
            parse_cli_args(["electron", "index.js", "--user-data-dir=/tmp/data", "--cli", "serve"]),
        ).toEqual({ cli: true, command: { type: "serve", options: {} } });
    });

    it("--cli serve --user-data-dir <path> 解析 userDataDir", () => {
        expect(
            parse_cli_args([
                "electron",
                "index.js",
                "--cli",
                "serve",
                "--user-data-dir",
                "/tmp/data",
            ]),
        ).toEqual({ cli: true, command: { type: "serve", options: { userDataDir: "/tmp/data" } } });
    });

    it("--user-data-dir 缺参数抛 CliUsageError", () => {
        expect(() =>
            parse_cli_args(["electron", "index.js", "--cli", "serve", "--user-data-dir"]),
        ).toThrow(/--user-data-dir 需要一个目录路径参数/);
    });

    it("缺子命令抛 CliUsageError", () => {
        expect(() => parse_cli_args(["electron", "index.js", "--cli"])).toThrow(CliUsageError);
    });

    it("未知子命令抛 CliUsageError", () => {
        expect(() => parse_cli_args(["electron", "index.js", "--cli", "deploy"])).toThrow(
            /未知的 --cli 子命令/,
        );
    });

    it("--config 缺参数抛 CliUsageError", () => {
        expect(() =>
            parse_cli_args(["electron", "index.js", "--cli", "serve", "--config"]),
        ).toThrow(/--config 需要一个文件路径参数/);
    });

    it("--port 非数字抛 CliUsageError", () => {
        expect(() =>
            parse_cli_args(["electron", "index.js", "--cli", "serve", "--port", "abc"]),
        ).toThrow(/无效端口/);
    });

    it("--port 越界抛 CliUsageError", () => {
        expect(() =>
            parse_cli_args(["electron", "index.js", "--cli", "serve", "--port", "70000"]),
        ).toThrow(/无效端口/);
    });

    it("未知 -- 开关忽略（Electron/Chromium 级参数）", () => {
        expect(
            parse_cli_args(["electron", "index.js", "--cli", "serve", "--user-data-dir=/tmp/d"]),
        ).toEqual({ cli: true, command: { type: "serve", options: {} } });
    });

    it("位置参数抛 CliUsageError", () => {
        expect(() => parse_cli_args(["electron", "index.js", "--cli", "serve", "stray"])).toThrow(
            /意外位置参数/,
        );
    });
});

describe("parse_cli_args 控制子命令（t276）", () => {
    it.each(["open", "refresh-all", "pause", "resume", "restart", "quit", "autostart"] as const)(
        "--cli %s 解析为控制命令",
        (cmd) => {
            expect(parse_cli_args(["electron", "index.js", "--cli", cmd])).toEqual({
                cli: true,
                command: { type: cmd, options: {} },
            });
        },
    );

    it("控制子命令支持 --port 覆盖", () => {
        expect(
            parse_cli_args(["electron", "index.js", "--cli", "refresh-all", "--port", "12345"]),
        ).toEqual({ cli: true, command: { type: "refresh-all", options: { port: 12345 } } });
    });

    it("控制子命令拒绝 --config", () => {
        expect(() =>
            parse_cli_args(["electron", "index.js", "--cli", "quit", "--config", "/tmp/x.json"]),
        ).toThrow(/意外位置参数/);
    });

    it("serve 不识别 --config 之外的未知位置参数", () => {
        expect(() => parse_cli_args(["electron", "index.js", "--cli", "pause", "stray"])).toThrow(
            /意外位置参数/,
        );
    });
});

describe("parse_cli_args export（t277）", () => {
    it("解析 --cli export --include-secrets", () => {
        expect(
            parse_cli_args(["electron", "index.js", "--cli", "export", "--include-secrets"]),
        ).toEqual({
            cli: true,
            command: { type: "export", options: { includeSecrets: true } },
        });
    });

    it("export 支持 --port 且默认不含 secrets", () => {
        expect(
            parse_cli_args(["electron", "index.js", "--cli", "export", "--port", "18263"]),
        ).toEqual({
            cli: true,
            command: { type: "export", options: { port: 18263, includeSecrets: false } },
        });
    });

    it("export 拒绝位置参数", () => {
        expect(() => parse_cli_args(["electron", "index.js", "--cli", "export", "stray"])).toThrow(
            /意外位置参数/,
        );
    });
});
