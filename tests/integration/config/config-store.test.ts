import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
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
            plugins: [],
            launchAtLogin: false,
        };
        await store.save(config);
        const loaded = await store.load();
        expect(loaded.language).toBe("en");
    });

    it("loads old config with overviewDisplayMode and saves without it", async () => {
        const configPath = join(tempDir, "config.json");
        await writeFile(
            configPath,
            JSON.stringify({
                schemaVersion: 1,
                language: "zh-Hans",
                overviewDisplayMode: "tabs",
                plugins: [],
                launchAtLogin: false,
            }),
            "utf8",
        );
        const store = createConfigStore(configPath);
        const config = await store.load();
        expect("overviewDisplayMode" in config).toBe(false);

        await store.save(config);
        const raw = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
        expect(raw).not.toHaveProperty("overviewDisplayMode");
    });

    it("returns default config on corrupt JSON", async () => {
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
            plugins: [
                {
                    instanceId: "abc-123",
                    stateId: "abc-123",
                    name: "test",
                    enabled: true,
                    executablePath: "/path",
                    refreshIntervalSeconds: 300,
                    parameterValues: {},
                    endpointOverrides: {},
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

    it("returns default config on schema-invalid JSON", async () => {
        await writeFile(join(tempDir, "config.json"), '{"schemaVersion":1}');
        const store = createConfigStore(join(tempDir, "config.json"));
        const config = await store.load();
        expect(config.schemaVersion).toBe(1);
        expect(config.language).toBe("zh-Hans");
        expect(config.plugins).toEqual([]);
    });
});
