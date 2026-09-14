import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AppConfiguration } from "../../../../src/shared/types/config";
import type { ConnectorDefinition } from "../../../../src/main/core/connector/manifest-loader";
import type { SecretsStore } from "../../../../src/main/core/config/secrets-store";
import type { AppConfigStore } from "../../../../src/main/core/config/config-store";
import { import_config_file } from "../../../../src/main/cli/import-config";

let tmp: string | undefined;

afterEach(() => {
    if (tmp) {
        rmSync(tmp, { recursive: true, force: true });
        tmp = undefined;
    }
});

function makeDir(): string {
    tmp ??= mkdtempSync(join(tmpdir(), "omni-cli-import-"));
    return tmp;
}

function makeDefinition(path = "/plugins/claude.py"): ConnectorDefinition {
    return {
        executablePath: path,
        directory: path,
        manifest: {
            id: "claude",
            name: "Claude",
            version: "1.0.0",
            provider: "anthropic",
            capabilities: ["poll"],
            parameters: [
                { name: "API_KEY", type: "secret", required: true, exposeToScript: false },
                { name: "MODEL", type: "string", required: false, exposeToScript: false },
            ],
            auth: { method: "apikey", secret_name: "API_KEY" },
        },
    } as ConnectorDefinition;
}

function makeConfig(path = "/plugins/claude.py"): AppConfiguration {
    return {
        schemaVersion: 1,
        language: "zh-Hans",
        plugins: [
            {
                instanceId: "claude-1",
                stateId: "claude-1",
                manifestId: "claude",
                name: "Claude",
                enabled: true,
                executablePath: path,
                refreshIntervalSeconds: 300,
                parameterValues: { MODEL: "gpt-4" },
                endpointOverrides: {},
            },
        ],
        launchAtLogin: false,
    };
}

function transfer(config: unknown, secrets?: Record<string, string>): Record<string, unknown> {
    return {
        formatVersion: 2,
        exportedAt: "2026-05-31T00:00:00Z",
        appVersion: "1.0.0",
        config,
        ...(secrets === undefined ? {} : { secrets }),
    };
}

function makeDeps(initialConfig = makeConfig(), initialSecrets: Record<string, string> = {}) {
    let config = structuredClone(initialConfig);
    const savedConfigs: AppConfiguration[] = [];
    const secrets = { ...initialSecrets };
    let snapshot = { ...secrets };
    const configStore: AppConfigStore = {
        load: vi.fn().mockImplementation(() => Promise.resolve(structuredClone(config))),
        save: vi.fn().mockImplementation((next: AppConfiguration) => {
            config = structuredClone(next);
            savedConfigs.push(structuredClone(next));
            return Promise.resolve();
        }),
        saveIfBaseMatches: vi.fn().mockResolvedValue("saved"),
        scheduleSave: vi.fn(),
        flushPendingSave: vi.fn().mockResolvedValue(undefined),
        hasPendingSave: vi.fn(() => false),
        prune_unhealthy_plugins: vi.fn().mockResolvedValue(config),
    };
    const secretsStore: SecretsStore = {
        get: vi.fn().mockImplementation((key: string) => Promise.resolve(secrets[key] ?? null)),
        set: vi.fn().mockImplementation((key: string, value: string) => {
            secrets[key] = value;
            return Promise.resolve();
        }),
        delete: vi.fn().mockImplementation((key: string) => {
            Reflect.deleteProperty(secrets, key);
            return Promise.resolve();
        }),
        exportAll: vi.fn().mockImplementation(() => Promise.resolve({ ...secrets })),
        importAll: vi.fn().mockImplementation((next: Record<string, string>) => {
            for (const key of Object.keys(secrets)) Reflect.deleteProperty(secrets, key);
            Object.assign(secrets, next);
            return Promise.resolve();
        }),
        writeImportSnapshot: vi.fn().mockImplementation(() => {
            snapshot = { ...secrets };
        }),
        restoreImportSnapshot: vi.fn().mockImplementation(() => {
            for (const key of Object.keys(secrets)) Reflect.deleteProperty(secrets, key);
            Object.assign(secrets, snapshot);
        }),
    };
    return { configStore, secretsStore, savedConfigs, secrets };
}

describe("import_config_file", () => {
    it("使用 canonical v2 导入并把顶层 secret 写入 vault", async () => {
        const dir = makeDir();
        const configPath = join(dir, "config.json");
        const importFile = join(dir, "import.json");
        writeFileSync(
            importFile,
            JSON.stringify(transfer(makeConfig(), { "claude-1:API_KEY": "sk-live-secret" })),
        );
        const deps = makeDeps();

        const result = await import_config_file(
            {
                configPath,
                configStore: deps.configStore,
                secretsStore: deps.secretsStore,
                definitions: [makeDefinition()],
            },
            importFile,
        );

        expect(deps.secrets["claude-1:API_KEY"]).toBe("sk-live-secret");
        expect(result.plugins[0]?.parameterValues).toEqual({ MODEL: "gpt-4" });
        expect(deps.savedConfigs[0]?.plugins[0]?.parameterValues).toEqual({ MODEL: "gpt-4" });
    });

    it("按 manifestId 将导入路径重映射为本机 definition 路径", async () => {
        const dir = makeDir();
        const configPath = join(dir, "config.json");
        const importFile = join(dir, "moved.json");
        writeFileSync(importFile, JSON.stringify(transfer(makeConfig("/linux/connectors/claude"))));
        const deps = makeDeps();

        const result = await import_config_file(
            {
                configPath,
                configStore: deps.configStore,
                secretsStore: deps.secretsStore,
                definitions: [makeDefinition("/mac/connectors/claude")],
            },
            importFile,
        );

        expect(result.plugins[0]?.executablePath).toBe("/mac/connectors/claude");
    });

    it("未知 manifest 被跳过且其显式 secret 不进入 vault", async () => {
        const dir = makeDir();
        const configPath = join(dir, "config.json");
        const importFile = join(dir, "unknown.json");
        const unknown = {
            ...makeConfig(),
            plugins: [
                { ...makeConfig().plugins[0], manifestId: "unknown", instanceId: "unknown-1" },
            ],
        };
        writeFileSync(
            importFile,
            JSON.stringify(transfer(unknown, { "unknown-1:API_KEY": "sk-unknown" })),
        );
        const deps = makeDeps();

        const result = await import_config_file(
            {
                configPath,
                configStore: deps.configStore,
                secretsStore: deps.secretsStore,
                definitions: [makeDefinition()],
            },
            importFile,
        );

        expect(result.plugins).toEqual([]);
        expect(deps.secrets["unknown-1:API_KEY"]).toBeUndefined();
        expect(deps.savedConfigs).toHaveLength(1);
    });

    it("拒绝 v1 和裸 config 文件，并报告实际版本", async () => {
        const dir = makeDir();
        const configPath = join(dir, "config.json");
        const importFile = join(dir, "old.json");
        writeFileSync(importFile, JSON.stringify({ formatVersion: 1 }));
        const deps = makeDeps();

        await expect(
            import_config_file(
                {
                    configPath,
                    configStore: deps.configStore,
                    secretsStore: deps.secretsStore,
                    definitions: [makeDefinition()],
                },
                importFile,
            ),
        ).rejects.toThrow(/版本.*1/);
        expect((deps.configStore.save as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
        expect((deps.secretsStore.importAll as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(
            0,
        );

        writeFileSync(importFile, JSON.stringify(makeConfig()));
        await expect(
            import_config_file(
                {
                    configPath,
                    configStore: deps.configStore,
                    secretsStore: deps.secretsStore,
                    definitions: [makeDefinition()],
                },
                importFile,
            ),
        ).rejects.toThrow(/版本.*缺失/);
    });

    it("schema 校验失败时不写 config 或 vault", async () => {
        const dir = makeDir();
        const configPath = join(dir, "config.json");
        const importFile = join(dir, "bad-schema.json");
        writeFileSync(
            importFile,
            JSON.stringify(transfer({ schemaVersion: 1, language: "zh-Hans" })),
        );
        const deps = makeDeps();

        await expect(
            import_config_file(
                {
                    configPath,
                    configStore: deps.configStore,
                    secretsStore: deps.secretsStore,
                    definitions: [makeDefinition()],
                },
                importFile,
            ),
        ).rejects.toThrow(/配置格式无效/);
        expect((deps.configStore.save as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
        expect((deps.secretsStore.importAll as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(
            0,
        );
    });

    it("导入前先生成 config 与加密 vault 快照", async () => {
        const dir = makeDir();
        const configPath = join(dir, "config.json");
        const importFile = join(dir, "import.json");
        writeFileSync(configPath, JSON.stringify(makeConfig()));
        writeFileSync(importFile, JSON.stringify(transfer(makeConfig())));
        const deps = makeDeps();

        await import_config_file(
            {
                configPath,
                configStore: deps.configStore,
                secretsStore: deps.secretsStore,
                definitions: [makeDefinition()],
            },
            importFile,
        );

        expect(JSON.parse(readFileSync(`${configPath}.bak`, "utf8"))).toEqual(makeConfig());
        const write_snapshot = Reflect.get(deps.secretsStore, "writeImportSnapshot") as ReturnType<
            typeof vi.fn
        >;
        expect(write_snapshot.mock.calls).toEqual([[join(dir, "secrets.vault.import.bak")]]);
    });

    it("备份失败时中止且不进入写入阶段", async () => {
        const dir = makeDir();
        const configPath = join(dir, "config.json");
        const importFile = join(dir, "import.json");
        mkdirSync(configPath);
        writeFileSync(importFile, JSON.stringify(transfer(makeConfig())));
        const deps = makeDeps();

        await expect(
            import_config_file(
                {
                    configPath,
                    configStore: deps.configStore,
                    secretsStore: deps.secretsStore,
                    definitions: [makeDefinition()],
                },
                importFile,
            ),
        ).rejects.toThrow();
        expect((deps.configStore.save as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
        expect((deps.secretsStore.importAll as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(
            0,
        );
    });

    it("vault 写入失败时恢复 config 与 vault 前态", async () => {
        const dir = makeDir();
        const configPath = join(dir, "config.json");
        const importFile = join(dir, "import.json");
        const deps = makeDeps(makeConfig(), { "claude-1:API_KEY": "old" });
        writeFileSync(
            importFile,
            JSON.stringify(transfer(makeConfig(), { "claude-1:API_KEY": "new" })),
        );
        deps.secretsStore.importAll = vi.fn().mockImplementation((next: Record<string, string>) => {
            for (const key of Object.keys(deps.secrets)) Reflect.deleteProperty(deps.secrets, key);
            Object.assign(deps.secrets, next);
            return Promise.reject(new Error("vault write failed"));
        });

        await expect(
            import_config_file(
                {
                    configPath,
                    configStore: deps.configStore,
                    secretsStore: deps.secretsStore,
                    definitions: [makeDefinition()],
                },
                importFile,
            ),
        ).rejects.toThrow("vault write failed");
        expect(deps.secrets).toEqual({ "claude-1:API_KEY": "old" });
        expect(await deps.configStore.load()).toEqual(makeConfig());
    });

    it("无 secrets 字段保留活动实例密钥并清理悬空密钥，空对象则清空", async () => {
        const dir = makeDir();
        const configPath = join(dir, "config.json");
        const importFile = join(dir, "import.json");
        const deps = makeDeps(makeConfig(), {
            "claude-1:API_KEY": "keep",
            "removed:API_KEY": "drop",
        });
        writeFileSync(importFile, JSON.stringify(transfer(makeConfig())));
        await import_config_file(
            {
                configPath,
                configStore: deps.configStore,
                secretsStore: deps.secretsStore,
                definitions: [makeDefinition()],
            },
            importFile,
        );
        expect(deps.secrets).toEqual({ "claude-1:API_KEY": "keep" });

        writeFileSync(importFile, JSON.stringify(transfer(makeConfig(), {})));
        await import_config_file(
            {
                configPath,
                configStore: deps.configStore,
                secretsStore: deps.secretsStore,
                definitions: [makeDefinition()],
            },
            importFile,
        );
        expect(deps.secrets).toEqual({});
    });
});
