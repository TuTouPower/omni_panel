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

    it("executePlugin returns PluginExecutionResult", async () => {
        const result = await executePlugin({ command: "echo", args: [] });
        expect(result).toHaveProperty("stdout");
        expect(result).toHaveProperty("exitCode");
    });

    it("getDataRoot is importable function", () => {
        expect(typeof getDataRoot).toBe("function");
    });
});
