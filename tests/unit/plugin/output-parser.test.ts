import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    parsePluginOutput,
    parsePluginOutputOrError,
} from "../../../src/main/core/plugin/output-parser";
import {
    PluginOutputParseError,
    PluginSchemaError,
} from "../../../src/shared/errors/plugin-errors";

const fixturesDir = resolve(__dirname, "../../../fixtures/plugin-output");

function loadFixture(name: string): string {
    return readFileSync(resolve(fixturesDir, name), "utf8");
}

describe("parsePluginOutput", () => {
    it("parses success-basic.json", () => {
        const result = parsePluginOutput(loadFixture("success-basic.json"));
        expect(result.items.length).toBeGreaterThan(0);
    });

    it("parses success-with-badge.json", () => {
        const result = parsePluginOutput(loadFixture("success-with-badge.json"));
        expect(result.badge).toBeDefined();
    });

    it("parses success-with-chart.json", () => {
        const result = parsePluginOutput(loadFixture("success-with-chart.json"));
        expect(result.chart).toBeDefined();
        expect(result.chart?.buckets.length).toBeGreaterThan(0);
    });

    it("parses success-empty-items.json", () => {
        const result = parsePluginOutput(loadFixture("success-empty-items.json"));
        expect(result.items).toHaveLength(0);
    });

    it("throws PluginOutputParseError for invalid JSON", () => {
        expect(() => parsePluginOutput(loadFixture("invalid-json.txt"))).toThrow(
            PluginOutputParseError,
        );
    });

    it("throws PluginSchemaError for missing required field", () => {
        expect(() => parsePluginOutput(loadFixture("invalid-missing-required-field.json"))).toThrow(
            PluginSchemaError,
        );
    });

    it("throws PluginSchemaError for wrong type", () => {
        expect(() => parsePluginOutput(loadFixture("invalid-wrong-type.json"))).toThrow(
            PluginSchemaError,
        );
    });
});

describe("parsePluginOutputOrError", () => {
    it("returns PluginErrorOutput for error-json-field.json", () => {
        const result = parsePluginOutputOrError(loadFixture("error-json-field.json"));
        expect("error" in result).toBe(true);
    });

    it("returns PluginOutput for success-basic.json", () => {
        const result = parsePluginOutputOrError(loadFixture("success-basic.json"));
        expect("items" in result).toBe(true);
    });
});
