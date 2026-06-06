import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parsePluginResult } from "../../../src/main/core/plugin/output-parser";
import {
    PluginOutputParseError,
    PluginSchemaError,
} from "../../../src/shared/errors/plugin-errors";

const fixturesDir = resolve(__dirname, "../../fixtures/plugin-output");

function loadFixture(name: string): string {
    return readFileSync(resolve(fixturesDir, name), "utf8");
}

describe("parsePluginResult", () => {
    it("parses success-basic.json", () => {
        const result = parsePluginResult(loadFixture("success-basic.json"));
        expect(result.success).toBe(true);
        if (result.success) expect(result.items.length).toBeGreaterThan(0);
    });

    it("parses success-with-badge.json", () => {
        const result = parsePluginResult(loadFixture("success-with-badge.json"));
        expect(result.success).toBe(true);
        if (result.success) expect(result.badge).toBeDefined();
    });

    it("parses success-with-chart.json", () => {
        const result = parsePluginResult(loadFixture("success-with-chart.json"));
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.chart).toBeDefined();
            expect(result.chart?.buckets.length).toBeGreaterThan(0);
        }
    });

    it("parses success-empty-items.json", () => {
        const result = parsePluginResult(loadFixture("success-empty-items.json"));
        expect(result.success).toBe(true);
        if (result.success) expect(result.items).toHaveLength(0);
    });

    it("parses success-with-nulls.json", () => {
        const result = parsePluginResult(loadFixture("success-with-nulls.json"));
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.items.length).toBeGreaterThan(0);
            expect(result.chart).toBeDefined();
        }
    });

    it("parses error-json-field.json as failure", () => {
        const result = parsePluginResult(loadFixture("error-json-field.json"));
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.code).toBe("AUTH_FAILED");
            expect(result.error.message).toBeTruthy();
        }
    });

    it("throws PluginOutputParseError for invalid JSON", () => {
        expect(() => parsePluginResult(loadFixture("invalid-json.txt"))).toThrow(
            PluginOutputParseError,
        );
    });

    it("throws PluginSchemaError for missing required field", () => {
        expect(() => parsePluginResult(loadFixture("invalid-missing-required-field.json"))).toThrow(
            PluginSchemaError,
        );
    });

    it("throws PluginSchemaError for wrong type", () => {
        expect(() => parsePluginResult(loadFixture("invalid-wrong-type.json"))).toThrow(
            PluginSchemaError,
        );
    });
});
