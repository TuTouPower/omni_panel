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

    it("t222: accepts sparklineWindowDays", () => {
        const parsed = appConfigurationSchema.parse({
            schemaVersion: 1,
            language: "zh-Hans",
            launchAtLogin: false,
            plugins: [],
            sparklineWindowDays: 30,
        });
        expect(parsed.sparklineWindowDays).toBe(30);
    });

    it("t222: rejects sparklineWindowDays outside [1,365]", () => {
        expect(() =>
            appConfigurationSchema.parse({
                schemaVersion: 1,
                language: "zh-Hans",
                launchAtLogin: false,
                plugins: [],
                sparklineWindowDays: 0,
            }),
        ).toThrow();
        expect(() =>
            appConfigurationSchema.parse({
                schemaVersion: 1,
                language: "zh-Hans",
                launchAtLogin: false,
                plugins: [],
                sparklineWindowDays: 500,
            }),
        ).toThrow();
    });
    it("t250: accepts providerL2Open and activeUsageTab", () => {
        const parsed = appConfigurationSchema.parse({
            schemaVersion: 1,
            language: "zh-Hans",
            launchAtLogin: false,
            plugins: [],
            providerL2Open: { claude: true, deepseek: false },
            activeUsageTab: "claude",
        });
        expect(parsed.providerL2Open).toEqual({ claude: true, deepseek: false });
        expect(parsed.activeUsageTab).toBe("claude");
    });
    it("t250: rejects providerL2Open non-boolean and activeUsageTab non-string", () => {
        expect(() =>
            appConfigurationSchema.parse({
                schemaVersion: 1,
                language: "zh-Hans",
                launchAtLogin: false,
                plugins: [],
                providerL2Open: { claude: "yes" },
            }),
        ).toThrow();
        expect(() =>
            appConfigurationSchema.parse({
                schemaVersion: 1,
                language: "zh-Hans",
                launchAtLogin: false,
                plugins: [],
                activeUsageTab: 123,
            }),
        ).toThrow();
    });

    it("t379: preserves tokenStats block through parse (not stripped)", () => {
        const parsed = appConfigurationSchema.parse({
            schemaVersion: 1,
            language: "zh-Hans",
            launchAtLogin: false,
            plugins: [],
            tokenStats: {
                pollIntervalMinutes: 5,
                wslEnabled: false,
                wslDistro: "Ubuntu-24.04",
                wslUser: "alice",
            },
        });
        expect(parsed.tokenStats).toEqual({
            pollIntervalMinutes: 5,
            wslEnabled: false,
            wslDistro: "Ubuntu-24.04",
            wslUser: "alice",
        });
    });

    it("t401 AC-005: preserves resumeCommandTemplates through parse (not stripped)", () => {
        const templates = { kimi_code: "kimi --yolo -r {session_id}" };
        const parsed = appConfigurationSchema.parse({
            schemaVersion: 1,
            language: "zh-Hans",
            launchAtLogin: false,
            plugins: [],
            resumeCommandTemplates: templates,
        });
        expect(parsed.resumeCommandTemplates).toEqual(templates);
    });

    it("t401 AC-006: absent resumeCommandTemplates stays undefined (legacy compatible)", () => {
        const parsed = appConfigurationSchema.parse({
            schemaVersion: 1,
            language: "zh-Hans",
            launchAtLogin: false,
            plugins: [],
        });
        expect(parsed).not.toHaveProperty("resumeCommandTemplates");
        expect(parsed.resumeCommandTemplates).toBeUndefined();
    });

    it("t398 AC-002: accepts cacheMaxMb=0（不限制）", () => {
        // settings data_section「不限制」保存 cacheMaxMb: 0；min(1) 会拒绝致无法
        // 持久化。schema 放行 0（不限制语义），retention 0 分支可达。
        const parsed = appConfigurationSchema.parse({
            schemaVersion: 1,
            language: "zh-Hans",
            launchAtLogin: false,
            plugins: [],
            cacheMaxMb: 0,
        });
        expect(parsed.cacheMaxMb).toBe(0);
    });

    it("t398 AC-002: cacheMaxMb 边界——1 与 10000 通过、负值与 10001 拒绝", () => {
        const base = {
            schemaVersion: 1,
            language: "zh-Hans",
            launchAtLogin: false,
            plugins: [],
        };
        expect(appConfigurationSchema.parse({ ...base, cacheMaxMb: 1 }).cacheMaxMb).toBe(1);
        expect(appConfigurationSchema.parse({ ...base, cacheMaxMb: 10000 }).cacheMaxMb).toBe(10000);
        expect(() => appConfigurationSchema.parse({ ...base, cacheMaxMb: -1 })).toThrow();
        expect(() => appConfigurationSchema.parse({ ...base, cacheMaxMb: 10001 })).toThrow();
        expect(() => appConfigurationSchema.parse({ ...base, cacheMaxMb: 0.5 })).toThrow();
    });

    it("t481: preserves the explicit devPanel namespace", () => {
        const dev_panel = {
            scanRoots: ["~/kar/code", "/tmp/repos"],
            commitCutoff: "2026-03-20",
            currentUserOnly: true,
        };
        const parsed = appConfigurationSchema.parse({
            schemaVersion: 1,
            language: "zh-Hans",
            launchAtLogin: false,
            plugins: [],
            devPanel: dev_panel,
        });
        expect(parsed.devPanel).toEqual(dev_panel);
    });

    it("t495 AC-002: accepts usagePopupWidth as a positive integer", () => {
        const base = {
            schemaVersion: 1,
            language: "zh-Hans",
            launchAtLogin: false,
            plugins: [],
        };
        expect(
            appConfigurationSchema.parse({ ...base, usagePopupWidth: 600 }).usagePopupWidth,
        ).toBe(600);
        expect(() => appConfigurationSchema.parse({ ...base, usagePopupWidth: -10 })).toThrow();
        expect(() => appConfigurationSchema.parse({ ...base, usagePopupWidth: 0 })).toThrow();
        expect(() => appConfigurationSchema.parse({ ...base, usagePopupWidth: 600.5 })).toThrow();
    });

    it("p254: accepts hideDockIcon as an optional boolean without stripping", () => {
        const base = {
            schemaVersion: 1,
            language: "zh-Hans",
            launchAtLogin: false,
            plugins: [],
        };
        expect(appConfigurationSchema.parse({ ...base, hideDockIcon: true }).hideDockIcon).toBe(
            true,
        );
        expect(appConfigurationSchema.parse(base).hideDockIcon).toBeUndefined();
        expect(() => appConfigurationSchema.parse({ ...base, hideDockIcon: "yes" })).toThrow();
    });
});
