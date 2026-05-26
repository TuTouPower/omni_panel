import { describe, it, expect } from "vitest";
import { buildPluginCommand } from "../../../src/main/core/plugin/command-builder";

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

    it("formats parameters as separate --usageboard-param KEY=VALUE", () => {
        const result = buildPluginCommand(
            "/cache/plugin/index.js",
            { API_KEY: "abc123" },
            "zh-Hans",
            "/path/to/node",
        );
        const idx = result.args.indexOf("--usageboard-param");
        expect(idx).toBeGreaterThan(-1);
        expect(result.args[idx + 1]).toBe("API_KEY=abc123");
    });

    it("skips empty parameter values", () => {
        const result = buildPluginCommand(
            "/cache/plugin/index.js",
            { EMPTY: "" },
            "zh-Hans",
            "/path/to/node",
        );
        expect(result.args.every((a: string) => !a.includes("EMPTY"))).toBe(true);
    });

    it("always passes USAGEBOARD_LANGUAGE", () => {
        const result = buildPluginCommand("/cache/plugin/index.js", {}, "en", "/path/to/node");
        const langIdx = result.args.indexOf("USAGEBOARD_LANGUAGE=en");
        expect(langIdx).toBeGreaterThan(-1);
        expect(result.args[langIdx - 1]).toBe("--usageboard-param");
    });

    it("passes language zh-Hans correctly", () => {
        const result = buildPluginCommand("/cache/plugin/index.js", {}, "zh-Hans", "/path/to/node");
        const langIdx = result.args.indexOf("USAGEBOARD_LANGUAGE=zh-Hans");
        expect(langIdx).toBeGreaterThan(-1);
    });

    it("accepts parameter values with special characters", () => {
        const result = buildPluginCommand(
            "/cache/plugin/index.js",
            { KEY: "val&rm -rf /" },
            "zh-Hans",
            "/path/to/node",
        );
        const idx = result.args.indexOf("KEY=val&rm -rf /");
        expect(idx).toBeGreaterThan(-1);
    });
});
