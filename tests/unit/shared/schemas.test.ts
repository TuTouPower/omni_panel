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
    it("accepts success-basic.json and parses key fields", () => {
        const raw = readFileSync(resolve(fixturesDir, "success-basic.json"), "utf8");
        const data: unknown = JSON.parse(raw);
        const result = pluginResultSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
            const parsed = result.data;
            expect(parsed.success).toBe(true);
            expect(parsed.schemaVersion).toBe(2);
            expect(parsed.items).toHaveLength(1);
            const item = parsed.items[0];
            expect(item.provider).toBe("claude");
            expect(item.source).toBe("poll");
            expect(item.used).toBe(50);
            expect(item.limit).toBe(100);
            expect(item.accountId).toBe("fixture-claude");
        }
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
                    source: "poll",
                    sourceInstanceId: "fixture-claude",
                    accountId: "fixture-claude",
                    accountLabel: "Claude Fixture",
                    raw_label: "test",
                    normalized_label: "Test",
                    used: 10,
                    limit: 100,
                    displayStyle: "percent",
                    status: "normal",
                    color: "red",
                    resetAt: null,
                    observedAt: 1748049600000,
                    stale: false,
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
    function extract_metadata_json(raw: string, max_lines = 80): string {
        const lines = raw.split("\n").slice(0, max_lines);
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
        return collected.join("\n");
    }

    function parse_fixture(filename: string, max_lines = 80): unknown {
        const raw = readFileSync(resolve(metadataFixturesDir, filename), "utf8");
        const json = extract_metadata_json(raw, max_lines);
        return JSON.parse(json);
    }

    it("accepts basic metadata", () => {
        const data = parse_fixture("metadata-basic.ts");
        const result = pluginMetadataSchema.safeParse(data);
        expect(result.success).toBe(true);
    });

    it("accepts metadata with choice parameter", () => {
        const data = parse_fixture("metadata-with-choice.ts");
        const result = pluginMetadataSchema.safeParse(data);
        expect(result.success).toBe(true);
    });

    it("accepts metadata with secret parameter", () => {
        const data = parse_fixture("metadata-with-secret.ts");
        const result = pluginMetadataSchema.safeParse(data);
        expect(result.success).toBe(true);
    });

    it("accepts metadata that starts after line 80 when reading enough lines", () => {
        const data = parse_fixture("metadata-after-line-80.ts", 90);
        const result = pluginMetadataSchema.safeParse(data);
        expect(result.success).toBe(true);
    });

    it("fails when metadata starts after line 80 with default line limit", () => {
        expect(() => parse_fixture("metadata-after-line-80.ts")).toThrow();
    });

    it("rejects invalid JSON in metadata", () => {
        expect(() => parse_fixture("metadata-invalid-json.ts")).toThrow();
    });

    it("fails to extract metadata with missing end marker", () => {
        expect(() => parse_fixture("metadata-missing-end-marker.ts")).toThrow();
    });
});
