import { z } from "zod/v3";
import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { PluginInfo, PluginSnapshotDTO } from "../../shared/types/ipc";
import type { IpcResult } from "./helpers";
import { ok, fail } from "./helpers";
import type { AppConfigStore } from "../core/config/config-store";
import type { RuntimeStore } from "../core/scheduler/runtime-store";
import type { PluginSnapshotState } from "../core/scheduler/types";
import type { PluginRefreshService } from "../core/scheduler/refresh-service";

const stateIdSchema = z.string().min(1);

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
}

export async function handlePluginList(deps: PluginIpcDeps): Promise<IpcResult<PluginInfo[]>> {
    try {
        const config = await deps.configStore.load();
        const plugins: PluginInfo[] = config.plugins.map((plugin) => {
            const snapshot = toDTO(deps.runtimeStore.getSnapshot(plugin.stateId));
            return {
                stateId: plugin.stateId,
                name: plugin.name,
                enabled: plugin.enabled,
                metadata: null,
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
    stateId: string,
): IpcResult<PluginSnapshotDTO> {
    try {
        const parsed = stateIdSchema.safeParse(stateId);
        if (!parsed.success) return fail("VALIDATION_ERROR", "无效的插件 ID");
        const state = deps.runtimeStore.getSnapshot(parsed.data);
        return ok(toDTO(state));
    } catch {
        return fail("INTERNAL_ERROR", "获取插件状态失败");
    }
}

export async function handlePluginRefresh(
    deps: PluginIpcDeps,
    stateId: string,
): Promise<IpcResult<void>> {
    try {
        const parsed = stateIdSchema.safeParse(stateId);
        if (!parsed.success) return fail("VALIDATION_ERROR", "无效的插件 ID");
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
    ipcMain.handle(IPC_CHANNELS.PLUGIN_LIST, () => handlePluginList(deps));
    ipcMain.handle(IPC_CHANNELS.PLUGIN_GET_STATE, (_e, stateId: string) =>
        handlePluginGetState(deps, stateId),
    );
    ipcMain.handle(IPC_CHANNELS.PLUGIN_REFRESH, (_e, stateId: string) =>
        handlePluginRefresh(deps, stateId),
    );
    ipcMain.handle(IPC_CHANNELS.PLUGIN_REFRESH_ALL, () => handlePluginRefreshAll(deps));
}
