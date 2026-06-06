import { z } from "zod/v3";
import { readFile, writeFile } from "node:fs/promises";
import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { ConfigExportData } from "../../shared/types/ipc";
import type { IpcResult } from "./helpers";
import { ok, fail, assert_valid_sender } from "./helpers";
import type { AppConfigStore } from "../core/config/config-store";
import type { SecretsStore } from "../core/config/secrets-store";
import type { AppConfiguration, PluginConfiguration } from "../../shared/types/config";
import { appConfigurationSchema } from "../core/config/types";
import { createLogger } from "../../shared/lib/logger";

const MASK = "***";
const log = createLogger("ipc:config");

const saveSecretsSchema = z.object({
    instanceId: z.string(),
    secrets: z.record(z.string()),
});

export interface ConfigIpcDeps {
    configStore: AppConfigStore;
    secretsStore: SecretsStore;
    secretParamKeys: ReadonlyMap<string, ReadonlySet<string>>;
    onConfigSaved?: (config: AppConfiguration) => void;
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
                const value = await deps.secretsStore.get(`${plugin.instanceId}:${key}`);
                pluginSecrets[key] = value !== null;
            }
            hasSecrets[plugin.instanceId] = pluginSecrets;
        }
        return ok({ config: masked, hasSecrets });
    } catch (error: unknown) {
        log.error("handleConfigGet failed", error);
        return fail("INTERNAL_ERROR", "获取配置失败");
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
                return fail("VALIDATION_ERROR", `未知的插件实例: ${plugin.instanceId}`);
            }
            if (existing.executablePath !== plugin.executablePath) {
                return fail("VALIDATION_ERROR", `不允许修改插件的可执行路径: ${plugin.name}`);
            }
        }

        const stripped = stripSecrets(incoming, deps.secretParamKeys);
        await deps.configStore.save(stripped);
        deps.onConfigSaved?.(stripped);
        return ok(undefined);
    } catch {
        return fail("INTERNAL_ERROR", "保存配置失败");
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

        const config = await deps.configStore.load();
        const plugin = config.plugins.find((p: PluginConfiguration) => p.instanceId === instanceId);
        if (!plugin) return fail("VALIDATION_ERROR", "插件不存在");
        if (!plugin.enabled) return fail("VALIDATION_ERROR", "插件未启用");

        const allowedKeys = deps.secretParamKeys.get(instanceId);
        if (!allowedKeys) return ok(undefined);

        for (const [paramName, value] of Object.entries(secrets)) {
            if (allowedKeys.has(paramName)) {
                await deps.secretsStore.set(`${instanceId}:${paramName}`, value);
            }
        }
        return ok(undefined);
    } catch {
        return fail("INTERNAL_ERROR", "保存密钥失败");
    }
}

export async function handleConfigDuplicate(
    deps: ConfigIpcDeps,
    payload: unknown,
): Promise<IpcResult<void>> {
    try {
        if (typeof payload !== "string" || !payload) {
            return fail("VALIDATION_ERROR", "无效的插件 ID");
        }
        const sourceInstanceId = payload;

        const config = await deps.configStore.load();
        const source = config.plugins.find(
            (p: PluginConfiguration) => p.instanceId === sourceInstanceId,
        );
        if (!source) return fail("VALIDATION_ERROR", "源插件不存在");

        const suffix = String(Date.now());
        const newInstance: PluginConfiguration = {
            instanceId: `${source.instanceId}-${suffix}`,
            stateId: `${source.stateId}-${suffix}`,
            name: `${source.name} (副本)`,
            enabled: false,
            executablePath: source.executablePath,
            refreshIntervalSeconds: source.refreshIntervalSeconds,
            parameterValues: {},
            endpointOverrides: {},
        };

        const updated: AppConfiguration = {
            ...config,
            plugins: [...config.plugins, newInstance],
        };
        await deps.configStore.save(updated);
        deps.onConfigSaved?.(updated);
        return ok(undefined);
    } catch {
        return fail("INTERNAL_ERROR", "复制插件失败");
    }
}

export async function handleConfigExport(
    deps: ConfigIpcDeps,
): Promise<IpcResult<{ saved: boolean }>> {
    try {
        const { dialog, app } = await import("electron");
        const config = await deps.configStore.load();
        const rawSecrets = await deps.secretsStore.exportAll();
        const redactedSecrets: Record<string, string> = {};
        for (const key of Object.keys(rawSecrets)) {
            redactedSecrets[key] = "***REDACTED***";
        }

        const data: ConfigExportData = {
            formatVersion: 1,
            exportedAt: new Date().toISOString(),
            appVersion: app.getVersion(),
            config,
            secrets: redactedSecrets,
        };

        const { filePath, canceled } = await dialog.showSaveDialog({
            title: "导出设置",
            defaultPath: `omni-usage-settings-${new Date().toISOString().slice(0, 10)}.json`,
            filters: [{ name: "JSON", extensions: ["json"] }],
        });

        if (canceled || !filePath) return ok({ saved: false });

        await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
        return ok({ saved: true });
    } catch {
        return fail("INTERNAL_ERROR", "导出设置失败");
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

        const secrets =
            obj["secrets"] && typeof obj["secrets"] === "object"
                ? (obj["secrets"] as Record<string, string>)
                : {};

        await deps.configStore.save(parsed.data as AppConfiguration);
        await deps.secretsStore.importAll(secrets);
        deps.onConfigSaved?.(parsed.data as AppConfiguration);
        return ok({ imported: true });
    } catch {
        return fail("INTERNAL_ERROR", "导入设置失败");
    }
}

export async function registerConfigIpc(deps: ConfigIpcDeps): Promise<void> {
    const { ipcMain } = await import("electron");
    const log = createLogger("ipc:config");

    async function logged<T>(
        channel: string,
        args: unknown[],
        fn: () => Promise<IpcResult<T>>,
    ): Promise<IpcResult<T>> {
        const start = Date.now();
        const is_development = process.env["NODE_ENV"] === "development";
        if (is_development) log.debug("ipc request raw", { channel, args });
        log.debug(`${channel} called`);
        try {
            const result = await fn();
            if (is_development) log.debug("ipc response raw", { channel, result });
            const elapsed = Date.now() - start;
            if (!result.ok) {
                log.warn(`${channel} failed: ${result.error.code} (${String(elapsed)}ms)`);
            } else {
                log.debug(`${channel} ok (${String(elapsed)}ms)`);
            }
            return result;
        } catch (error: unknown) {
            if (is_development) log.debug("ipc error raw", { channel, error });
            throw error;
        }
    }

    ipcMain.handle(IPC_CHANNELS.CONFIG_GET, () =>
        logged(IPC_CHANNELS.CONFIG_GET, [], () => handleConfigGet(deps)),
    );
    ipcMain.handle(IPC_CHANNELS.CONFIG_SAVE, (e, config: unknown) =>
        logged(IPC_CHANNELS.CONFIG_SAVE, [config], async () => {
            assert_valid_sender(e);
            const result = await handleConfigSave(deps, config);
            if (result.ok) {
                const cfg = config as { plugins?: unknown[] };
                log.info(`Config saved: ${String(cfg.plugins?.length ?? "?")} plugins`);
            }
            return result;
        }),
    );
    ipcMain.handle(IPC_CHANNELS.CONFIG_SAVE_SECRETS, (e, payload: unknown) =>
        logged(IPC_CHANNELS.CONFIG_SAVE_SECRETS, [payload], () => {
            assert_valid_sender(e);
            const p = payload as { instanceId?: string; secrets?: Record<string, unknown> };
            log.info(
                `Saving secrets for instanceId=${p.instanceId ?? "?"}, keys=[${Object.keys(p.secrets ?? {}).join(", ")}]`,
            );
            return handleConfigSaveSecrets(deps, payload);
        }),
    );
    ipcMain.handle(IPC_CHANNELS.CONFIG_DUPLICATE, (e, instanceId: string) =>
        logged(IPC_CHANNELS.CONFIG_DUPLICATE, [instanceId], () => {
            assert_valid_sender(e);
            log.info(`Duplicating plugin ${instanceId}`);
            return handleConfigDuplicate(deps, instanceId);
        }),
    );
    ipcMain.handle(IPC_CHANNELS.CONFIG_EXPORT, (e) =>
        logged(IPC_CHANNELS.CONFIG_EXPORT, [], () => {
            assert_valid_sender(e);
            return handleConfigExport(deps);
        }),
    );
    ipcMain.handle(IPC_CHANNELS.CONFIG_IMPORT, (e) =>
        logged(IPC_CHANNELS.CONFIG_IMPORT, [], () => {
            assert_valid_sender(e);
            return handleConfigImport(deps);
        }),
    );
}
