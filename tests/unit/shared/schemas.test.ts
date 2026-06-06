import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pluginMetadataSchema } from "../../../src/shared/schemas/plugin-metadata";
import {
    pluginSuccessOutputSchema,
    pluginFailureOutputSchema,
    pluginResultSchema,
} from "../../../src/shared/schemas/plugin-output";

const fixturesDir = resolve(__dirname, "../../fixtures/plugin-output");
const metadataFixturesDir = resolve(__dirname, "../../fixtures/plugin-metadata");

describe("pluginResultSchema (discriminated union)", () => {
    it("accepts success-basic.json", () => {
        const raw = readFileSync(resolve(fixturesDir, "success-basic.json"), "utf8");
        const data: unknown = JSON.parse(raw);
        const result = pluginResultSchema.safeParse(data);
        expect(result.success).toBe(true);
    });

    it("accepts success-with-badge.json", () => {
        const raw = readFileSync(resolve(fixturesDir, "success-with-badge.json"), "utf8");
        const data: unknown = JSON.parse(raw);
        const result = pluginResultSchema.safeParse(data);
        expect(result.success).toBe(true);
    });

    it("accepts success-with-chart.json", () => {
        const raw = readFileSync(resolve(fixturesDir, "success-with-chart.json"), "utf8");
        const data: unknown = JSON.parse(raw);
        const result = pluginResultSchema.safeParse(data);
        expect(result.success).toBe(true);
    });

    it("accepts success-empty-items.json", () => {
        const raw = readFileSync(resolve(fixturesDir, "success-empty-items.json"), "utf8");
        const data: unknown = JSON.parse(raw);
        const result = pluginResultSchema.safeParse(data);
        expect(result.success).toBe(true);
    });

    it("accepts success-with-nulls.json", () => {
        const raw = readFileSync(resolve(fixturesDir, "success-with-nulls.json"), "utf8");
        const data: unknown = JSON.parse(raw);
        const result = pluginResultSchema.safeParse(data);
        expect(result.success).toBe(true);
    });

    it("accepts inline success data with nullable fields", () => {
        const data = {
            success: true,
            schemaVersion: 2,
            updatedAt: "2026-05-24T12:00:00Z",
            items: [
                {
                    id: "test",
                    provider: "claude",
                    source: "api_key",
                    sourceInstanceId: "fixture-claude",
                    accountId: "fixture-claude",
                    accountLabel: "Claude Fixture",
                    name: "Test",
                    used: 10,
                    limit: 100,
                    displayStyle: "percent",
                    status: "normal",
                    color: "red",
                    resetAt: null,
                },
            ],
        };
        const result = pluginSuccessOutputSchema.safeParse(data);
        expect(result.success).toBe(true);
    });

    it("accepts error-json-field.json as failure", () => {
        const raw = readFileSync(resolve(fixturesDir, "error-json-field.json"), "utf8");
        const data: unknown = JSON.parse(raw);
        const result = pluginFailureOutputSchema.safeParse(data);
        expect(result.success).toBe(true);
    });

    it("rejects missing-required-field.json", () => {
        const raw = readFileSync(
            resolve(fixturesDir, "invalid-missing-required-field.json"),
            "utf8",
        );
        const data: unknown = JSON.parse(raw);
        const result = pluginSuccessOutputSchema.safeParse(data);
        expect(result.success).toBe(false);
    });

    it("rejects wrong-type.json", () => {
        const raw = readFileSync(resolve(fixturesDir, "invalid-wrong-type.json"), "utf8");
        const data: unknown = JSON.parse(raw);
        const result = pluginSuccessOutputSchema.safeParse(data);
        expect(result.success).toBe(false);
    });
});

describe("pluginMetadataSchema", () => {
    it("accepts basic metadata", () => {
        const raw = readFileSync(resolve(metadataFixturesDir, "metadata-basic.ts"), "utf8");
        const lines = raw.split("\n").slice(0, 80);
        const collected: string[] = [];
        let collecting = false;
        for (const line of lines) {
            const slashIndex = line.indexOf("//");
            if (slashIndex === -1) continue;
            const stripped = line.slice(slashIndex + 2);
            const trimmed = stripped.startsWith(" ") ? stripped.slice(1) : stripped;
            if (trimmed.startsWith("UsageBoardPlugin:")) {
                collecting = true;
                const rest = trimmed.replace("UsageBoardPlugin:", "").trim();
                if (rest) collected.push(rest);
                continue;
            }
            if (trimmed.startsWith("/UsageBoardPlugin")) break;
            if (collecting) collected.push(trimmed);
        }
        const data: unknown = JSON.parse(collected.join("\n"));
        const result = pluginMetadataSchema.safeParse(data);
        expect(result.success).toBe(true);
    });
});
