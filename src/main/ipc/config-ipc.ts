import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { ConfigSaveSecretsPayload } from "../../shared/types/ipc";
import type { IpcResult } from "./helpers";
import { ok, fail } from "./helpers";
import type { AppConfigStore } from "../core/config/config-store";
import type { SecretsStore } from "../core/config/secrets-store";
import type { AppConfiguration, PluginConfiguration } from "../../shared/types/config";
import { appConfigurationSchema } from "../core/config/types";
import { createLogger } from "../../shared/lib/logger";

const MASK = "***";

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
    } catch {
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
        if (!payload || typeof payload !== "object") {
            return fail("VALIDATION_ERROR", "无效的请求数据");
        }
        const { instanceId, secrets } = payload as ConfigSaveSecretsPayload;

        if (!instanceId || typeof instanceId !== "string") {
            return fail("VALIDATION_ERROR", "无效的插件 ID");
        }

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

export async function registerConfigIpc(deps: ConfigIpcDeps): Promise<void> {
    const { ipcMain } = await import("electron");
    const log = createLogger("ipc:config");

    async function logged<T>(
        channel: string,
        fn: () => Promise<IpcResult<T>>,
    ): Promise<IpcResult<T>> {
        const start = Date.now();
        log.debug(`${channel} called`);
        const result = await fn();
        const elapsed = Date.now() - start;
        if (!result.ok) {
            log.warn(`${channel} failed: ${result.error.code} (${String(elapsed)}ms)`);
        } else {
            log.debug(`${channel} ok (${String(elapsed)}ms)`);
        }
        return result;
    }

    ipcMain.handle(IPC_CHANNELS.CONFIG_GET, () =>
        logged(IPC_CHANNELS.CONFIG_GET, () => handleConfigGet(deps)),
    );
    ipcMain.handle(IPC_CHANNELS.CONFIG_SAVE, (_e, config: unknown) =>
        logged(IPC_CHANNELS.CONFIG_SAVE, async () => {
            const result = await handleConfigSave(deps, config);
            if (result.ok) {
                const cfg = config as { plugins?: unknown[] };
                log.info(`Config saved: ${String(cfg.plugins?.length ?? "?")} plugins`);
            }
            return result;
        }),
    );
    ipcMain.handle(IPC_CHANNELS.CONFIG_SAVE_SECRETS, (_e, payload: unknown) =>
        logged(IPC_CHANNELS.CONFIG_SAVE_SECRETS, () => {
            const p = payload as { instanceId?: string; secrets?: Record<string, unknown> };
            log.info(
                `Saving secrets for instanceId=${p.instanceId ?? "?"}, keys=[${Object.keys(p.secrets ?? {}).join(", ")}]`,
            );
            return handleConfigSaveSecrets(deps, payload);
        }),
    );
    ipcMain.handle(IPC_CHANNELS.CONFIG_DUPLICATE, (_e, instanceId: string) =>
        logged(IPC_CHANNELS.CONFIG_DUPLICATE, () => {
            log.info(`Duplicating plugin ${instanceId}`);
            return handleConfigDuplicate(deps, instanceId);
        }),
    );
}
