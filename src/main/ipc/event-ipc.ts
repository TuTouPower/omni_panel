import { nativeTheme, BrowserWindow, ipcMain } from "electron";
import { z } from "zod/v3";
import { IPC_CHANNELS } from "../../shared/types/ipc";
import { toDTO } from "./helpers";
import type { RuntimeStore } from "../core/scheduler/runtime-store";
import type { PluginSnapshotState } from "../core/scheduler/types";
import { createLogger } from "../../shared/lib/logger";

const themeSchema = z.enum(["light", "dark", "system"]);

export interface EventIpcDeps {
    runtimeStore: RuntimeStore;
}

export function registerEventIpc(deps: EventIpcDeps): () => void {
    const log = createLogger("ipc:event");

    const unsubState = deps.runtimeStore.subscribe({
        onStateChange(instanceId: string, state: PluginSnapshotState) {
            const dto = toDTO(state);
            const winCount = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()).length;
            log.debug(
                `State change: ${instanceId} → ${dto.status} (broadcast to ${String(winCount)} windows)`,
            );
            for (const win of BrowserWindow.getAllWindows()) {
                if (!win.isDestroyed()) {
                    win.webContents.send(IPC_CHANNELS.EVENT_STATE_CHANGE, instanceId, dto);
                }
            }
        },
    });

    const themeHandler = () => {
        const isDark = nativeTheme.shouldUseDarkColors;
        log.debug(`Theme changed: ${isDark ? "dark" : "light"}`);
        for (const win of BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed()) {
                win.webContents.send(IPC_CHANNELS.EVENT_THEME_CHANGE, isDark);
            }
        }
    };

    nativeTheme.on("updated", themeHandler);

    // Allow renderer to set the app theme explicitly.
    // Setting nativeTheme.themeSource triggers the "updated" event above,
    // which broadcasts to all windows automatically.
    ipcMain.handle(IPC_CHANNELS.THEME_SET, (_e, mode: unknown) => {
        const parsed = themeSchema.safeParse(mode);
        if (!parsed.success) {
            log.warn(`Invalid THEME_SET mode: ${String(mode)}`);
            return;
        }
        nativeTheme.themeSource = parsed.data;
    });

    return () => {
        unsubState();
        nativeTheme.off("updated", themeHandler);
        ipcMain.removeHandler(IPC_CHANNELS.THEME_SET);
    };
}
