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
});
