import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile, chmod, mkdir } from "node:fs/promises";
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

    it("serializes concurrent saves so final state is consistent", async () => {
        const configPath = join(tempDir, "config.json");
        const store = createConfigStore(configPath);

        const configs: AppConfiguration[] = [];
        for (let i = 0; i < 20; i++) {
            configs.push({
                schemaVersion: 1,
                language: i % 2 === 0 ? "en" : "zh-Hans",
                plugins: [],
                launchAtLogin: i % 3 === 0,
            });
        }

        await Promise.all(configs.map((c) => store.save(c)));

        // All saves serialized: file must be valid JSON and parse as a valid config.
        const final = await store.load();
        expect(final.schemaVersion).toBe(1);
        expect(final.plugins).toEqual([]);

        // The last-resolved save must win. Because Promise.all preserves submission
        // order for the microtask queue but save() appends to a serial queue, the
        // final persisted config should match the last config submitted.
        const last = configs[configs.length - 1];
        if (last) {
            expect(final.language).toBe(last.language);
            expect(final.launchAtLogin).toBe(last.launchAtLogin);
        }
    });

    it("recovers save chain after a transient failure so later saves still persist", async () => {
        // The config-store serializes saves via an internal queue. A transient write
        // failure on one save must NOT poison the queue and block subsequent saves.
        const configPath = join(tempDir, "config.json");
        const store = createConfigStore(configPath);

        const valid: AppConfiguration = {
            schemaVersion: 1,
            language: "en",
            plugins: [],
            launchAtLogin: false,
        };
        await store.save(valid);

        // Make the file unwritable to force a transient write failure on next save.
        await chmod(configPath, 0o444);
        const failing: AppConfiguration = { ...valid, language: "zh-Hans" };
        await expect(store.save(failing)).rejects.toThrow();

        // Restore writability — a subsequent save must succeed and persist.
        await chmod(configPath, 0o644);
        const recovered: AppConfiguration = { ...valid, launchAtLogin: true };
        await store.save(recovered);
        const reloaded = await store.load();
        expect(reloaded.launchAtLogin).toBe(true);
    });

    it("returns default config on schema-invalid JSON", async () => {
        await writeFile(join(tempDir, "config.json"), '{"schemaVersion":1}');
        const store = createConfigStore(join(tempDir, "config.json"));
        const config = await store.load();
        expect(config.schemaVersion).toBe(1);
        expect(config.language).toBe("zh-Hans");
        expect(config.plugins).toEqual([]);
    });

    it("clamps out-of-range refreshIntervalSeconds instead of discarding the whole config", async () => {
        // Regression: previously an old config with a plugin whose
        // refreshIntervalSeconds fell outside [60, 172800] failed schema parse,
        // which caused load() to back up the file and silently fall back to
        // DEFAULT_CONFIGURATION — wiping every plugin the user had configured.
        //
        // Migration must clamp the interval into range and preserve the rest
        // of the plugin entry (and any sibling plugins).
        //
        // Note: since load() now prunes plugins whose connector manifest is
        // missing or invalid, the fixture must point at real on-disk connector
        // dirs; otherwise the prune migration would remove them and this test
        // would no longer verify the clamp path.
        const connector_root = await mkdtemp(join(tmpdir(), "cfg-clamp-root-"));
        try {
            const deepseek_dir = await write_connector_dir(connector_root, "deepseek", "deepseek");
            const openai_dir = await write_connector_dir(connector_root, "openai", "codex");
            const configPath = join(tempDir, "config.json");
            await writeFile(
                configPath,
                JSON.stringify({
                    schemaVersion: 1,
                    language: "zh-Hans",
                    plugins: [
                        {
                            stateId: "deepseek-1",
                            name: "DeepSeek",
                            enabled: true,
                            executablePath: deepseek_dir,
                            refreshIntervalSeconds: 30,
                            parameterValues: { API_KEY: "k" },
                            endpointOverrides: {},
                        },
                        {
                            stateId: "openai-1",
                            name: "OpenAI",
                            enabled: true,
                            executablePath: openai_dir,
                            refreshIntervalSeconds: 200000,
                            parameterValues: {},
                            endpointOverrides: {},
                        },
                    ],
                    launchAtLogin: false,
                }),
                "utf8",
            );
            const store = createConfigStore(configPath);
            const config = await store.load();

            // Both plugins survive; intervals clamped into range.
            expect(config.plugins).toHaveLength(2);
            const deepseek = config.plugins.find((p) => p.stateId === "deepseek-1");
            const openai = config.plugins.find((p) => p.stateId === "openai-1");
            expect(deepseek).toBeDefined();
            expect(deepseek?.refreshIntervalSeconds).toBe(60);
            expect(openai).toBeDefined();
            expect(openai?.refreshIntervalSeconds).toBe(172800);
            // Non-interval plugin data is preserved.
            expect(deepseek?.name).toBe("DeepSeek");
            expect(deepseek?.parameterValues["API_KEY"]).toBe("k");
        } finally {
            await rm(connector_root, { recursive: true, force: true });
        }
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
            const connector_root = await mkdtemp(join(tmpdir(), "cfg-logs-root-"));
            const claude_dir = await write_connector_dir(connector_root, "claude", "claude");
            try {
                const configPath = join(tempDir, "config.json");
                const store = createConfigStore(configPath);
                const config: AppConfiguration = {
                    schemaVersion: 1,
                    language: "zh-Hans",
                    plugins: [],
                    launchAtLogin: false,
                    usageBarColorScheme: "risk-projected",
                    usageBarStyle: "capsule",
                    providerLabelMaps: { gemini: { "gemini-long": "Gemini Short" } },
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
                                executablePath: claude_dir,
                                refreshIntervalSeconds: 300,
                                parameterValues: {},
                                endpointOverrides: {},
                            },
                        ],
                        launchAtLogin: false,
                        usageBarColorScheme: "risk-projected",
                        usageBarStyle: "capsule",
                        providerLabelMaps: { gemini: { "gemini-long": "Gemini Short" } },
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
                expect(joined).toContain("[redacted]");
                expect(joined).not.toContain("Gemini Short");
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
                await rm(connector_root, { recursive: true, force: true });
            }
        } finally {
            if (original_node_env === undefined) {
                delete process.env["NODE_ENV"];
            } else {
                process.env["NODE_ENV"] = original_node_env;
            }
            remove_transport();
        }
    });

    // Helper: write a fake connector directory with a manifest.json.
    async function write_connector_dir(
        parent: string,
        id: string,
        provider: string,
    ): Promise<string> {
        const dir = join(parent, id);
        await mkdir(dir, { recursive: true });
        await writeFile(
            join(dir, "manifest.json"),
            JSON.stringify({
                id,
                provider,
                capabilities: ["local"],
                parameters: [],
                local: { paths: ["~/foo"] },
            }),
            "utf8",
        );
        return dir;
    }

    it("prunes plugins whose connector manifest has a provider outside usageProviderSchema", async () => {
        // Regression: connectors/test-observe was previously bundled and
        // auto-seeded into config.json. After moving the fixture out and adding
        // a provider whitelist to manifest-loader, NEW loads would skip it, but
        // EXISTING config.json entries with `executablePath` pointing at a
        // directory whose manifest.json has `provider: "test-observe"` (or
        // similar) would survive forever, showing as `unknown TEST-OBSERVE` in
        // the UI. load() must prune such plugins and persist the cleaned config.
        const connector_root = await mkdtemp(join(tmpdir(), "cfg-prune-root-"));
        try {
            // legit connector with provider in usageProviderSchema.
            const claude_dir = await write_connector_dir(connector_root, "claude", "claude");
            // illegal provider "test-observe" not in usageProviderSchema.
            const test_observe_dir = await write_connector_dir(
                connector_root,
                "test-observe",
                "test-observe",
            );

            const config_path = join(tempDir, "config.json");
            await writeFile(
                config_path,
                JSON.stringify({
                    schemaVersion: 1,
                    language: "zh-Hans",
                    plugins: [
                        {
                            instanceId: "claude-1",
                            stateId: "claude-1",
                            name: "Claude",
                            enabled: true,
                            executablePath: claude_dir,
                            refreshIntervalSeconds: 300,
                            parameterValues: {},
                            endpointOverrides: {},
                        },
                        {
                            instanceId: "test-1",
                            stateId: "test-1",
                            name: "TEST-OBSERVE",
                            enabled: true,
                            executablePath: test_observe_dir,
                            refreshIntervalSeconds: 300,
                            parameterValues: {},
                            endpointOverrides: {},
                        },
                    ],
                    launchAtLogin: false,
                }),
                "utf8",
            );

            const store = createConfigStore(config_path);
            const loaded = await store.load();

            // test-observe pruned; claude retained.
            expect(loaded.plugins).toHaveLength(1);
            expect(loaded.plugins[0]?.instanceId).toBe("claude-1");

            // Persistence: reloading from disk shows the pruned state.
            const raw_after = JSON.parse(await readFile(config_path, "utf8")) as {
                plugins: { instanceId: string }[];
            };
            const ids_after = raw_after.plugins.map((p) => p.instanceId);
            expect(ids_after).toEqual(["claude-1"]);
        } finally {
            await rm(connector_root, { recursive: true, force: true });
        }
    });

    it("prunes orphan plugins whose executablePath no longer exists", async () => {
        // If a connector directory has been deleted (or moved away, as
        // happened to test-observe), plugin entries pointing at it become
        // orphans. load() should drop them and persist.
        const connector_root = await mkdtemp(join(tmpdir(), "cfg-orphan-root-"));
        try {
            const claude_dir = await write_connector_dir(connector_root, "claude", "claude");
            // Point at a directory that has no manifest.json at all.
            const orphan_dir = join(connector_root, "does-not-exist");

            const config_path = join(tempDir, "config.json");
            await writeFile(
                config_path,
                JSON.stringify({
                    schemaVersion: 1,
                    language: "zh-Hans",
                    plugins: [
                        {
                            instanceId: "claude-1",
                            stateId: "claude-1",
                            name: "Claude",
                            enabled: true,
                            executablePath: claude_dir,
                            refreshIntervalSeconds: 300,
                            parameterValues: {},
                            endpointOverrides: {},
                        },
                        {
                            instanceId: "orphan-1",
                            stateId: "orphan-1",
                            name: "ORPHAN",
                            enabled: true,
                            executablePath: orphan_dir,
                            refreshIntervalSeconds: 300,
                            parameterValues: {},
                            endpointOverrides: {},
                        },
                    ],
                    launchAtLogin: false,
                }),
                "utf8",
            );

            const store = createConfigStore(config_path);
            const loaded = await store.load();

            expect(loaded.plugins).toHaveLength(1);
            expect(loaded.plugins[0]?.instanceId).toBe("claude-1");

            const raw_after = JSON.parse(await readFile(config_path, "utf8")) as {
                plugins: { instanceId: string }[];
            };
            const ids_after = raw_after.plugins.map((p) => p.instanceId);
            expect(ids_after).toEqual(["claude-1"]);
        } finally {
            await rm(connector_root, { recursive: true, force: true });
        }
    });

    it("keeps plugins whose connector manifest has a valid provider and existing path", async () => {
        // Negative control: legitimate providers must survive the migration.
        const connector_root = await mkdtemp(join(tmpdir(), "cfg-keep-root-"));
        try {
            const claude_dir = await write_connector_dir(connector_root, "claude", "claude");
            const deepseek_dir = await write_connector_dir(connector_root, "deepseek", "deepseek");
            const cpa_dir = await write_connector_dir(connector_root, "cpa", "cpa");

            const config_path = join(tempDir, "config.json");
            await writeFile(
                config_path,
                JSON.stringify({
                    schemaVersion: 1,
                    language: "zh-Hans",
                    plugins: [
                        {
                            instanceId: "claude-1",
                            stateId: "claude-1",
                            name: "Claude",
                            enabled: true,
                            executablePath: claude_dir,
                            refreshIntervalSeconds: 300,
                            parameterValues: {},
                            endpointOverrides: {},
                        },
                        {
                            instanceId: "deepseek-1",
                            stateId: "deepseek-1",
                            name: "DeepSeek",
                            enabled: true,
                            executablePath: deepseek_dir,
                            refreshIntervalSeconds: 300,
                            parameterValues: {},
                            endpointOverrides: {},
                        },
                        {
                            instanceId: "cpa-1",
                            stateId: "cpa-1",
                            name: "CPA",
                            enabled: true,
                            executablePath: cpa_dir,
                            refreshIntervalSeconds: 300,
                            parameterValues: {},
                            endpointOverrides: {},
                        },
                    ],
                    launchAtLogin: false,
                }),
                "utf8",
            );

            const store = createConfigStore(config_path);
            const loaded = await store.load();

            expect(loaded.plugins).toHaveLength(3);
            const ids = loaded.plugins.map((p) => p.instanceId).sort();
            expect(ids).toEqual(["claude-1", "cpa-1", "deepseek-1"]);
        } finally {
            await rm(connector_root, { recursive: true, force: true });
        }
    });
});
