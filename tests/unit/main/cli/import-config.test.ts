import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
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

/** 含一个 secret 参数 API_KEY 的 connector definition。 */
function makeDefinition(): ConnectorDefinition {
    return {
        executablePath: "/plugins/claude.py",
        directory: "/plugins/claude.py",
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

function makeDeps() {
    const savedConfigs: AppConfiguration[] = [];
    const secrets: Record<string, string> = {};
    const configStore: AppConfigStore = {
        load: vi.fn().mockResolvedValue(undefined),
        save: vi.fn().mockImplementation((cfg: AppConfiguration) => {
            savedConfigs.push(cfg);
            return Promise.resolve();
        }),
        saveIfBaseMatches: vi.fn().mockImplementation((_base, cfg: AppConfiguration) => {
            savedConfigs.push(cfg);
            return Promise.resolve("saved");
        }),
        scheduleSave: vi.fn(),
        flushPendingSave: vi.fn().mockResolvedValue(undefined),
        hasPendingSave: vi.fn(() => false),
        prune_unhealthy_plugins: vi.fn().mockResolvedValue(undefined),
    };
    const deleteMock = vi.fn().mockImplementation((k: string) => {
        Reflect.deleteProperty(secrets, k);
        return Promise.resolve();
    });
    const secretsStore: SecretsStore = {
        get: vi.fn().mockImplementation((k: string) => Promise.resolve(secrets[k] ?? null)),
        set: vi.fn().mockImplementation((k: string, v: string) => {
            secrets[k] = v;
            return Promise.resolve();
        }),
        delete: deleteMock,
        exportAll: vi.fn().mockResolvedValue({}),
        importAll: vi.fn().mockResolvedValue(undefined),
    };
    return { configStore, secretsStore, savedConfigs, secrets, deleteMock };
}

describe("import_config_file", () => {
    it("明文 secret 抽出转存 vault，落盘配置不保留明文", async () => {
        const dir = makeDir();
        const configPath = join(dir, "config.json");
        const importFile = join(dir, "import.json");
        const config = {
            schemaVersion: 1,
            language: "zh-Hans",
            plugins: [
                {
                    instanceId: "claude-1",
                    stateId: "claude-1",
                    name: "Claude",
                    enabled: true,
                    executablePath: "/plugins/claude.py",
                    refreshIntervalSeconds: 300,
                    parameterValues: { API_KEY: "sk-live-secret", MODEL: "gpt-4" },
                    endpointOverrides: {},
                },
            ],
            launchAtLogin: false,
        };
        writeFileSync(importFile, JSON.stringify(config));
        const { configStore, secretsStore, savedConfigs, secrets } = makeDeps();

        const result = await import_config_file(
            { configPath, configStore, secretsStore, definitions: [makeDefinition()] },
            importFile,
        );

        // secret 转存 vault
        expect(secrets["claude-1:API_KEY"]).toBe("sk-live-secret");
        // 落盘配置剥离明文 secret，保留非 secret 参数
        expect(result.plugins[0]?.parameterValues).toEqual({ MODEL: "gpt-4" });
        expect(savedConfigs[0]?.plugins[0]?.parameterValues).toEqual({ MODEL: "gpt-4" });
        // 非 secret 参数不入 vault
        expect(secrets["claude-1:MODEL"]).toBeUndefined();
    });

    it("拒绝未知 connector 路径并在转存 secret 前失败", async () => {
        const dir = makeDir();
        const configPath = join(dir, "config.json");
        const importFile = join(dir, "unknown.json");
        writeFileSync(
            importFile,
            JSON.stringify({
                schemaVersion: 1,
                language: "zh-Hans",
                plugins: [
                    {
                        instanceId: "unknown-1",
                        stateId: "unknown-1",
                        name: "Unknown",
                        enabled: true,
                        executablePath: "/plugins/unknown.py",
                        refreshIntervalSeconds: 300,
                        parameterValues: { API_KEY: "sk-unknown" },
                        endpointOverrides: {},
                    },
                ],
                launchAtLogin: false,
            }),
        );
        const { configStore, secretsStore } = makeDeps();

        await expect(
            import_config_file(
                { configPath, configStore, secretsStore, definitions: [makeDefinition()] },
                importFile,
            ),
        ).rejects.toThrow(/未知连接器路径/);
        expect(Reflect.get(secretsStore, "set")).not.toHaveBeenCalled();
        expect(Reflect.get(configStore, "save")).not.toHaveBeenCalled();
    });

    it("非 JSON 文件抛错", async () => {
        const dir = makeDir();
        const configPath = join(dir, "config.json");
        const importFile = join(dir, "bad.json");
        writeFileSync(importFile, "not json at all");
        const { configStore, secretsStore } = makeDeps();

        await expect(
            import_config_file(
                { configPath, configStore, secretsStore, definitions: [makeDefinition()] },
                importFile,
            ),
        ).rejects.toThrow(/不是合法 JSON/);
    });

    it("schema 不合法抛错（缺必填字段）", async () => {
        const dir = makeDir();
        const configPath = join(dir, "config.json");
        const importFile = join(dir, "schema-bad.json");
        // 缺 plugins / launchAtLogin
        writeFileSync(importFile, JSON.stringify({ schemaVersion: 1, language: "zh-Hans" }));
        const { configStore, secretsStore } = makeDeps();

        await expect(
            import_config_file(
                { configPath, configStore, secretsStore, definitions: [makeDefinition()] },
                importFile,
            ),
        ).rejects.toThrow(/schema 校验失败/);
    });

    it("无现有 config.json 时跳过备份，正常导入", async () => {
        const dir = makeDir();
        const configPath = join(dir, "config.json");
        const importFile = join(dir, "import.json");
        const config = {
            schemaVersion: 1,
            language: "zh-Hans",
            plugins: [],
            launchAtLogin: false,
        };
        writeFileSync(importFile, JSON.stringify(config));
        const { configStore, secretsStore, savedConfigs } = makeDeps();

        const result = await import_config_file(
            { configPath, configStore, secretsStore, definitions: [] },
            importFile,
        );
        expect(result.plugins).toEqual([]);
        expect(savedConfigs).toHaveLength(1);
        // 无 .bak（无现有配置可备份）
        expect(existsSync(`${configPath}.bak`)).toBe(false);
    });

    it("已有 config.json 时先备份到 .bak 再覆盖写", async () => {
        const dir = makeDir();
        const configPath = join(dir, "config.json");
        writeFileSync(configPath, JSON.stringify({ old: true }));
        const importFile = join(dir, "import.json");
        const config = {
            schemaVersion: 1,
            language: "zh-Hans",
            plugins: [],
            launchAtLogin: false,
        };
        writeFileSync(importFile, JSON.stringify(config));
        const { configStore, secretsStore, savedConfigs } = makeDeps();

        await import_config_file(
            { configPath, configStore, secretsStore, definitions: [] },
            importFile,
        );
        // .bak 保留旧配置
        expect(JSON.parse(readFileSync(`${configPath}.bak`, "utf8"))).toEqual({ old: true });
        expect(savedConfigs).toHaveLength(1);
    });

    it("config save 失败时回滚已转存的 vault secret（AC8 无半初始化残留）", async () => {
        const dir = makeDir();
        const configPath = join(dir, "config.json");
        const importFile = join(dir, "import.json");
        const config = {
            schemaVersion: 1,
            language: "zh-Hans",
            plugins: [
                {
                    instanceId: "claude-1",
                    stateId: "claude-1",
                    name: "Claude",
                    enabled: true,
                    executablePath: "/plugins/claude.py",
                    refreshIntervalSeconds: 300,
                    parameterValues: { API_KEY: "sk-live-secret" },
                    endpointOverrides: {},
                },
            ],
            launchAtLogin: false,
        };
        writeFileSync(importFile, JSON.stringify(config));
        const { configStore, secretsStore, secrets, deleteMock } = makeDeps();
        // save 抛错模拟磁盘写失败
        (configStore.save as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
            new Error("disk full"),
        );

        await expect(
            import_config_file(
                { configPath, configStore, secretsStore, definitions: [makeDefinition()] },
                importFile,
            ),
        ).rejects.toThrow("disk full");

        // 本次转存的 secret 已回滚删除，vault 无残留
        expect(secrets["claude-1:API_KEY"]).toBeUndefined();
        expect(deleteMock).toHaveBeenCalledWith("claude-1:API_KEY");
    });

    it("重复导入且 save 失败时回滚保留导入前已存在的 vault 值（p094 回滚边界）", async () => {
        const dir = makeDir();
        const configPath = join(dir, "config.json");
        const importFile = join(dir, "import.json");
        const config = {
            schemaVersion: 1,
            language: "zh-Hans",
            plugins: [
                {
                    instanceId: "claude-1",
                    stateId: "claude-1",
                    name: "Claude",
                    enabled: true,
                    executablePath: "/plugins/claude.py",
                    refreshIntervalSeconds: 300,
                    parameterValues: { API_KEY: "sk-live-secret" },
                    endpointOverrides: {},
                },
            ],
            launchAtLogin: false,
        };
        writeFileSync(importFile, JSON.stringify(config));
        const { configStore, secretsStore, secrets, deleteMock } = makeDeps();

        // 首轮成功导入：vault 写入 claude-1:API_KEY = sk-live-secret
        await import_config_file(
            { configPath, configStore, secretsStore, definitions: [makeDefinition()] },
            importFile,
        );
        expect(secrets["claude-1:API_KEY"]).toBe("sk-live-secret");

        // 二轮重复导入同一 key、不同值，config save 失败 → 回滚须恢复首轮旧值
        const importFile2 = join(dir, "import2.json");
        const plugin0 = config.plugins[0];
        if (!plugin0) throw new Error("fixture 缺 plugin");
        writeFileSync(
            importFile2,
            JSON.stringify({
                ...config,
                plugins: [{ ...plugin0, parameterValues: { API_KEY: "sk-second-secret" } }],
            }),
        );
        (configStore.save as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
            new Error("disk full"),
        );
        await expect(
            import_config_file(
                { configPath, configStore, secretsStore, definitions: [makeDefinition()] },
                importFile2,
            ),
        ).rejects.toThrow("disk full");

        // 回滚只撤销本次覆盖：vault 恢复首轮旧值，不误删也不残留二轮新值
        expect(secrets["claude-1:API_KEY"]).toBe("sk-live-secret");
        expect(deleteMock).not.toHaveBeenCalledWith("claude-1:API_KEY");
    });
});
