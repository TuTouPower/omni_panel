import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    pluginErrorOutputSchema,
    pluginOutputSchema,
} from "../../../src/shared/schemas/plugin-output";

const fixturesDir = resolve(__dirname, "../../../fixtures/plugin-output");

describe("pluginOutputSchema", () => {
    it("accepts success-basic.json", () => {
        const raw = readFileSync(resolve(fixturesDir, "success-basic.json"), "utf8");
        const data: unknown = JSON.parse(raw);
        const result = pluginOutputSchema.safeParse(data);
        expect(result.success).toBe(true);
    });

    it("accepts success-with-badge.json", () => {
        const raw = readFileSync(resolve(fixturesDir, "success-with-badge.json"), "utf8");
        const data: unknown = JSON.parse(raw);
        const result = pluginOutputSchema.safeParse(data);
        expect(result.success).toBe(true);
    });

    it("accepts success-with-chart.json", () => {
        const raw = readFileSync(resolve(fixturesDir, "success-with-chart.json"), "utf8");
        const data: unknown = JSON.parse(raw);
        const result = pluginOutputSchema.safeParse(data);
        expect(result.success).toBe(true);
    });

    it("accepts success-empty-items.json", () => {
        const raw = readFileSync(resolve(fixturesDir, "success-empty-items.json"), "utf8");
        const data: unknown = JSON.parse(raw);
        const result = pluginOutputSchema.safeParse(data);
        expect(result.success).toBe(true);
    });

    it("accepts error-json-field.json", () => {
        const raw = readFileSync(resolve(fixturesDir, "error-json-field.json"), "utf8");
        const data: unknown = JSON.parse(raw);
        const result = pluginErrorOutputSchema.safeParse(data);
        expect(result.success).toBe(true);
    });

    it("rejects missing-required-field.json", () => {
        const raw = readFileSync(
            resolve(fixturesDir, "invalid-missing-required-field.json"),
            "utf8",
        );
        const data: unknown = JSON.parse(raw);
        const result = pluginOutputSchema.safeParse(data);
        expect(result.success).toBe(false);
    });

    it("rejects wrong-type.json", () => {
        const raw = readFileSync(resolve(fixturesDir, "invalid-wrong-type.json"), "utf8");
        const data: unknown = JSON.parse(raw);
        const result = pluginOutputSchema.safeParse(data);
        expect(result.success).toBe(false);
    });
});
