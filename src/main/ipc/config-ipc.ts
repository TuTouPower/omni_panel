import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { readFile, writeFile, stat } from "node:fs/promises";
import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { ConfigExportData } from "../../shared/types/ipc";
import type { IpcResult } from "./helpers";
import { ok, fail, assert_valid_sender, assert_setting_route } from "./helpers";
import type { AppConfigStore } from "../core/config/config-store";
import { keyFor, type SecretsStore } from "../core/config/secrets-store";
import type { AppConfiguration, ConnectorConfiguration } from "../../shared/types/config";
import { appConfigurationSchema } from "../core/config/types";
import { FOLLOW_GLOBAL_REFRESH_SENTINEL } from "../core/config/auto-seed";
import {
    build_secret_param_keys,
    find_unknown_executable_paths,
} from "../core/config/secret_param_keys";
import type { ConnectorDefinition } from "../core/connector/manifest-loader";
import { createLogger } from "../../shared/lib/logger";
import { redact_config_raw } from "../../shared/lib/config_redaction";
import { createLoggedIpcHandler } from "./logged";

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

        const current = await deps.configStore.load();
        const incoming = parsed.data as AppConfiguration;
        // Validate: every incoming plugin instanceId must already exist
        const currentByInstanceId = new Map(current.plugins.map((p) => [p.instanceId, p]));
        for (const plugin of incoming.plugins) {
            const existing = currentByInstanceId.get(plugin.instanceId);
            if (!existing) {
                return fail("VALIDATION_ERROR", `未知的连接器实例: ${plugin.instanceId}`);
            }
            if (existing.executablePath !== plugin.executablePath) {
                return fail("VALIDATION_ERROR", `不允许修改插件的可执行路径: ${plugin.name}`);
            }
        }

        // Merge: incoming fields override current; fields absent from incoming
        // are preserved from disk. This prevents one renderer window from
        // accidentally overwriting another window's fields (e.g. popup's
        // collapsedAccounts wiped by settings save).
        const incomingKeys = new Set(Object.keys(incoming));
        const merged = { ...current } as unknown as Record<string, unknown>;
        for (const key of incomingKeys) {
            merged[key] = (incoming as unknown as Record<string, unknown>)[key];
        }

        // Protect against stale renderer windows overwriting the entire plugins
        // array. A settings window preloaded before the latest config change may
        // save an outdated plugin list; without this guard, the merge above would
        // drop every plugin added after the window loaded. Deletions are still
        // honoured when the removed manifest id is recorded in removedConnectorIds
        // (the path used by SettingsView's delete/confirm handlers).
        const incomingPluginIds = new Set(incoming.plugins.map((p) => p.instanceId));
        const removedManifestIds = new Set(incoming.removedConnectorIds ?? []);
        const protectedPlugins: ConnectorConfiguration[] = [];
        for (const plugin of current.plugins) {
            if (incomingPluginIds.has(plugin.instanceId)) continue;
            const definition = deps.definitions?.find(
                (d) => d.executablePath === plugin.executablePath,
            );
            const manifestId = definition?.manifest.id;
            if (manifestId && removedManifestIds.has(manifestId)) {
                // Legitimate deletion via settings UI.
                continue;
            }
            protectedPlugins.push(plugin);
            if (manifestId) {
                log.warn(
                    `Protected plugin ${plugin.instanceId} (${plugin.name}) from stale save; ` +
                        `manifest id ${manifestId} not in removedConnectorIds`,
                );
            } else {
                log.warn(
                    `Protected plugin ${plugin.instanceId} (${plugin.name}) from stale save; ` +
                        `no manifest definition found`,
                );
            }
        }
        if (protectedPlugins.length > 0) {
            merged["plugins"] = [...incoming.plugins, ...protectedPlugins];
            log.warn(
                `Config save would have dropped ${String(protectedPlugins.length)} plugin(s); ` +
                    `restored them to the merged config`,
            );
        }

        // Post-merge validation: the merged result may carry extra fields from
        // current that aren't in the schema (e.g. leftover from a bug or manual
        // edit). Validate against schema to strip unknown keys and ensure the
        // merged result is safe to persist.
        const mergedValidated = appConfigurationSchema.safeParse(merged);
        if (!mergedValidated.success) {
            return fail("VALIDATION_ERROR", "合并后配置格式无效");
        }
        const validated = mergedValidated.data as AppConfiguration;

        // Conflict check runs inside the store's save serialization, so an
        // overlapping CONFIG_SAVE / POST /v1/config that committed between our
        // load and here is observed via the committed state — the memory cache
        // can no longer hide it. A stale writer is rejected instead of silently
        // overwriting the earlier writer's changes.
        const stripped = stripSecrets(validated, deps.secretParamKeys);
        const outcome = await deps.configStore.saveIfBaseMatches(current, stripped);
        if (outcome === "conflict") {
            log.warn("Config changed by a concurrent save — aborting to avoid lost update");
            return fail("CONFLICT", "配置已被其他窗口修改，请重试");
        }
        deps.onConfigSaved?.(stripped);
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

        const config = await deps.configStore.load();
        const source = config.plugins.find(
            (p: ConnectorConfiguration) => p.instanceId === sourceInstanceId,
        );
        if (!source) return fail("VALIDATION_ERROR", "源连接器不存在");

        const newInstanceId = randomUUID();
        // 不复制 source.displayName：新账号回退连接器名，避免克隆出带别名的副本
        const newInstance: ConnectorConfiguration = {
            instanceId: newInstanceId,
            stateId: randomUUID(),
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
        await deps.configStore.save(updated);
        deps.onConfigSaved?.(updated);
        return ok({ instanceId: newInstanceId });
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
        const config = await deps.configStore.load();
        const remaining_removed = (config.removedConnectorIds ?? []).filter(
            (id) => id !== manifestId,
        );
        const updated: AppConfiguration = {
            ...config,
            plugins: [...config.plugins, newInstance],
            removedConnectorIds: remaining_removed,
        };
        await deps.configStore.save(updated);
        deps.onConfigSaved?.(updated);
        log.info(`Created instance for manifest ${manifestId}: ${newInstance.instanceId}`);
        return ok({ instanceId: newInstance.instanceId });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return fail("INTERNAL_ERROR", `创建连接器失败: ${msg}`);
    }
}

function secret_keys_for(
    deps: ConfigIpcDeps,
    config: AppConfiguration,
): ReadonlyMap<string, ReadonlySet<string>> {
    return deps.definitions !== undefined
        ? build_secret_param_keys(config, deps.definitions)
        : deps.secretParamKeys;
}

function allowed_executable_paths_for(deps: ConfigIpcDeps): ReadonlySet<string> | undefined {
    return deps.definitions === undefined
        ? undefined
        : new Set(deps.definitions.map((definition) => definition.executablePath));
}

function unknown_paths_for(deps: ConfigIpcDeps, config: AppConfiguration): string[] {
    return deps.definitions === undefined
        ? []
        : find_unknown_executable_paths(config, deps.definitions);
}

function inject_secrets(
    config: AppConfiguration,
    secret_keys: ReadonlyMap<string, ReadonlySet<string>>,
    exported: Readonly<Record<string, string>>,
): AppConfiguration {
    return {
        ...config,
        plugins: config.plugins.map((plugin) => {
            const keys = secret_keys.get(plugin.instanceId);
            if (!keys || keys.size === 0) return plugin;
            const parameterValues = { ...plugin.parameterValues };
            for (const key of keys) {
                const value = exported[keyFor(plugin.instanceId, key)];
                if (value !== undefined) parameterValues[key] = value;
            }
            return { ...plugin, parameterValues };
        }),
    };
}

export interface ConfigExportOptions {
    readonly includeSecrets?: boolean;
}

export interface ConfigImportOptions {
    /** Web callers cannot show the desktop endpoint-overrides confirmation dialog. */
    readonly allowEndpointOverrides?: boolean;
}

/** Return native config.json-shaped data for LocalAPI and CLI callers. */
export async function handleConfigExportData(
    deps: ConfigIpcDeps,
    options: ConfigExportOptions = {},
): Promise<IpcResult<AppConfiguration>> {
    try {
        const config = await deps.configStore.load();
        const secret_keys = secret_keys_for(deps, config);
        const stripped = stripSecrets(config, secret_keys);
        if (!options.includeSecrets) return ok(stripped);
        const exported = await deps.secretsStore.exportAll();
        return ok(inject_secrets(stripped, secret_keys, exported));
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return fail("INTERNAL_ERROR", `导出配置失败: ${msg}`);
    }
}

function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

/** Apply a native config or the legacy desktop export wrapper. */
export async function handleConfigImportData(
    deps: ConfigIpcDeps,
    raw: unknown,
    options: ConfigImportOptions = {},
): Promise<IpcResult<{ imported: boolean }>> {
    try {
        let config_input: unknown = raw;
        let wrapper_secrets: Record<string, string> = {};
        if (is_record(raw) && "formatVersion" in raw) {
            if (raw["formatVersion"] !== 1) {
                return fail("VALIDATION_ERROR", "不支持的导入文件版本");
            }
            config_input = raw["config"];
            if (!is_record(config_input)) {
                return fail("VALIDATION_ERROR", "导入文件缺少配置数据");
            }
            if (raw["secrets"] !== undefined) {
                if (!is_record(raw["secrets"])) {
                    return fail("VALIDATION_ERROR", "导入文件密钥格式无效");
                }
                const entries = Object.entries(raw["secrets"]);
                if (entries.some(([, value]) => typeof value !== "string")) {
                    return fail("VALIDATION_ERROR", "导入文件密钥格式无效");
                }
                wrapper_secrets = Object.fromEntries(entries) as Record<string, string>;
            }
        }

        const parsed = appConfigurationSchema.safeParse(config_input);
        if (!parsed.success) return fail("VALIDATION_ERROR", "导入的配置格式无效");
        const incoming = parsed.data as AppConfiguration;
        const unknown_paths = unknown_paths_for(deps, incoming);
        if (unknown_paths.length > 0) {
            return fail(
                "VALIDATION_ERROR",
                `导入配置包含未知连接器路径: ${unknown_paths.join(", ")}`,
            );
        }
        if (
            options.allowEndpointOverrides === false &&
            incoming.plugins.some((plugin) => Object.keys(plugin.endpointOverrides).length > 0)
        ) {
            return fail("VALIDATION_ERROR", "Web 导入不接受自定义端点覆盖，请在桌面版确认后导入");
        }
        const secret_keys = secret_keys_for(deps, incoming);
        const imported_secrets: Record<string, string> = { ...wrapper_secrets };
        for (const plugin of incoming.plugins) {
            const keys = secret_keys.get(plugin.instanceId);
            if (!keys) continue;
            for (const key of keys) {
                const value = plugin.parameterValues[key];
                if (typeof value === "string" && value !== "") {
                    imported_secrets[keyFor(plugin.instanceId, key)] = value;
                }
            }
        }

        const stripped = stripSecrets(incoming, secret_keys);
        const previous_config = await deps.configStore.load();
        await deps.configStore.save(stripped);
        if (Object.keys(imported_secrets).length > 0) {
            try {
                await deps.secretsStore.importAll(imported_secrets);
            } catch (import_err: unknown) {
                try {
                    await deps.configStore.save(previous_config);
                } catch (rollback_err: unknown) {
                    log.error("Config rollback after failed secrets import failed", rollback_err);
                }
                throw import_err;
            }
        }

        let saved_config = stripped;
        try {
            saved_config = await deps.configStore.prune_unhealthy_plugins(
                allowed_executable_paths_for(deps),
            );
        } catch (err) {
            log.warn("Post-import health prune failed", err);
        }
        deps.onConfigSaved?.(saved_config);
        deps.onConfigImported?.(saved_config);
        return ok({ imported: true });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return fail("INTERNAL_ERROR", `导入设置失败: ${msg}`);
    }
}

export async function handleConfigExport(
    deps: ConfigIpcDeps,
): Promise<IpcResult<{ saved: boolean }>> {
    try {
        const { dialog, app } = await import("electron");
        const config = await deps.configStore.load();
        // 待澄清-1：明文导出密钥，权限完全开放给用户，不脱敏、不加密。
        // 用户自己负责导出文件的安全（spec: secret-vault.md）。
        const rawSecrets = await deps.secretsStore.exportAll();

        const data: ConfigExportData = {
            formatVersion: 1,
            exportedAt: new Date().toISOString(),
            appVersion: app.getVersion(),
            config,
            secrets: rawSecrets,
        };

        const { filePath, canceled } = await dialog.showSaveDialog({
            title: "导出设置",
            defaultPath: `omni-panel-settings-${new Date().toISOString().slice(0, 10)}.json`,
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
): Promise<IpcResult<{ imported: boolean }>> {
    try {
        const { dialog } = await import("electron");

        const { filePaths, canceled } = await dialog.showOpenDialog({
            title: "导入设置",
            filters: [{ name: "JSON", extensions: ["json"] }],
            properties: ["openFile"],
        });

        const filePath = filePaths[0];
        if (canceled || !filePath) return ok({ imported: false });
        const file_info = await stat(filePath);
        if (file_info.size > MAX_IMPORT_BYTES) {
            return fail("VALIDATION_ERROR", "导入文件过大");
        }

        const raw: unknown = JSON.parse(await readFile(filePath, "utf8"));
        if (!raw || typeof raw !== "object") {
            return fail("VALIDATION_ERROR", "导入文件格式无效");
        }

        const obj = raw as Record<string, unknown>;
        if (obj["formatVersion"] !== 1) {
            return fail("VALIDATION_ERROR", "不支持的导入文件版本");
        }
        if (!obj["config"] || typeof obj["config"] !== "object") {
            return fail("VALIDATION_ERROR", "导入文件缺少配置数据");
        }

        const parsed = appConfigurationSchema.safeParse(obj["config"]);
        if (!parsed.success) return fail("VALIDATION_ERROR", "导入的配置格式无效");

        // D9: endpointOverrides can redirect a connector's authenticated requests
        // (API key, session cookie) to an attacker-controlled host. A malicious
        // CONFIG_IMPORT points the override at the attacker, then the next refresh
        // leaks the secret. Warn on any non-empty override before importing.
        const has_overrides = parsed.data.plugins.some(
            (p) => Object.keys(p.endpointOverrides).length > 0,
        );
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
                return ok({ imported: false });
            }
        }

        const secrets =
            obj["secrets"] && typeof obj["secrets"] === "object"
                ? (obj["secrets"] as Record<string, string>)
                : {};

        return await handleConfigImportData(deps, {
            formatVersion: 1,
            config: parsed.data,
            secrets,
        });
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
        assert_setting_route(e);
        return logged(IPC_CHANNELS.CONFIG_SAVE_SECRETS, [payload], () =>
            handleConfigSaveSecrets(deps, payload),
        );
    });
    ipcMain.handle(IPC_CHANNELS.CONFIG_GET_SECRETS, (e, payload: unknown) => {
        assert_valid_sender(e);
        assert_setting_route(e);
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
    ipcMain.handle(IPC_CHANNELS.CONFIG_EXPORT, (e) => {
        assert_valid_sender(e);
        return logged(IPC_CHANNELS.CONFIG_EXPORT, [], () => handleConfigExport(deps));
    });
    ipcMain.handle(IPC_CHANNELS.CONFIG_IMPORT, (e) => {
        assert_valid_sender(e);
        return logged(IPC_CHANNELS.CONFIG_IMPORT, [], () => handleConfigImport(deps));
    });
}
