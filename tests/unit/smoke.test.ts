import { describe, it, expect } from "vitest";
import { parsePluginMetadata } from "../../src/main/core/plugin/metadata-parser";
import { buildPluginCommand } from "../../src/main/core/plugin/command-builder";
import { executePlugin } from "../../src/main/core/plugin/runner";
import { getDataRoot } from "../../src/main/core/paths";

describe("smoke: modules are importable", () => {
    it("parsePluginMetadata throws Not implemented", () => {
        expect(() => parsePluginMetadata("")).toThrow("Not implemented");
    });

    it("buildPluginCommand throws Not implemented", () => {
        expect(() => buildPluginCommand("/path", {}, "zh-Hans")).toThrow("Not implemented");
    });

    it("executePlugin throws Not implemented", async () => {
        await expect(() => executePlugin({ command: "echo", args: [] })).rejects.toThrow(
            "Not implemented",
        );
    });

    it("getDataRoot throws Not implemented", () => {
        expect(() => getDataRoot()).toThrow("Not implemented");
    });
});
