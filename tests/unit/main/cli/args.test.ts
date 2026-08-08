import { describe, it, expect } from "vitest";
import { parse_cli_args, CliUsageError } from "../../../../src/main/cli/args";

describe("parse_cli_args", () => {
    it("无 --cli 返回 { cli: false }", () => {
        expect(parse_cli_args(["electron", "out/main/index.js"])).toEqual({ cli: false });
    });

    it("--cli serve 合法：无附加参数", () => {
        expect(parse_cli_args(["electron", "index.js", "--cli", "serve"])).toEqual({
            cli: true,
            serve: {},
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
        ).toEqual({ cli: true, serve: { configPath: "/tmp/import.json" } });
    });

    it("--cli serve --port 12345 解析端口", () => {
        expect(
            parse_cli_args(["electron", "index.js", "--cli", "serve", "--port", "12345"]),
        ).toEqual({ cli: true, serve: { port: 12345 } });
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
        ).toEqual({ cli: true, serve: { configPath: "/tmp/import.json", port: 9999 } });
    });

    it("Electron 自带 switch（--user-data-dir）不影响 --cli 解析", () => {
        expect(
            parse_cli_args(["electron", "index.js", "--user-data-dir=/tmp/data", "--cli", "serve"]),
        ).toEqual({ cli: true, serve: {} });
    });

    it("缺子命令抛 CliUsageError", () => {
        expect(() => parse_cli_args(["electron", "index.js", "--cli"])).toThrow(CliUsageError);
    });

    it("未知子命令抛 CliUsageError", () => {
        expect(() => parse_cli_args(["electron", "index.js", "--cli", "refresh-all"])).toThrow(
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
        ).toEqual({ cli: true, serve: {} });
    });

    it("位置参数抛 CliUsageError", () => {
        expect(() => parse_cli_args(["electron", "index.js", "--cli", "serve", "stray"])).toThrow(
            /意外位置参数/,
        );
    });
});
