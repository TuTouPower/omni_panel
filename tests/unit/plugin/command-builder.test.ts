import { describe, it, expect } from "vitest";
import { buildPluginCommand } from "../../../src/main/core/plugin/command-builder";

describe("buildPluginCommand", () => {
    it("uses python3 for .py files", () => {
        const result = buildPluginCommand("/path/to/plugin.py", {}, "zh-Hans");
        expect(result.command).toBe("python3");
        expect(result.args[0]).toBe("/path/to/plugin.py");
    });

    it("uses executable directly for non-.py files", () => {
        const result = buildPluginCommand("/path/to/plugin", {}, "zh-Hans");
        expect(result.command).toBe("/path/to/plugin");
    });

    it("formats parameters as --usageboard-param KEY=value", () => {
        const result = buildPluginCommand("/p.py", { API_KEY: "abc123" }, "zh-Hans");
        expect(result.args).toContain("--usageboard-param=API_KEY=abc123");
    });

    it("skips empty parameter values", () => {
        const result = buildPluginCommand("/p.py", { EMPTY: "" }, "zh-Hans");
        expect(result.args.every((a: string) => !a.includes("EMPTY"))).toBe(true);
    });

    it("always passes USAGEBOARD_LANGUAGE", () => {
        const result = buildPluginCommand("/p.py", {}, "en");
        expect(result.args).toContain("--usageboard-param=USAGEBOARD_LANGUAGE=en");
    });

    it("passes language zh-Hans correctly", () => {
        const result = buildPluginCommand("/p.py", {}, "zh-Hans");
        expect(result.args).toContain("--usageboard-param=USAGEBOARD_LANGUAGE=zh-Hans");
    });
});
