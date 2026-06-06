import { z } from "zod/v3";
import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { PluginInfo, PluginSnapshotDTO } from "../../shared/types/ipc";
import type { IpcResult } from "./helpers";
import { ok, fail, toDTO } from "./helpers";
import type { AppConfigStore } from "../core/config/config-store";
import type { PluginConfiguration } from "../../shared/types/config";
import type { RuntimeStore } from "../core/scheduler/runtime-store";
import type { PluginRefreshService } from "../core/scheduler/refresh-service";
import type { PluginDefinition } from "../core/plugin/types";
import type { PluginMetadata } from "../../shared/schemas/plugin-metadata";
import type { UsageProvider, UsageSource } from "../../shared/schemas/plugin-output";
import { resolveDisplayNames } from "../core/plugin/display-names";
import { createLogger } from "../../shared/lib/logger";

const instanceIdSchema = z.string().min(1);

function sourceFromMetadata(metadata: PluginMetadata | null): UsageSource {
    return metadata?.defaultSource ?? "direct";
}

function activeProvidersForConnector(
    plugin: PluginConfiguration,
    metadata: PluginMetadata | null,
): readonly UsageProvider[] {
    const supportedProviders = metadata?.supportedProviders ?? [];
    if (metadata?.defaultSource !== "cpa") return supportedProviders;
    return supportedProviders.filter((provider) => {
        const key = `monitor_${provider}`;
        const metadataDefault = metadata.parameters?.find((p) => p.name === key)?.defaultValue;
        return (plugin.parameterValues[key] ?? metadataDefault ?? "").toLowerCase() === "true";
    });
}

export interface PluginIpcDeps {
    configStore: AppConfigStore;
    runtimeStore: RuntimeStore;
    refreshService: PluginRefreshService;
    definitions: readonly PluginDefinition[];
}

export async function handlePluginList(deps: PluginIpcDeps): Promise<IpcResult<PluginInfo[]>> {
    try {
        const config = await deps.configStore.load();
        const pluginEntries = config.plugins.map((plugin) => {
            const def = deps.definitions.find((d) => d.executablePath === plugin.executablePath);
            return {
                config: plugin,
                metadata: def?.metadata ?? null,
            };
        });
        const displayNames = resolveDisplayNames(pluginEntries);

        const plugins: PluginInfo[] = config.plugins.map((plugin) => {
            const snapshot = toDTO(deps.runtimeStore.getSnapshot(plugin.instanceId));
            const metadata =
                pluginEntries.find((e) => e.config.instanceId === plugin.instanceId)?.metadata ??
                null;
            const supportedProviders = metadata?.supportedProviders ?? [];
            return {
                instanceId: plugin.instanceId,
                sourceInstanceId: plugin.instanceId,
                stateId: plugin.stateId,
                name: plugin.name,
                displayName: displayNames.get(plugin.instanceId) ?? plugin.name,
                enabled: plugin.enabled,
                source: sourceFromMetadata(metadata),
                supportedProviders,
                activeProviders: activeProvidersForConnector(plugin, metadata),
                metadata,
                snapshot,
            };
        });
        return ok(plugins);
    } catch {
        return fail("INTERNAL_ERROR", "获取插件列表失败");
    }
}

export function handlePluginGetState(
    deps: PluginIpcDeps,
    instanceId: string,
): IpcResult<PluginSnapshotDTO> {
    try {
        const parsed = instanceIdSchema.safeParse(instanceId);
        if (!parsed.success) return fail("VALIDATION_ERROR", "无效的插件 ID");
        const state = deps.runtimeStore.getSnapshot(parsed.data);
        return ok(toDTO(state));
    } catch {
        return fail("INTERNAL_ERROR", "获取插件状态失败");
    }
}

export async function handlePluginRefresh(
    deps: PluginIpcDeps,
    instanceId: string,
): Promise<IpcResult<void>> {
    try {
        const parsed = instanceIdSchema.safeParse(instanceId);
        if (!parsed.success) return fail("VALIDATION_ERROR", "无效的插件 ID");
        const config = await deps.configStore.load();
        const plugin = config.plugins.find((p) => p.instanceId === parsed.data);
        if (!plugin) return fail("VALIDATION_ERROR", "插件不存在");
        if (!plugin.enabled) return fail("VALIDATION_ERROR", "插件未启用");
        await deps.refreshService.refresh(parsed.data, { force: true });
        return ok(undefined);
    } catch {
        return fail("INTERNAL_ERROR", "刷新失败");
    }
}

export async function handlePluginRefreshAll(deps: PluginIpcDeps): Promise<IpcResult<void>> {
    try {
        await deps.refreshService.refreshAll();
        return ok(undefined);
    } catch {
        return fail("INTERNAL_ERROR", "刷新全部失败");
    }
}

export async function registerPluginIpc(deps: PluginIpcDeps): Promise<void> {
    const { ipcMain } = await import("electron");
    const log = createLogger("ipc:plugin");

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

    ipcMain.handle(IPC_CHANNELS.PLUGIN_LIST, () =>
        logged(IPC_CHANNELS.PLUGIN_LIST, [], () => handlePluginList(deps)),
    );
    ipcMain.handle(IPC_CHANNELS.PLUGIN_GET_STATE, (_e, instanceId: string) =>
        logged(IPC_CHANNELS.PLUGIN_GET_STATE, [instanceId], () =>
            Promise.resolve(handlePluginGetState(deps, instanceId)),
        ),
    );
    ipcMain.handle(IPC_CHANNELS.PLUGIN_REFRESH, (_e, instanceId: string) =>
        logged(IPC_CHANNELS.PLUGIN_REFRESH, [instanceId], () => {
            log.info(`User requested refresh for ${instanceId}`);
            return handlePluginRefresh(deps, instanceId);
        }),
    );
    ipcMain.handle(IPC_CHANNELS.PLUGIN_REFRESH_ALL, () =>
        logged(IPC_CHANNELS.PLUGIN_REFRESH_ALL, [], () => {
            log.info("User requested refresh all plugins");
            return handlePluginRefreshAll(deps);
        }),
    );
}
