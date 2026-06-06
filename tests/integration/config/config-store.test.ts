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

    it("logs raw config load and save payloads only in development", async () => {
        const { addTransport, setLogLevel } = await import("../../../src/shared/lib/logger");
        const original_node_env = process.env["NODE_ENV"];
        const lines: string[] = [];
        const remove_transport = addTransport({
            write(level, module, message, meta) {
                lines.push(`${level}:${module}:${message}:${JSON.stringify(meta)}`);
            },
        });
        setLogLevel("debug");

        try {
            process.env["NODE_ENV"] = "development";
            const configPath = join(tempDir, "config.json");
            const store = createConfigStore(configPath);
            const config: AppConfiguration = {
                schemaVersion: 1,
                language: "zh-Hans",
                plugins: [],
                launchAtLogin: false,
                usageBarColorScheme: "risk-projected",
            };
            await store.save(config);
            await writeFile(
                configPath,
                JSON.stringify({
                    schemaVersion: 1,
                    language: "zh-Hans",
                    overviewDisplayMode: "tabs",
                    plugins: [
                        {
                            stateId: "state-1",
                            name: "test",
                            enabled: true,
                            executablePath: "/path",
                            refreshIntervalSeconds: 300,
                            parameterValues: {},
                            endpointOverrides: {},
                        },
                    ],
                    launchAtLogin: false,
                    usageBarColorScheme: "risk-projected",
                }),
                "utf8",
            );
            await store.load();

            let joined = lines.join("\n");
            expect(joined).toContain("config save payload raw");
            expect(joined).toContain("config save complete raw");
            expect(joined).toContain("config load raw");
            expect(joined).toContain("config parsed raw");
            expect(joined).toContain("risk-projected");
            const parsedLine = lines.find((line) => line.includes("config parsed raw")) ?? "";
            expect(parsedLine).toContain('"instanceId":"state-1"');
            expect(parsedLine).not.toContain("overviewDisplayMode");

            lines.length = 0;
            process.env["NODE_ENV"] = "production";
            await store.save(config);
            await store.load();

            joined = lines.join("\n");
            expect(joined).not.toContain("config save payload raw");
            expect(joined).not.toContain("config load raw");
            expect(joined).not.toContain("risk-projected");
        } finally {
            if (original_node_env === undefined) {
                delete process.env["NODE_ENV"];
            } else {
                process.env["NODE_ENV"] = original_node_env;
            }
            remove_transport();
        }
    });
});
