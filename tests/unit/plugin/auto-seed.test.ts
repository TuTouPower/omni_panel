import { describe, it, expect } from "vitest";
import { discoverPlugins } from "../../../src/main/core/plugin/discovery";
import { resolve } from "node:path";
import type { AppConfiguration } from "../../../src/shared/types/config";
import type { PluginDefinition } from "../../../src/main/core/plugin/types";

const bundledDir = resolve(process.cwd(), "resources/plugins");

/**
 * Replicates the auto-seed logic from src/main/index.ts:
 * only create plugin instances for definitions whose executablePath
 * is not already present in the config.
 */
function computeSeedMissing(
    config: AppConfiguration,
    definitions: readonly PluginDefinition[],
): PluginDefinition[] {
    const existingPaths = new Set(config.plugins.map((p) => p.executablePath));
    return definitions.filter((d) => !existingPaths.has(d.executablePath));
}

describe("auto-seed logic", () => {
    let allDefinitions: readonly PluginDefinition[];

    it("discovers bundled definitions", async () => {
        allDefinitions = await discoverPlugins(bundledDir);
        expect(allDefinitions.length).toBeGreaterThan(0);
    });

    it("empty config seeds all definitions", () => {
        const config: AppConfiguration = {
            schemaVersion: 1,
            language: "zh-Hans",
            plugins: [],
            launchAtLogin: false,
        };
        const missing = computeSeedMissing(config, allDefinitions);
        expect(missing.length).toBe(allDefinitions.length);
    });

    it("partial config only seeds missing definitions", () => {
        const firstDef = allDefinitions[0];
        expect(firstDef).toBeDefined();
        if (!firstDef) return;

        const config: AppConfiguration = {
            schemaVersion: 1,
            language: "zh-Hans",
            plugins: [
                {
                    instanceId: "existing-1",
                    stateId: "existing-1",
                    name: "Existing",
                    enabled: true,
                    executablePath: firstDef.executablePath,
                    refreshIntervalSeconds: 300,
                    parameterValues: {},
                    endpointOverrides: {},
                },
            ],
            launchAtLogin: false,
        };
        const missing = computeSeedMissing(config, allDefinitions);
        expect(missing.length).toBe(allDefinitions.length - 1);
        expect(missing.find((d) => d.executablePath === firstDef.executablePath)).toBeUndefined();
    });

    it("full config seeds nothing", () => {
        const config: AppConfiguration = {
            schemaVersion: 1,
            language: "zh-Hans",
            plugins: allDefinitions.map((def, i) => ({
                instanceId: `instance-${String(i)}`,
                stateId: `state-${String(i)}`,
                name: def.metadata?.name ?? def.scriptName,
                enabled: true,
                executablePath: def.executablePath,
                refreshIntervalSeconds: 300,
                parameterValues: {},
                endpointOverrides: {},
            })),
            launchAtLogin: false,
        };
        const missing = computeSeedMissing(config, allDefinitions);
        expect(missing.length).toBe(0);
    });
});
