import { z } from "zod/v3";
import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { ConnectorInfo, ConnectorSnapshotDTO } from "../../shared/types/ipc";
import type { IpcResult } from "./helpers";
import { ok, fail, toDTO, assert_valid_sender } from "./helpers";
import type { AppConfigStore } from "../core/config/config-store";
import type { PluginConfiguration } from "../../shared/types/config";
import type { RuntimeStore } from "../core/scheduler/runtime-store";
import type { PluginRefreshService } from "../core/scheduler/refresh-service";
import type { PluginDefinition } from "../core/plugin/types";
import type { PluginMetadata } from "../../shared/schemas/plugin-metadata";
import type { UsageProvider, UsageSource } from "../../shared/schemas/plugin-output";
import { resolveDisplayNames } from "../core/plugin/display-names";
import { createLogger } from "../../shared/lib/logger";
import { createLoggedIpcHandler } from "./logged";

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

export interface ConnectorIpcDeps {
    configStore: AppConfigStore;
    runtimeStore: RuntimeStore;
    refreshService: PluginRefreshService;
    definitions: readonly PluginDefinition[];
}

export async function handleConnectorList(
    deps: ConnectorIpcDeps,
): Promise<IpcResult<ConnectorInfo[]>> {
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

        const plugins: ConnectorInfo[] = config.plugins.map((plugin) => {
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
        return fail("INTERNAL_ERROR", "获取连接器列表失败");
    }
}

export function handleConnectorGetState(
    deps: ConnectorIpcDeps,
    instanceId: string,
): IpcResult<ConnectorSnapshotDTO> {
    try {
        const parsed = instanceIdSchema.safeParse(instanceId);
        if (!parsed.success) return fail("VALIDATION_ERROR", "无效的连接器 ID");
        const state = deps.runtimeStore.getSnapshot(parsed.data);
        return ok(toDTO(state));
    } catch {
        return fail("INTERNAL_ERROR", "获取连接器状态失败");
    }
}

export async function handleConnectorRefresh(
    deps: ConnectorIpcDeps,
    instanceId: string,
): Promise<IpcResult<void>> {
    try {
        const parsed = instanceIdSchema.safeParse(instanceId);
        if (!parsed.success) return fail("VALIDATION_ERROR", "无效的连接器 ID");
        const config = await deps.configStore.load();
        const plugin = config.plugins.find((p) => p.instanceId === parsed.data);
        if (!plugin) return fail("VALIDATION_ERROR", "连接器不存在");
        if (!plugin.enabled) return fail("VALIDATION_ERROR", "连接器未启用");
        await deps.refreshService.refresh(parsed.data, { force: true });
        return ok(undefined);
    } catch {
        return fail("INTERNAL_ERROR", "刷新失败");
    }
}

export async function handleConnectorRefreshAll(deps: ConnectorIpcDeps): Promise<IpcResult<void>> {
    try {
        await deps.refreshService.refreshAll();
        return ok(undefined);
    } catch {
        return fail("INTERNAL_ERROR", "刷新全部失败");
    }
}

export function handleConnectorSnapshot(
    deps: ConnectorIpcDeps,
): IpcResult<Record<string, ConnectorSnapshotDTO>> {
    try {
        const snapshot: Record<string, ConnectorSnapshotDTO> = {};
        for (const [instance_id, state] of deps.runtimeStore.getAll()) {
            snapshot[instance_id] = toDTO(state);
        }
        return ok(snapshot);
    } catch {
        return fail("INTERNAL_ERROR", "获取连接器快照失败");
    }
}

export async function registerConnectorIpc(deps: ConnectorIpcDeps): Promise<void> {
    const { ipcMain } = await import("electron");
    const log = createLogger("ipc:connector");

    const logged = createLoggedIpcHandler(log);

    ipcMain.handle(IPC_CHANNELS.CONNECTOR_LIST, (e) =>
        logged(IPC_CHANNELS.CONNECTOR_LIST, [], () => {
            assert_valid_sender(e);
            return handleConnectorList(deps);
        }),
    );
    ipcMain.handle(IPC_CHANNELS.CONNECTOR_GET_STATE, (e, instanceId: string) =>
        logged(IPC_CHANNELS.CONNECTOR_GET_STATE, [instanceId], () => {
            assert_valid_sender(e);
            return Promise.resolve(handleConnectorGetState(deps, instanceId));
        }),
    );
    ipcMain.handle(IPC_CHANNELS.CONNECTOR_REFRESH, (e, instanceId: string) =>
        logged(IPC_CHANNELS.CONNECTOR_REFRESH, [instanceId], () => {
            assert_valid_sender(e);
            log.info(`User requested refresh for ${instanceId}`);
            return handleConnectorRefresh(deps, instanceId);
        }),
    );
    ipcMain.handle(IPC_CHANNELS.CONNECTOR_REFRESH_ALL, (e) =>
        logged(IPC_CHANNELS.CONNECTOR_REFRESH_ALL, [], () => {
            assert_valid_sender(e);
            log.info("User requested refresh all connectors");
            return handleConnectorRefreshAll(deps);
        }),
    );
    ipcMain.handle(IPC_CHANNELS.CONNECTOR_SNAPSHOT, (e) =>
        logged(IPC_CHANNELS.CONNECTOR_SNAPSHOT, [], () => {
            assert_valid_sender(e);
            return Promise.resolve(handleConnectorSnapshot(deps));
        }),
    );
}
