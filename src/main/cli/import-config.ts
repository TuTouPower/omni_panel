/**
 * `--config <path>` 启动导入（t275）。所有入口都使用 config-transfer 的 canonical v2
 * 文件和同一套 config↔vault 一致性语义；本模块只负责 CLI 文件读取与错误包装。
 */
import { readFile } from "node:fs/promises";
import { createLogger } from "../../shared/lib/logger";
import type { AppConfiguration } from "../../shared/types/config";
import { type SecretsStore } from "../core/config/secrets-store";
import type { AppConfigStore } from "../core/config/config-store";
import type { ConnectorDefinition } from "../core/connector/manifest-loader";
import { default_vault_snapshot_path, import_config } from "../core/config/config-transfer";

const log = createLogger("cli:import");

export interface ImportConfigDeps {
    /** 规范 config.json 绝对路径（userData 下），用于导入前备份 .bak。 */
    configPath: string;
    configStore: AppConfigStore;
    secretsStore: SecretsStore;
    definitions: readonly ConnectorDefinition[];
    vaultSnapshotPath?: string;
}

/**
 * 导入 canonical v2 文件，返回剥离 secret 后的配置。未知 manifest 会被跳过并记入日志。
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
    const result = await import_config(
        {
            configPath: deps.configPath,
            vaultSnapshotPath:
                deps.vaultSnapshotPath ?? default_vault_snapshot_path(deps.configPath),
            configStore: deps.configStore,
            secretsStore: deps.secretsStore,
            definitions: deps.definitions,
        },
        parsed,
    );
    for (const skipped of result.skipped) {
        log.warn("Skipped connector during config import", skipped);
    }
    log.info(`Imported config from ${file} (${String(result.config.plugins.length)} plugins)`);
    return result.config;
}
