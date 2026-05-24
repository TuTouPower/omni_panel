import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createConfigStore } from "../../../src/main/core/config/config-store";
import type { AppConfiguration } from "../../../src/main/core/config/types";

let tempDir: string;

beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "config-store-test-"));
});

afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
});

describe("config-store", () => {
    it("returns default config when file does not exist", async () => {
        const store = createConfigStore(join(tempDir, "config.json"));
        const config = await store.load();
        expect(config.schemaVersion).toBe(1);
        expect(config.language).toBe("zh-Hans");
        expect(config.plugins).toEqual([]);
    });

    it("saves and loads config", async () => {
        const store = createConfigStore(join(tempDir, "config.json"));
        const config: AppConfiguration = {
            schemaVersion: 1,
            language: "en",
            overviewDisplayMode: "tabs",
            plugins: [],
            launchAtLogin: false,
        };
        await store.save(config);
        const loaded = await store.load();
        expect(loaded.language).toBe("en");
    });

    it("returns default config on corrupt JSON", async () => {
        const { writeFile } = await import("node:fs/promises");
        await writeFile(join(tempDir, "config.json"), "not json!!!");
        const store = createConfigStore(join(tempDir, "config.json"));
        const config = await store.load();
        expect(config.schemaVersion).toBe(1);
    });

    it("does not serialize id field", async () => {
        const store = createConfigStore(join(tempDir, "config.json"));
        const config: AppConfiguration = {
            schemaVersion: 1,
            language: "zh-Hans",
            overviewDisplayMode: "tabs",
            plugins: [
                {
                    stateId: "abc-123",
                    name: "test",
                    enabled: true,
                    executablePath: "/path",
                    refreshIntervalSeconds: 300,
                    parameterValues: {},
                },
            ],
            launchAtLogin: false,
        };
        await store.save(config);
        const raw = await readFile(join(tempDir, "config.json"), "utf8");
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const plugins = parsed["plugins"] as Record<string, unknown>[];
        expect(plugins[0]?.["stateId"]).toBe("abc-123");
    });
});
