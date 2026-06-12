import { describe, it, expect } from "vitest";
import { parsePluginMetadata } from "../../src/main/core/plugin/metadata-parser";
import { buildPluginCommand } from "../../src/main/core/plugin/command-builder";
import { executePlugin } from "../../src/main/core/plugin/runner";
import { getDataRoot } from "../../src/main/core/paths";

describe("smoke: modules are importable", () => {
    it("parsePluginMetadata returns null for empty content", () => {
        expect(parsePluginMetadata("")).toBeNull();
    });

    it("buildPluginCommand returns PluginCommand", () => {
        const result = buildPluginCommand("/path", {}, "zh-Hans", "/path/to/node");
        expect(result).toHaveProperty("command");
        expect(result).toHaveProperty("args");
    });

    // NOTE: echo is a shell builtin on Windows, not a standalone exe.
    // spawn() works here because Node.js resolves it via cmd.exe on win32.
    it("executePlugin returns PluginExecutionResult", async () => {
        const command =
            process.platform === "win32"
                ? { command: "cmd", args: ["/c", "echo", "ok"] }
                : { command: "echo", args: [] };
        const result = await executePlugin(command);
        expect(result).toHaveProperty("stdout");
        expect(result).toHaveProperty("exitCode");
    });

    it("getDataRoot is importable function", () => {
        expect(typeof getDataRoot).toBe("function");
    });
});
