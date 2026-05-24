import { describe, it, expect } from "vitest";
import { buildPluginCommand } from "../../../src/main/core/plugin/command-builder";

describe("buildPluginCommand", () => {
    it("uses python3 for .py files", () => {
        const result = buildPluginCommand("/path/to/plugin.py", {}, "zh-Hans");
        expect(result.command).toBe("python3");
        expect(result.args[0]).toBe("/path/to/plugin.py");
    });

    it("uses custom python command", () => {
        const result = buildPluginCommand("/p.py", {}, "zh-Hans", "py");
        expect(result.command).toBe("py");
    });

    it("formats parameters as separate --usageboard-param and KEY=value", () => {
        const result = buildPluginCommand("/p.py", { API_KEY: "abc123" }, "zh-Hans");
        const idx = result.args.indexOf("--usageboard-param");
        expect(idx).toBeGreaterThan(-1);
        expect(result.args[idx + 1]).toBe("API_KEY=abc123");
    });

    it("sets PYTHONPATH env to plugin directory", () => {
        const result = buildPluginCommand("/plugins/test.py", {}, "zh-Hans");
        expect(result.env?.["PYTHONPATH"]).toBe("/plugins");
    });

    it("skips empty parameter values", () => {
        const result = buildPluginCommand("/p.py", { EMPTY: "" }, "zh-Hans");
        expect(result.args.every((a: string) => !a.includes("EMPTY"))).toBe(true);
    });

    it("always passes USAGEBOARD_LANGUAGE", () => {
        const result = buildPluginCommand("/p.py", {}, "en");
        const langIdx = result.args.indexOf("USAGEBOARD_LANGUAGE=en");
        expect(langIdx).toBeGreaterThan(-1);
        expect(result.args[langIdx - 1]).toBe("--usageboard-param");
    });

    it("passes language zh-Hans correctly", () => {
        const result = buildPluginCommand("/p.py", {}, "zh-Hans");
        const langIdx = result.args.indexOf("USAGEBOARD_LANGUAGE=zh-Hans");
        expect(langIdx).toBeGreaterThan(-1);
    });

    it("rejects parameter values with shell metacharacters", () => {
        expect(() => buildPluginCommand("/p.py", { KEY: "val&rm -rf /" }, "zh-Hans")).toThrow(
            "unsafe characters",
        );
    });

    it("rejects parameter keys with shell metacharacters", () => {
        expect(() => buildPluginCommand("/p.py", { "K;E;Y": "val" }, "zh-Hans")).toThrow(
            "unsafe characters",
        );
    });
});
