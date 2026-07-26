import { describe, expect, it } from "vitest";
import { plugins_structure_signature } from "../../../../src/renderer/lib/config-sync";
import type { AppConfiguration } from "../../../../src/shared/types/config";

type PluginEntry = AppConfiguration["plugins"][number];

function make_plugin(overrides: Partial<PluginEntry> = {}): PluginEntry {
    return {
        instanceId: "inst-1",
        stateId: "inst-1",
        name: "deepseek",
        enabled: true,
        executablePath: "connectors/deepseek/connector.ts",
        refreshIntervalSeconds: 300,
        parameterValues: {},
        endpointOverrides: {},
        ...overrides,
    };
}

describe("plugins_structure_signature", () => {
    it("is stable for deep-equal plugin lists with different references", () => {
        const a = [make_plugin()];
        const b = [make_plugin()];
        expect(plugins_structure_signature(a)).toBe(plugins_structure_signature(b));
    });

    it("is stable for empty and undefined lists", () => {
        expect(plugins_structure_signature([])).toBe(plugins_structure_signature(undefined));
    });

    it("changes when any config field of a plugin changes (refreshIntervalSeconds included)", () => {
        // connector:list-adjacent behavior is not field-enumerable; any
        // config.plugins change must advance the signature (t153_code_f001).
        const a = [make_plugin({ refreshIntervalSeconds: 300 })];
        const b = [make_plugin({ refreshIntervalSeconds: 60 })];
        expect(plugins_structure_signature(a)).not.toBe(plugins_structure_signature(b));
    });

    it("changes when display name or parameterValues change", () => {
        const renamed = [make_plugin({ name: "DeepSeek 主号" })];
        expect(plugins_structure_signature([make_plugin()])).not.toBe(
            plugins_structure_signature(renamed),
        );
        const params = [make_plugin({ parameterValues: { monitor_usage: 1 } })];
        expect(plugins_structure_signature([make_plugin()])).not.toBe(
            plugins_structure_signature(params),
        );
    });

    it("changes when an instance is enabled/disabled", () => {
        const a = [make_plugin({ enabled: true })];
        const b = [make_plugin({ enabled: false })];
        expect(plugins_structure_signature(a)).not.toBe(plugins_structure_signature(b));
    });

    it("changes when an instance is added or removed", () => {
        const a = [make_plugin()];
        const b = [make_plugin(), make_plugin({ instanceId: "inst-2", stateId: "inst-2" })];
        expect(plugins_structure_signature(a)).not.toBe(plugins_structure_signature(b));
    });

    it("changes when executablePath changes", () => {
        const a = [make_plugin({ executablePath: "connectors/deepseek/connector.ts" })];
        const b = [make_plugin({ executablePath: "connectors/glm/connector.ts" })];
        expect(plugins_structure_signature(a)).not.toBe(plugins_structure_signature(b));
    });
});
