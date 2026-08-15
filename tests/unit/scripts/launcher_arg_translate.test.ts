import { describe, it, expect } from "vitest";
import { translate_launcher_args, CLI_COMMANDS } from "../../../scripts/cli_arg_translate.mjs";

describe("translate_launcher_args", () => {
    it("无参 → help", () => {
        expect(translate_launcher_args([])).toEqual({ mode: "help", forwardArgs: [] });
    });

    it("--help / -h → help", () => {
        expect(translate_launcher_args(["--help"])).toEqual({ mode: "help", forwardArgs: [] });
        expect(translate_launcher_args(["-h"])).toEqual({ mode: "help", forwardArgs: [] });
    });

    it("--gui → gui，剥掉 --gui 转发", () => {
        expect(translate_launcher_args(["--gui"])).toEqual({ mode: "gui", forwardArgs: [] });
        expect(translate_launcher_args(["--gui", "foo"])).toEqual({
            mode: "gui",
            forwardArgs: ["foo"],
        });
    });

    it("--gui 仅首参生效：serve --gui 按子命令处理", () => {
        expect(translate_launcher_args(["serve", "--gui"])).toEqual({
            mode: "cli",
            forwardArgs: ["--cli", "serve", "--gui"],
        });
    });

    it("每个 CLI 子命令免 --cli 前缀 → 注入 --cli", () => {
        // 硬编码期望列表（字母序），防被测模块 Set 缩水导致循环假绿（review f002）。
        const expectedCommands = [
            "autostart",
            "export",
            "help",
            "open",
            "pause",
            "quit",
            "refresh-all",
            "restart",
            "resume",
            "serve",
        ];
        expect([...CLI_COMMANDS].sort()).toEqual(expectedCommands);
        for (const cmd of expectedCommands) {
            const result = translate_launcher_args([cmd, "--port", "17864"]);
            expect(result.mode).toBe("cli");
            expect(result.forwardArgs).toEqual(["--cli", cmd, "--port", "17864"]);
        }
    });

    it("serve 带选项 → 注入 --cli 且原样保留选项", () => {
        expect(
            translate_launcher_args(["serve", "--foreground", "--user-data-dir", "/tmp/x"]),
        ).toEqual({
            mode: "cli",
            forwardArgs: ["--cli", "serve", "--foreground", "--user-data-dir", "/tmp/x"],
        });
    });

    it("flag 在前、子命令在后 → 跳过 flag 值找到子命令", () => {
        expect(translate_launcher_args(["--port", "123", "serve"])).toEqual({
            mode: "cli",
            forwardArgs: ["--cli", "--port", "123", "serve"],
        });
    });

    it("--cli 前缀兼容 → cli，原样转发", () => {
        expect(translate_launcher_args(["--cli", "serve", "--port", "9"])).toEqual({
            mode: "cli",
            forwardArgs: ["--cli", "serve", "--port", "9"],
        });
    });

    it("未知首参数 → invalid", () => {
        expect(translate_launcher_args(["frobnicate"])).toEqual({
            mode: "invalid",
            forwardArgs: [],
        });
    });

    it("全 flag 无子命令 → help", () => {
        expect(translate_launcher_args(["--port", "123"])).toEqual({
            mode: "help",
            forwardArgs: [],
        });
    });
});
