import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { readFile, writeFile, stat } from "node:fs/promises";
import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { ConfigExportData } from "../../shared/types/ipc";
import type { IpcResult } from "./helpers";
import { ok, fail, assert_valid_sender } from "./helpers";
import { run_config_transaction, type AppConfigStore } from "../core/config/config-store";
import { keyFor, type SecretsStore } from "../core/config/secrets-store";
import type { AppConfiguration, ConnectorConfiguration } from "../../shared/types/config";
import { appConfigurationSchema } from "../core/config/types";
import { FOLLOW_GLOBAL_REFRESH_SENTINEL } from "../core/config/auto-seed";
import type { ConnectorDefinition } from "../core/connector/manifest-loader";
import { createLogger } from "../../shared/lib/logger";
import { get_local_date_string } from "../../shared/lib/local-time";
import { redact_config_raw } from "../../shared/lib/config_redaction";
import { createLoggedIpcHandler } from "./logged";
import {
    default_vault_snapshot_path,
    export_config,
    import_config,
    type ConfigTransferDeps,
} from "../core/config/config-transfer";

const MASK = "***";
const MAX_IMPORT_BYTES = 1_000_000;
const log = createLogger("ipc:config");

const saveSecretsSchema = z.object({
    instanceId: z.string(),
    secrets: z.record(z.string()),
});

const getSecretsSchema = z.object({
    instanceId: z.string().min(1),
});

export interface ConfigIpcDeps {
    configStore: AppConfigStore;
    secretsStore: SecretsStore;
    secretParamKeys: ReadonlyMap<string, ReadonlySet<string>>;
    onConfigSaved?: (config: AppConfiguration) => void;
    onConfigImported?: (config: AppConfiguration) => void;
    /** t121: discovered connector definitions, for createInstance from manifest id. */
    definitions?: readonly ConnectorDefinition[];
    /** Existing config path for the pre-import backup. */
    configPath?: string;
    /** Encrypted vault snapshot path; defaults next to configPath. */
    vaultSnapshotPath?: string;
    /** Version of the running app, included in canonical exports. */
    appVersion?: string;
}

function maskSecrets(
    config: AppConfiguration,
    secretKeys: ReadonlyMap<string, ReadonlySet<string>>,
): AppConfiguration {
    return {
        ...config,
        plugins: config.plugins.map((plugin) => {
            const keys = secretKeys.get(plugin.instanceId);
            if (!keys) return plugin;
            const masked = { ...plugin.parameterValues };
            for (const key of keys) {
                if (key in masked) masked[key] = MASK;
            }
            return { ...plugin, parameterValues: masked };
        }),
    };
}

function stripSecrets(
    config: AppConfiguration,
    secretKeys: ReadonlyMap<string, ReadonlySet<string>>,
): AppConfiguration {
    return {
        ...config,
        plugins: config.plugins.map((plugin) => {
            const keys = secretKeys.get(plugin.instanceId);
            if (!keys) return plugin;
            const entries = Object.entries(plugin.parameterValues).filter(
                ([key]) => !keys.has(key),
            );
            return { ...plugin, parameterValues: Object.fromEntries(entries) };
        }),
    };
}

export async function handleConfigGet(
    deps: ConfigIpcDeps,
): Promise<
    IpcResult<{ config: AppConfiguration; hasSecrets: Record<string, Record<string, boolean>> }>
> {
    try {
        const config = await deps.configStore.load();
        const masked = maskSecrets(config, deps.secretParamKeys);
        const hasSecrets: Record<string, Record<string, boolean>> = {};
        for (const plugin of config.plugins) {
            const secretKeys = deps.secretParamKeys.get(plugin.instanceId);
            if (!secretKeys || secretKeys.size === 0) continue;
            const pluginSecrets: Record<string, boolean> = {};
            for (const key of secretKeys) {
                const value = await deps.secretsStore.get(keyFor(plugin.instanceId, key));
                pluginSecrets[key] = value !== null;
            }
            hasSecrets[plugin.instanceId] = pluginSecrets;
        }
        return ok({ config: masked, hasSecrets });
    } catch (error: unknown) {
        log.error("handleConfigGet failed", error);
        const msg = error instanceof Error ? error.message : String(error);
        return fail("INTERNAL_ERROR", `获取配置失败: ${msg}`);
    }
}

export async function handleConfigSave(
    deps: ConfigIpcDeps,
    config: unknown,
): Promise<IpcResult<void>> {
    try {
        const parsed = appConfigurationSchema.safeParse(config);
        if (!parsed.success) return fail("VALIDATION_ERROR", "配置格式无效");

        const incoming = parsed.data as AppConfiguration;
        // Capture the renderer's base before entering the queue. The transaction
        // then rejects if another writer committed while this request waited.
        const base = await deps.configStore.load();
        const result = await run_config_transaction(deps.configStore, async (current, commit) => {
            if (JSON.stringify(current) !== JSON.stringify(base)) {
                return { outcome: "conflict" as const };
            }

            // Validate: every incoming plugin instanceId must already exist.
            const currentByInstanceId = new Map(current.plugins.map((p) => [p.instanceId, p]));
            for (const plugin of incoming.plugins) {
                const existing = currentByInstanceId.get(plugin.instanceId);
                if (!existing) {
                    return {
                        outcome: "validation" as const,
                        message: `未知的连接器实例: ${plugin.instanceId}`,
                    };
                }
                if (existing.manifestId !== plugin.manifestId) {
                    return {
                        outcome: "validation" as const,
                        message: `不允许修改连接器身份: ${plugin.name}`,
                    };
                }
                if (existing.executablePath !== plugin.executablePath) {
                    return {
                        outcome: "validation" as const,
                        message: `不允许修改连接器路径: ${plugin.name}`,
                    };
                }
            }

            // Merge: incoming fields override current; fields absent from incoming
            // are preserved from the latest committed config.
            const incomingKeys = new Set(Object.keys(incoming));
            const merged = { ...current } as unknown as Record<string, unknown>;
            for (const key of incomingKeys) {
                merged[key] = (incoming as unknown as Record<string, unknown>)[key];
            }

            // Protect against stale renderer windows dropping newer instances.
            const incomingPluginIds = new Set(incoming.plugins.map((p) => p.instanceId));
            const removedManifestIds = new Set(incoming.removedConnectorIds ?? []);
            const protectedPlugins: ConnectorConfiguration[] = [];
            for (const plugin of current.plugins) {
                if (incomingPluginIds.has(plugin.instanceId)) continue;
                const definition = deps.definitions?.find(
                    (d) => d.manifest.id === plugin.manifestId,
                );
                const manifestId = definition?.manifest.id;
                if (manifestId && removedManifestIds.has(manifestId)) continue;
                protectedPlugins.push(plugin);
                log.warn(
                    `Protected plugin ${plugin.instanceId} (${plugin.name}) from stale save; ` +
                        (manifestId
                            ? `manifest id ${manifestId} not in removedConnectorIds`
                            : "no manifest definition found"),
                );
            }
            if (protectedPlugins.length > 0) {
                merged["plugins"] = [...incoming.plugins, ...protectedPlugins];
                log.warn(
                    `Config save would have dropped ${String(protectedPlugins.length)} plugin(s); ` +
                        `restored them to the merged config`,
                );
            }

            const mergedValidated = appConfigurationSchema.safeParse(merged);
            if (!mergedValidated.success) {
                return { outcome: "validation" as const, message: "合并后配置格式无效" };
            }
            const stripped = stripSecrets(
                mergedValidated.data as AppConfiguration,
                deps.secretParamKeys,
            );
            await commit(stripped);
            return { outcome: "saved" as const, config: stripped };
        });
        if (result.outcome === "validation") {
            return fail("VALIDATION_ERROR", result.message);
        }
        if (result.outcome === "conflict") {
            log.warn("Config changed by a concurrent save — aborting to avoid lost update");
            return fail("CONFLICT", "配置已被其他窗口修改，请重试");
        }
        deps.onConfigSaved?.(result.config);
        return ok(undefined);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return fail("INTERNAL_ERROR", `保存配置失败: ${msg}`);
    }
}

export async function handleConfigSaveSecrets(
    deps: ConfigIpcDeps,
    payload: unknown,
): Promise<IpcResult<void>> {
    try {
        const parsed = saveSecretsSchema.safeParse(payload);
        if (!parsed.success) {
            return fail("VALIDATION_ERROR", "无效的请求数据");
        }
        const { instanceId, secrets } = parsed.data;
        log.info(
            `Saving secrets for instanceId=${instanceId}, keys=[${Object.keys(secrets).join(", ")}]`,
        );

        const config = await deps.configStore.load();
        const plugin = config.plugins.find(
            (p: ConnectorConfiguration) => p.instanceId === instanceId,
        );
        if (!plugin) return fail("VALIDATION_ERROR", "连接器不存在");

        const allowedKeys = deps.secretParamKeys.get(instanceId);
        if (!allowedKeys) {
            return fail(
                "INTERNAL_ERROR",
                `secret param keys not registered for instance: ${instanceId}`,
            );
        }

        for (const [paramName, value] of Object.entries(secrets)) {
            if (allowedKeys.has(paramName)) {
                await deps.secretsStore.set(keyFor(instanceId, paramName), value);
            }
        }
        return ok(undefined);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return fail("INTERNAL_ERROR", `保存密钥失败: ${msg}`);
    }
}

export async function handleConfigGetSecrets(
    deps: ConfigIpcDeps,
    payload: unknown,
): Promise<IpcResult<Record<string, string>>> {
    try {
        const parsed = getSecretsSchema.safeParse(payload);
        if (!parsed.success) {
            return fail("VALIDATION_ERROR", "无效的请求数据");
        }
        const { instanceId } = parsed.data;

        const config = await deps.configStore.load();
        const plugin = config.plugins.find(
            (p: ConnectorConfiguration) => p.instanceId === instanceId,
        );
        if (!plugin) return fail("VALIDATION_ERROR", "连接器不存在");

        const allowedKeys = deps.secretParamKeys.get(instanceId);
        if (!allowedKeys) {
            return ok({});
        }

        const secrets: Record<string, string> = {};
        for (const paramName of allowedKeys) {
            const value = await deps.secretsStore.get(keyFor(instanceId, paramName));
            if (value !== null) {
                secrets[paramName] = value;
            }
        }
        return ok(secrets);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return fail("INTERNAL_ERROR", `读取密钥失败: ${msg}`);
    }
}

export async function handleConfigDuplicate(
    deps: ConfigIpcDeps,
    payload: unknown,
): Promise<IpcResult<{ instanceId: string }>> {
    try {
        if (typeof payload !== "string" || !payload) {
            return fail("VALIDATION_ERROR", "无效的插件 ID");
        }
        const sourceInstanceId = payload;

        const result = await run_config_transaction(deps.configStore, async (config, commit) => {
            const source = config.plugins.find(
                (p: ConnectorConfiguration) => p.instanceId === sourceInstanceId,
            );
            if (!source) return { outcome: "missing" as const };

            const newInstanceId = randomUUID();
            // 不复制 source.displayName：新账号回退连接器名，避免克隆出带别名的副本
            const newInstance: ConnectorConfiguration = {
                instanceId: newInstanceId,
                stateId: randomUUID(),
                manifestId: source.manifestId,
                name: source.name,
                enabled: true,
                executablePath: source.executablePath,
                refreshIntervalSeconds: source.refreshIntervalSeconds,
                parameterValues: {},
                endpointOverrides: {},
                ...(source.manualRefreshOnly ? { manualRefreshOnly: true } : {}),
            };
            const updated: AppConfiguration = {
                ...config,
                plugins: [...config.plugins, newInstance],
            };
            await commit(updated);
            return { outcome: "saved" as const, instanceId: newInstanceId, config: updated };
        });
        if (result.outcome === "missing") return fail("VALIDATION_ERROR", "源连接器不存在");
        deps.onConfigSaved?.(result.config);
        return ok({ instanceId: result.instanceId });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return fail("INTERNAL_ERROR", `复制连接器失败: ${msg}`);
    }
}

/**
 * t121: create a new connector instance directly from a manifest id, bypassing
 * the duplicate-from-existing path. Used by the add-account flow when no live
 * instance of the vendor exists (e.g. manifest id is in the removedConnectorIds
 * tombstone). Clears the manifest id from the tombstone so auto-seed won't
 * resurrect-or-skip it inconsistently on next launch.
 *
 * Mirrors auto_seed_connectors for instance shape (follow-global refresh
 * sentinel, manualDefault, non-secret default parameterValues).
 */
export async function handleConfigCreateInstance(
    deps: ConfigIpcDeps,
    manifestId: unknown,
): Promise<IpcResult<{ instanceId: string }>> {
    try {
        if (typeof manifestId !== "string" || !manifestId) {
            return fail("VALIDATION_ERROR", "无效的 manifest id");
        }
        const definitions = deps.definitions ?? [];
        const definition = definitions.find((d) => d.manifest.id === manifestId);
        if (!definition) {
            return fail("VALIDATION_ERROR", `未知连接器 manifest id: ${manifestId}`);
        }
        const newInstance: ConnectorConfiguration = {
            instanceId: randomUUID(),
            stateId: randomUUID(),
            manifestId: definition.manifest.id,
            name: definition.manifest.id.toUpperCase(),
            enabled: true,
            executablePath: definition.executablePath,
            refreshIntervalSeconds: FOLLOW_GLOBAL_REFRESH_SENTINEL,
            ...(definition.manifest.manualDefault === true && { manualRefreshOnly: true }),
            parameterValues: Object.fromEntries(
                definition.manifest.parameters
                    .filter((param) => param.type !== "secret" && param.default !== undefined)
                    .map((param) => [param.name, param.default ?? ""]),
            ),
            endpointOverrides: {},
        };
        const result = await run_config_transaction(deps.configStore, async (config, commit) => {
            const remaining_removed = (config.removedConnectorIds ?? []).filter(
                (id) => id !== manifestId,
            );
            const updated: AppConfiguration = {
                ...config,
                plugins: [...config.plugins, newInstance],
                removedConnectorIds: remaining_removed,
            };
            await commit(updated);
            return { instanceId: newInstance.instanceId, config: updated };
        });
        deps.onConfigSaved?.(result.config);
        log.info(`Created instance for manifest ${manifestId}: ${newInstance.instanceId}`);
        return ok({ instanceId: result.instanceId });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return fail("INTERNAL_ERROR", `创建连接器失败: ${msg}`);
    }
}

export interface ConfigExportOptions {
    readonly includeSecrets?: boolean;
}

function transfer_deps(deps: ConfigIpcDeps): ConfigTransferDeps {
    const snapshot_path =
        deps.vaultSnapshotPath ??
        (deps.configPath ? default_vault_snapshot_path(deps.configPath) : undefined);
    return {
        configStore: deps.configStore,
        secretsStore: deps.secretsStore,
        ...(deps.definitions !== undefined ? { definitions: deps.definitions } : {}),
        ...(deps.configPath !== undefined ? { configPath: deps.configPath } : {}),
        ...(snapshot_path !== undefined ? { vaultSnapshotPath: snapshot_path } : {}),
        secretParamKeys: deps.secretParamKeys,
    };
}

async function app_version_for(deps: ConfigIpcDeps): Promise<string> {
    if (deps.appVersion !== undefined) return deps.appVersion;
    const { app } = await import("electron");
    return app.getVersion();
}

/** Return the canonical v2 transfer document for LocalAPI and CLI callers. */
export async function handleConfigExportData(
    deps: ConfigIpcDeps,
    options: ConfigExportOptions = {},
): Promise<IpcResult<ConfigExportData>> {
    try {
        return ok(
            await export_config(transfer_deps(deps), {
                appVersion: await app_version_for(deps),
                ...(options.includeSecrets !== undefined
                    ? { includeSecrets: options.includeSecrets }
                    : {}),
            }),
        );
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return fail("INTERNAL_ERROR", `导出配置失败: ${msg}`);
    }
}

function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

/** Apply the canonical v2 document shared by desktop, LocalAPI and CLI. */
export async function handleConfigImportData(
    deps: ConfigIpcDeps,
    raw: unknown,
): Promise<IpcResult<{ imported: boolean; skipped: readonly unknown[] }>> {
    try {
        const result = await import_config(transfer_deps(deps), raw);
        deps.onConfigSaved?.(result.config);
        deps.onConfigImported?.(result.config);
        return ok({ imported: true, skipped: result.skipped });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const code =
            msg.startsWith("不支持的导入文件版本") || msg.startsWith("导入")
                ? "VALIDATION_ERROR"
                : "INTERNAL_ERROR";
        return fail(code, `导入设置失败: ${msg}`);
    }
}

export async function handleConfigExport(
    deps: ConfigIpcDeps,
    options: ConfigExportOptions = {},
): Promise<IpcResult<{ saved: boolean }>> {
    try {
        const { dialog, app } = await import("electron");
        // t490: 桌面导出与 LocalAPI/CLI 同规范——默认不含明文密钥，仅在显式勾选时写入 secrets。
        const data = await export_config(transfer_deps(deps), {
            appVersion: app.getVersion(),
            includeSecrets: options.includeSecrets === true,
        });

        const { filePath, canceled } = await dialog.showSaveDialog({
            title: "导出设置",
            defaultPath: `omni-panel-settings-${get_local_date_string()}.json`,
            filters: [{ name: "JSON", extensions: ["json"] }],
        });

        if (canceled || !filePath) return ok({ saved: false });

        await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
        return ok({ saved: true });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return fail("INTERNAL_ERROR", `导出设置失败: ${msg}`);
    }
}

export async function handleConfigImport(
    deps: ConfigIpcDeps,
): Promise<IpcResult<{ imported: boolean; skipped: readonly unknown[] }>> {
    try {
        const { dialog } = await import("electron");

        const { filePaths, canceled } = await dialog.showOpenDialog({
            title: "导入设置",
            filters: [{ name: "JSON", extensions: ["json"] }],
            properties: ["openFile"],
        });

        const filePath = filePaths[0];
        if (canceled || !filePath) return ok({ imported: false, skipped: [] });
        const file_info = await stat(filePath);
        if (file_info.size > MAX_IMPORT_BYTES) {
            return fail("VALIDATION_ERROR", "导入文件过大");
        }

        let raw: unknown;
        try {
            raw = JSON.parse(await readFile(filePath, "utf8"));
        } catch {
            return fail("VALIDATION_ERROR", "导入文件不是合法 JSON");
        }
        if (!raw || typeof raw !== "object") {
            return fail("VALIDATION_ERROR", "导入文件格式无效");
        }

        const obj = raw as Record<string, unknown>;
        if (obj["formatVersion"] === 2 && (!obj["config"] || typeof obj["config"] !== "object")) {
            return fail("VALIDATION_ERROR", "导入文件缺少配置数据");
        }

        const parsed = appConfigurationSchema.safeParse(obj["config"]);
        if (obj["formatVersion"] === 2 && !parsed.success) {
            return fail("VALIDATION_ERROR", "导入的配置格式无效");
        }

        // D9: endpointOverrides can redirect a connector's authenticated requests
        // (API key, session cookie) to an attacker-controlled host. A malicious
        // CONFIG_IMPORT points the override at the attacker, then the next refresh
        // leaks the secret. Warn on any non-empty override before importing.
        const has_overrides =
            obj["formatVersion"] === 2 &&
            parsed.success &&
            parsed.data.plugins.some((p) => Object.keys(p.endpointOverrides).length > 0);
        if (has_overrides) {
            const confirm = await dialog.showMessageBox({
                type: "warning",
                buttons: ["取消导入", "继续导入"],
                defaultId: 0,
                cancelId: 0,
                title: "导入设置 · 自定义端点",
                message: "导入的配置包含自定义端点覆盖 (endpointOverrides)",
                detail: "自定义端点可能将连接器的请求（含 API key / Cookie）发送到第三方主机。\n仅当信任此配置来源时才继续。\n继续后请重新核对各连接器的 secret。",
            });
            if (confirm.response !== 1) {
                return ok({ imported: false, skipped: [] });
            }
        }

        return await handleConfigImportData(deps, raw);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return fail("INTERNAL_ERROR", `导入设置失败: ${msg}`);
    }
}

export async function registerConfigIpc(deps: ConfigIpcDeps): Promise<void> {
    const { ipcMain } = await import("electron");
    const log = createLogger("ipc:config");

    const logged = createLoggedIpcHandler(log, {
        redactArgs: redact_config_raw as (args: unknown[]) => unknown[],
        redactResult: redact_config_raw,
    });

    ipcMain.handle(IPC_CHANNELS.CONFIG_GET, (e) => {
        assert_valid_sender(e);
        return logged(IPC_CHANNELS.CONFIG_GET, [], () => handleConfigGet(deps));
    });
    ipcMain.handle(IPC_CHANNELS.CONFIG_SAVE, (e, config: unknown) => {
        assert_valid_sender(e);
        return logged(IPC_CHANNELS.CONFIG_SAVE, [config], async () => {
            const result = await handleConfigSave(deps, config);
            if (result.ok) {
                const cfg = config as { plugins?: unknown[] };
                log.info(`Config saved: ${String(cfg.plugins?.length ?? "?")} plugins`);
            }
            return result;
        });
    });
    ipcMain.handle(IPC_CHANNELS.CONFIG_SAVE_SECRETS, (e, payload: unknown) => {
        assert_valid_sender(e);
        return logged(IPC_CHANNELS.CONFIG_SAVE_SECRETS, [payload], () =>
            handleConfigSaveSecrets(deps, payload),
        );
    });
    ipcMain.handle(IPC_CHANNELS.CONFIG_GET_SECRETS, (e, payload: unknown) => {
        assert_valid_sender(e);
        return logged(IPC_CHANNELS.CONFIG_GET_SECRETS, [payload], () => {
            const p = payload as { instanceId?: string } | string;
            const instance_id = typeof p === "string" ? p : (p.instanceId ?? "?");
            log.info(`Loading secrets for instanceId=${instance_id}`);
            return handleConfigGetSecrets(
                deps,
                typeof payload === "string" ? { instanceId: payload } : payload,
            );
        });
    });
    ipcMain.handle(IPC_CHANNELS.CONFIG_DUPLICATE, (e, instanceId: string) => {
        assert_valid_sender(e);
        return logged(IPC_CHANNELS.CONFIG_DUPLICATE, [instanceId], () => {
            log.info(`Duplicating plugin ${instanceId}`);
            return handleConfigDuplicate(deps, instanceId);
        });
    });
    ipcMain.handle(IPC_CHANNELS.CONFIG_CREATE_INSTANCE, (e, manifestId: unknown) => {
        assert_valid_sender(e);
        return logged(IPC_CHANNELS.CONFIG_CREATE_INSTANCE, [manifestId], () => {
            log.info(`Creating instance for manifest ${String(manifestId)}`);
            return handleConfigCreateInstance(deps, manifestId);
        });
    });
    ipcMain.handle(IPC_CHANNELS.CONFIG_EXPORT, (e, rawOptions: unknown) => {
        assert_valid_sender(e);
        // t490: 渲染层传 { includeSecrets }；非对象入参一律按默认（不含密钥）处理。
        const options: ConfigExportOptions = is_record(rawOptions)
            ? { includeSecrets: rawOptions["includeSecrets"] === true }
            : {};
        return logged(IPC_CHANNELS.CONFIG_EXPORT, [], () => handleConfigExport(deps, options));
    });
    ipcMain.handle(IPC_CHANNELS.CONFIG_IMPORT, (e) => {
        assert_valid_sender(e);
        return logged(IPC_CHANNELS.CONFIG_IMPORT, [], () => handleConfigImport(deps));
    });
}
