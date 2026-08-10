/**
 * `--config <path>` 启动导入（t275）。
 *
 * 导入文件是规范 config.json 形态（AppConfiguration），secret 参数以明文内嵌于
 * `plugins[].parameterValues`。导入语义：把文件内容覆盖写入规范 config.json（走现有
 * configStore 原子写与 zod 校验），明文 secret 字段抽出转存 vault，落盘的规范配置只保留
 * 非 secret 参数（`hasSecret` 语义由 renderer 经 config:getSecrets 读取 vault 时推导）。
 */
import { readFile } from "node:fs/promises";
import { createLogger } from "../../shared/lib/logger";
import { appConfigurationSchema } from "../core/config/types";
import type { AppConfiguration } from "../../shared/types/config";
import {
    build_secret_param_keys,
    find_unknown_executable_paths,
} from "../core/config/secret_param_keys";
import { keyFor, type SecretsStore } from "../core/config/secrets-store";
import type { AppConfigStore } from "../core/config/config-store";
import type { ConnectorDefinition } from "../core/connector/manifest-loader";
import { writeFileAtomic } from "../core/storage/write-json";

const log = createLogger("cli:import");

export interface ImportConfigDeps {
    /** 规范 config.json 绝对路径（userData 下），用于导入前备份 .bak。 */
    configPath: string;
    configStore: AppConfigStore;
    secretsStore: SecretsStore;
    definitions: readonly ConnectorDefinition[];
}

/**
 * 导入配置文件：校验 → 提取明文 secret 转存 vault → 剥离 secret → 备份现有配置到
 * `.bak` → 原子覆盖写 config.json。返回剥离后的配置。
 *
 * 失败（文件不存在 / 非法 JSON / schema 不匹配）抛错，由调用方以非零退出码终止，
 * 已写的 `.bak` 保留现有配置可供恢复（AC8「不留半初始化状态」）。
 */
export async function import_config_file(
    deps: ImportConfigDeps,
    file: string,
): Promise<AppConfiguration> {
    let raw: string;
    try {
        raw = await readFile(file, "utf8");
    } catch (err: unknown) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`配置文件无法读取: ${file}（${detail}）`);
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error(`配置文件不是合法 JSON: ${file}`);
    }
    const result = appConfigurationSchema.safeParse(parsed);
    if (!result.success) {
        throw new Error(`配置文件 schema 校验失败: ${result.error.message}`);
    }
    const config = result.data as AppConfiguration;
    const unknown_paths = find_unknown_executable_paths(config, deps.definitions);
    if (unknown_paths.length > 0) {
        throw new Error(`配置文件包含未知连接器路径: ${unknown_paths.join(", ")}`);
    }

    const secretKeys = build_secret_param_keys(config, deps.definitions);
    // 记录本次转存的 vault key 与回滚动作：save 失败时撤销本次变更——
    // 新建的 key 删除，覆盖已有值的 key 恢复旧值（不误删导入前已存在的凭据，p094 边界）。
    const rollback_entries: (
        | { key: string; action: "delete" }
        | { key: string; action: "restore"; value: string }
    )[] = [];
    for (const plugin of config.plugins) {
        const keys = secretKeys.get(plugin.instanceId);
        if (!keys || keys.size === 0) continue;
        for (const name of keys) {
            const value = plugin.parameterValues[name];
            // secret 参数值应为字符串；数字等非字符串值不转存（schema 放行 string|number，
            // 明文 secret 语义下字符串才是凭据）。
            if (typeof value === "string" && value !== "") {
                const vault_key = keyFor(plugin.instanceId, name);
                const previous = await deps.secretsStore.get(vault_key);
                await deps.secretsStore.set(vault_key, value);
                if (previous === null) {
                    rollback_entries.push({ key: vault_key, action: "delete" });
                } else {
                    rollback_entries.push({ key: vault_key, action: "restore", value: previous });
                }
                log.debug(`imported secret ${vault_key}`);
            }
        }
    }

    const stripped: AppConfiguration = {
        ...config,
        plugins: config.plugins.map((plugin) => {
            const keys = secretKeys.get(plugin.instanceId);
            if (!keys || keys.size === 0) return plugin;
            const parameterValues = Object.fromEntries(
                Object.entries(plugin.parameterValues).filter(([name]) => !keys.has(name)),
            );
            return { ...plugin, parameterValues };
        }),
    };

    // 覆盖前备份现有 config.json → `.bak`，导入错误时手工可恢复。
    try {
        const currentRaw = await readFile(deps.configPath, "utf8");
        await writeFileAtomic(`${deps.configPath}.bak`, currentRaw);
        log.info(`Backed up previous config to ${deps.configPath}.bak`);
    } catch {
        // 无现有 config.json（首次导入）或不可读——跳过备份。
        log.info(`No existing config to back up at ${deps.configPath}`);
    }

    try {
        await deps.configStore.save(stripped);
    } catch (err: unknown) {
        // config 写失败：回滚本次变更——新建的 key 删除、覆盖的 key 恢复旧值，
        // 保持 vault 与磁盘配置一致（AC8），且不误删导入前已存在的凭据（p094）。
        log.warn("Config save failed after secret import — rolling back secrets", err);
        for (const entry of rollback_entries) {
            if (entry.action === "delete") {
                await deps.secretsStore.delete(entry.key).catch(() => undefined);
            } else {
                await deps.secretsStore.set(entry.key, entry.value).catch(() => undefined);
            }
        }
        throw err;
    }
    log.info(`Imported config from ${file} (${String(stripped.plugins.length)} plugins)`);
    return stripped;
}
