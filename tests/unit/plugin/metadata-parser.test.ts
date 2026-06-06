import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parsePluginMetadata } from "../../../src/main/core/plugin/metadata-parser";

const fixturesDir = resolve(__dirname, "../../fixtures/plugin-metadata");

function loadFixture(name: string): string {
    return readFileSync(resolve(fixturesDir, name), "utf8");
}

describe("parsePluginMetadata", () => {
    it("parses metadata-basic.ts", () => {
        const result = parsePluginMetadata(loadFixture("metadata-basic.ts"));
        expect(result).not.toBeNull();
        expect(result?.parameters?.length).toBeGreaterThan(0);
    });

    it("parses metadata-with-secret.ts", () => {
        const result = parsePluginMetadata(loadFixture("metadata-with-secret.ts"));
        expect(result).not.toBeNull();
        const secretParam = result?.parameters?.find((p) => p.type === "secret");
        expect(secretParam).toBeDefined();
    });

    it("parses metadata-with-choice.ts", () => {
        const result = parsePluginMetadata(loadFixture("metadata-with-choice.ts"));
        expect(result).not.toBeNull();
        const choiceParam = result?.parameters?.find((p) => p.type === "choice");
        expect(choiceParam?.options?.length).toBeGreaterThan(0);
    });

    it("returns null for missing end marker", () => {
        const result = parsePluginMetadata(loadFixture("metadata-missing-end-marker.ts"));
        expect(result).toBeNull();
    });

    it("returns null for invalid JSON", () => {
        const result = parsePluginMetadata(loadFixture("metadata-invalid-json.ts"));
        expect(result).toBeNull();
    });

    it("returns null for metadata after line 80", () => {
        const result = parsePluginMetadata(loadFixture("metadata-after-line-80.ts"));
        expect(result).toBeNull();
    });
});
