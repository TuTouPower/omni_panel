import { nativeTheme, BrowserWindow } from "electron";
import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { PluginSnapshotDTO } from "../../shared/types/ipc";
import type { RuntimeStore } from "../core/scheduler/runtime-store";
import type { PluginSnapshotState } from "../core/scheduler/types";

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

export interface EventIpcDeps {
    runtimeStore: RuntimeStore;
}

export function registerEventIpc(deps: EventIpcDeps): () => void {
    const unsubState = deps.runtimeStore.subscribe({
        onStateChange(instanceId: string, state: PluginSnapshotState) {
            const dto = toDTO(state);
            for (const win of BrowserWindow.getAllWindows()) {
                if (!win.isDestroyed()) {
                    win.webContents.send(IPC_CHANNELS.EVENT_STATE_CHANGE, instanceId, dto);
                }
            }
        },
    });

    const themeHandler = () => {
        const isDark = nativeTheme.shouldUseDarkColors;
        for (const win of BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed()) {
                win.webContents.send(IPC_CHANNELS.EVENT_THEME_CHANGE, isDark);
            }
        }
    };

    nativeTheme.on("updated", themeHandler);

    return () => {
        unsubState();
        nativeTheme.off("updated", themeHandler);
    };
}
