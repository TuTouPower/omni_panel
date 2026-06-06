import { describe, it, expect } from "vitest";
import { buildPluginCommand } from "../../../src/main/core/plugin/command-builder";

function paramsFromStdin(stdin: string | undefined): Record<string, string> {
    const payload = JSON.parse(stdin ?? "{}") as { params?: Record<string, string> };
    return payload.params ?? {};
}

describe("buildPluginCommand", () => {
    it("uses provided nodePath", () => {
        const result = buildPluginCommand(
            "/cache/plugin/index.js",
            {},
            "zh-Hans",
            "/path/to/electron",
        );
        expect(result.command).toBe("/path/to/electron");
        expect(result.args[0]).toBe("/cache/plugin/index.js");
    });

    it("passes parameters through stdin", () => {
        const result = buildPluginCommand(
            "/cache/plugin/index.js",
            { API_KEY: "abc123" },
            "zh-Hans",
            "/path/to/node",
        );
        expect(result.args).toEqual(["/cache/plugin/index.js"]);
        expect(paramsFromStdin(result.stdin)).toEqual({
            API_KEY: "abc123",
            USAGEBOARD_LANGUAGE: "zh-Hans",
        });
    });

    it("does not expose parameter values in argv", () => {
        const result = buildPluginCommand(
            "/cache/plugin/index.js",
            { API_KEY: "abc123" },
            "zh-Hans",
            "/path/to/node",
        );
        expect(result.args.join(" ")).not.toContain("abc123");
    });

    it("skips empty parameter values", () => {
        const result = buildPluginCommand(
            "/cache/plugin/index.js",
            { EMPTY: "" },
            "zh-Hans",
            "/path/to/node",
        );
        expect(result.stdin).not.toContain("EMPTY");
    });

    it("always passes USAGEBOARD_LANGUAGE", () => {
        const result = buildPluginCommand("/cache/plugin/index.js", {}, "en", "/path/to/node");
        expect(paramsFromStdin(result.stdin)["USAGEBOARD_LANGUAGE"]).toBe("en");
    });

    it("passes language zh-Hans correctly", () => {
        const result = buildPluginCommand("/cache/plugin/index.js", {}, "zh-Hans", "/path/to/node");
        expect(paramsFromStdin(result.stdin)["USAGEBOARD_LANGUAGE"]).toBe("zh-Hans");
    });

    it("accepts parameter values with special characters", () => {
        const result = buildPluginCommand(
            "/cache/plugin/index.js",
            { KEY: "val&rm -rf /" },
            "zh-Hans",
            "/path/to/node",
        );
        expect(paramsFromStdin(result.stdin)["KEY"]).toBe("val&rm -rf /");
    });
});
