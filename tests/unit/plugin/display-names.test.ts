import { describe, it, expect } from "vitest";
import { resolveDisplayNames } from "../../../src/main/core/plugin/display-names";
import type { PluginConfiguration } from "../../../src/shared/types/config";
import type { PluginMetadata } from "../../../src/shared/schemas/plugin-metadata";

function makeConfig(
    instanceId: string,
    name: string,
    executablePath = "/plugins/test.py",
): PluginConfiguration {
    return {
        instanceId,
        stateId: instanceId,
        name,
        enabled: true,
        executablePath,
        refreshIntervalSeconds: 300,
        parameterValues: {},
        endpointOverrides: {},
    };
}

describe("resolveDisplayNames", () => {
    it("returns metadata name@zh-Hans when available", () => {
        const meta: PluginMetadata = { name: "Test", description: "" };
        const result = resolveDisplayNames([
            {
                config: makeConfig("a", "fallback"),
                metadata: Object.assign(meta, { "name@zh-Hans": "测试插件" }),
            },
        ]);
        expect(result.get("a")).toBe("测试插件");
    });

    it("falls back to metadata.name when no localized name", () => {
        const result = resolveDisplayNames([
            {
                config: makeConfig("a", "fallback"),
                metadata: { name: "Test", description: "" },
            },
        ]);
        expect(result.get("a")).toBe("Test");
    });

    it("falls back to config.name when no metadata", () => {
        const result = resolveDisplayNames([
            { config: makeConfig("a", "My Plugin"), metadata: null },
        ]);
        expect(result.get("a")).toBe("My Plugin");
    });

    it("deduplicates names with numeric suffix", () => {
        const result = resolveDisplayNames([
            { config: makeConfig("a", "Claude"), metadata: null },
            { config: makeConfig("b", "Claude"), metadata: null },
            { config: makeConfig("c", "Claude"), metadata: null },
        ]);
        expect(result.get("a")).toBe("Claude");
        expect(result.get("b")).toBe("Claude 2");
        expect(result.get("c")).toBe("Claude 3");
    });

    it("does not deduplicate unique names", () => {
        const result = resolveDisplayNames([
            { config: makeConfig("a", "Claude"), metadata: null },
            { config: makeConfig("b", "OpenAI"), metadata: null },
        ]);
        expect(result.get("a")).toBe("Claude");
        expect(result.get("b")).toBe("OpenAI");
    });
});
