import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parsePluginMetadata } from "../../../src/main/core/plugin/metadata-parser";

const fixturesDir = resolve(__dirname, "../../../fixtures/plugin-metadata");

function loadFixture(name: string): string {
    return readFileSync(resolve(fixturesDir, name), "utf8");
}

describe("parsePluginMetadata", () => {
    it("parses metadata-basic.py", () => {
        const result = parsePluginMetadata(loadFixture("metadata-basic.py"));
        expect(result).not.toBeNull();
        expect(result?.parameters?.length).toBeGreaterThan(0);
    });

    it("parses metadata-with-secret.py", () => {
        const result = parsePluginMetadata(loadFixture("metadata-with-secret.py"));
        expect(result).not.toBeNull();
        const secretParam = result?.parameters?.find((p) => p.type === "secret");
        expect(secretParam).toBeDefined();
    });

    it("parses metadata-with-choice.py", () => {
        const result = parsePluginMetadata(loadFixture("metadata-with-choice.py"));
        expect(result).not.toBeNull();
        const choiceParam = result?.parameters?.find((p) => p.type === "choice");
        expect(choiceParam?.options?.length).toBeGreaterThan(0);
    });

    it("returns null for missing end marker", () => {
        const result = parsePluginMetadata(loadFixture("metadata-missing-end-marker.py"));
        expect(result).toBeNull();
    });

    it("returns null for invalid JSON", () => {
        const result = parsePluginMetadata(loadFixture("metadata-invalid-json.py"));
        expect(result).toBeNull();
    });

    it("returns null for metadata after line 80", () => {
        const result = parsePluginMetadata(loadFixture("metadata-after-line-80.py"));
        expect(result).toBeNull();
    });
});
