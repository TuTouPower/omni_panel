import { z } from "zod/v3";
import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { PluginInfo, PluginSnapshotDTO } from "../../shared/types/ipc";
import type { IpcResult } from "./helpers";
import { ok, fail } from "./helpers";
import type { AppConfigStore } from "../core/config/config-store";
import type { RuntimeStore } from "../core/scheduler/runtime-store";
import type { PluginSnapshotState } from "../core/scheduler/types";
import type { PluginRefreshService } from "../core/scheduler/refresh-service";
import type { PluginDefinition } from "../core/plugin/types";
import { resolveDisplayNames } from "../core/plugin/display-names";
import { createLogger } from "../../shared/lib/logger";

const instanceIdSchema = z.string().min(1);

function toDTO(state: PluginSnapshotState): PluginSnapshotDTO {
    switch (state.status) {
        case "idle":
            return { status: "idle" };
        case "loading":
            return { status: "loading" };
        case "ready":
            return {
                status: "ready",
                items: state.items,
                updatedAt: state.updatedAt.toISOString(),
                ...(state.badge !== undefined && { badge: state.badge }),
                ...(state.chart !== undefined && { chart: state.chart }),
            };
        case "failed":
            return {
                status: "failed",
                error: state.error,
                ...(state.lastSuccess !== undefined && {
                    updatedAt: state.lastSuccess.updatedAt,
                    items: state.lastSuccess.items,
                }),
            };
    }
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
            return {
                instanceId: plugin.instanceId,
                stateId: plugin.stateId,
                name: plugin.name,
                displayName: displayNames.get(plugin.instanceId) ?? plugin.name,
                enabled: plugin.enabled,
                metadata:
                    pluginEntries.find((e) => e.config.instanceId === plugin.instanceId)
                        ?.metadata ?? null,
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

    ipcMain.handle(IPC_CHANNELS.PLUGIN_LIST, () =>
        logged(IPC_CHANNELS.PLUGIN_LIST, () => handlePluginList(deps)),
    );
    ipcMain.handle(IPC_CHANNELS.PLUGIN_GET_STATE, (_e, instanceId: string) =>
        logged(IPC_CHANNELS.PLUGIN_GET_STATE, () =>
            Promise.resolve(handlePluginGetState(deps, instanceId)),
        ),
    );
    ipcMain.handle(IPC_CHANNELS.PLUGIN_REFRESH, (_e, instanceId: string) =>
        logged(IPC_CHANNELS.PLUGIN_REFRESH, () => {
            log.info(`User requested refresh for ${instanceId}`);
            return handlePluginRefresh(deps, instanceId);
        }),
    );
    ipcMain.handle(IPC_CHANNELS.PLUGIN_REFRESH_ALL, () =>
        logged(IPC_CHANNELS.PLUGIN_REFRESH_ALL, () => {
            log.info("User requested refresh all plugins");
            return handlePluginRefreshAll(deps);
        }),
    );
}
