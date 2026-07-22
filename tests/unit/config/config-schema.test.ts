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

    it("accepts upcomingResetThresholdPercent as number", () => {
        const parsed = appConfigurationSchema.parse({
            schemaVersion: 1,
            language: "zh-Hans",
            launchAtLogin: false,
            plugins: [],
            upcomingResetThresholdPercent: 15,
        });
        expect(parsed.upcomingResetThresholdPercent).toBe(15);
    });

    it("accepts upcomingResetThresholdPercent as null", () => {
        const parsed = appConfigurationSchema.parse({
            schemaVersion: 1,
            language: "zh-Hans",
            launchAtLogin: false,
            plugins: [],
            upcomingResetThresholdPercent: null,
        });
        expect(parsed.upcomingResetThresholdPercent).toBeNull();
    });

    it("t041: rejects upcomingResetThresholdPercent outside [0,100]", () => {
        expect(() =>
            appConfigurationSchema.parse({
                schemaVersion: 1,
                language: "zh-Hans",
                launchAtLogin: false,
                plugins: [],
                upcomingResetThresholdPercent: 150,
            }),
        ).toThrow();
        expect(() =>
            appConfigurationSchema.parse({
                schemaVersion: 1,
                language: "zh-Hans",
                launchAtLogin: false,
                plugins: [],
                upcomingResetThresholdPercent: -1,
            }),
        ).toThrow();
    });

    it("t041: rejects non-integer upcomingResetThresholdPercent", () => {
        expect(() =>
            appConfigurationSchema.parse({
                schemaVersion: 1,
                language: "zh-Hans",
                launchAtLogin: false,
                plugins: [],
                upcomingResetThresholdPercent: 12.7,
            }),
        ).toThrow();
    });

    it("accepts accountOverrides.upcomingResetWatched (t043)", () => {
        const parsed = appConfigurationSchema.parse({
            schemaVersion: 1,
            language: "zh-Hans",
            launchAtLogin: false,
            plugins: [],
            accountOverrides: {
                upcomingResetWatched: { claude: { "si1|acct1": ["5小时"] } },
            },
        });
        expect(parsed.accountOverrides?.upcomingResetWatched?.["claude"]?.["si1|acct1"]).toEqual([
            "5小时",
        ]);
    });

    it("t043: strips legacy upcomingResetOff on load (migration to watched)", () => {
        const parsed = appConfigurationSchema.parse({
            schemaVersion: 1,
            language: "zh-Hans",
            launchAtLogin: false,
            plugins: [],
            accountOverrides: {
                upcomingResetOff: { claude: ["si1|acct1"] },
            },
        });
        expect(parsed.accountOverrides).not.toHaveProperty("upcomingResetOff");
        expect(parsed.accountOverrides?.upcomingResetWatched).toBeUndefined();
    });
});
