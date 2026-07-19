import { describe, expect, it } from "vitest";
import { appConfigurationSchema } from "../../../src/main/core/config/types";

describe("appConfigurationSchema", () => {
    it("accepts a persisted log level", () => {
        expect(
            appConfigurationSchema.parse({
                schemaVersion: 1,
                language: "zh-Hans",
                launchAtLogin: false,
                plugins: [],
                logLevel: "warn",
            }).logLevel,
        ).toBe("warn");
    });

    it("accepts dir and model aliases", () => {
        const parsed = appConfigurationSchema.parse({
            schemaVersion: 1,
            language: "zh-Hans",
            launchAtLogin: false,
            plugins: [],
            dirAliases: [{ alias: "proj-x", dirs: ["/a", "/b"] }],
            modelAliases: [{ alias: "sonnet", models: ["claude-3-5-sonnet", "claude-sonnet-4"] }],
        });
        expect(parsed.dirAliases).toEqual([{ alias: "proj-x", dirs: ["/a", "/b"] }]);
        expect(parsed.modelAliases).toEqual([
            { alias: "sonnet", models: ["claude-3-5-sonnet", "claude-sonnet-4"] },
        ]);
    });

    it("defaults dir/model aliases to empty arrays", () => {
        const parsed = appConfigurationSchema.parse({
            schemaVersion: 1,
            language: "zh-Hans",
            launchAtLogin: false,
            plugins: [],
        });
        expect(parsed.dirAliases).toEqual([]);
        expect(parsed.modelAliases).toEqual([]);
    });
});
