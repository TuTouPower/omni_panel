import { z } from "zod/v3";
import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { ConnectorInfo, ConnectorSnapshotDTO } from "../../shared/types/ipc";
import type { IpcResult } from "./helpers";
import { ok, fail, toDTO, assert_valid_sender } from "./helpers";
import type { AppConfigStore } from "../core/config/config-store";
import type { ConnectorConfiguration } from "../../shared/types/config";
import type { RuntimeStore } from "../core/scheduler/runtime-store";
import type { ConnectorRefreshService } from "../core/scheduler/refresh-service";
import type { ConnectorDefinition } from "../core/connector/manifest-loader";
import type { PluginMetadata } from "../../shared/schemas/plugin-metadata";
import type { UsageProvider, UsageSource } from "../../shared/schemas/plugin-output";
import { usageProviderSchema } from "../../shared/schemas/plugin-output";
import { createLogger } from "../../shared/lib/logger";
import { createLoggedIpcHandler } from "./logged";

const instanceIdSchema = z.string().min(1);

function source_from_definition(definition: ConnectorDefinition | undefined): UsageSource {
    if (!definition) return "poll";
    const capabilities = definition.manifest.capabilities;
    if (capabilities.includes("session")) return "session";
    if (capabilities.includes("local")) return "local";
    if (capabilities.includes("observe")) return "probe";
    return "poll";
}

function supported_providers(
    definition: ConnectorDefinition | undefined,
): readonly UsageProvider[] {
    if (!definition) return [];
    if (definition.manifest.id === "cpa") {
        return definition.manifest.parameters
            .filter((p) => p.name.startsWith("monitor_"))
            .map((p) => p.name.replace("monitor_", ""))
            .filter((p): p is UsageProvider => {
                const result = usageProviderSchema.safeParse(p);
                return result.success;
            });
    }
    const provider = usageProviderSchema.safeParse(definition.manifest.provider);
    return provider.success ? [provider.data] : [];
}

function metadata_from_definition(
    definition: ConnectorDefinition | undefined,
): PluginMetadata | null {
    if (!definition) return null;
    return {
        name: definition.manifest.id,
        parameters: definition.manifest.parameters.map((param) => ({
            name: param.name,
            label: param.label ?? param.name,
            type: param.type === "number" ? "integer" : param.type,
            required: param.required,
            ...(param.default !== undefined && { defaultValue: param.default }),
            ...(param["label@zh-Hans"] !== undefined && {
                "label@zh-Hans": param["label@zh-Hans"],
            }),
        })),
        endpoints: Object.fromEntries(
            Object.entries(definition.manifest.endpoints ?? {}).map(([key, value]) => [key, value]),
        ),
        supportedProviders: [...supported_providers(definition)],
        defaultSource: source_from_definition(definition),
    };
}

function activeProvidersForConnector(
    plugin: ConnectorConfiguration,
    definition: ConnectorDefinition | undefined,
): readonly UsageProvider[] {
    const providers = supported_providers(definition);
    if (!definition) return providers;
    if (definition.manifest.id !== "cpa") return providers;
    return providers.filter((provider) => {
        const key = `monitor_${provider}`;
        const metadataDefault = definition.manifest.parameters.find((p) => p.name === key)?.default;
        return (
            String(plugin.parameterValues[key] ?? metadataDefault ?? "").toLowerCase() === "true"
        );
    });
}

export interface ConnectorIpcDeps {
    configStore: AppConfigStore;
    runtimeStore: RuntimeStore;
    refreshService: ConnectorRefreshService;
    definitions: readonly ConnectorDefinition[];
}

export async function handleConnectorList(
    deps: ConnectorIpcDeps,
): Promise<IpcResult<ConnectorInfo[]>> {
    try {
        const config = await deps.configStore.load();
        const plugins: ConnectorInfo[] = config.plugins.map((plugin) => {
            const definition = deps.definitions.find(
                (d) => d.executablePath === plugin.executablePath,
            );
            const snapshot = toDTO(deps.runtimeStore.getSnapshot(plugin.instanceId));
            const metadata = metadata_from_definition(definition);
            const providers = supported_providers(definition);
            return {
                instanceId: plugin.instanceId,
                sourceInstanceId: plugin.instanceId,
                stateId: plugin.stateId,
                name: plugin.name,
                displayName: plugin.name,
                enabled: plugin.enabled,
                source: source_from_definition(definition),
                supportedProviders: providers,
                activeProviders: activeProvidersForConnector(plugin, definition),
                metadata,
                snapshot,
            };
        });
        return ok(plugins);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return fail("INTERNAL_ERROR", `获取连接器列表失败: ${msg}`);
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
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return fail("INTERNAL_ERROR", `获取连接器状态失败: ${msg}`);
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
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return fail("INTERNAL_ERROR", `刷新失败: ${msg}`);
    }
}

export async function handleConnectorRefreshAll(deps: ConnectorIpcDeps): Promise<IpcResult<void>> {
    try {
        await deps.refreshService.refreshAll();
        return ok(undefined);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return fail("INTERNAL_ERROR", `刷新全部失败: ${msg}`);
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
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return fail("INTERNAL_ERROR", `获取连接器快照失败: ${msg}`);
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
