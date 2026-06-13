import { nativeTheme, BrowserWindow, ipcMain } from "electron";
import { z } from "zod/v3";
import { IPC_CHANNELS } from "../../shared/types/ipc";
import { toDTO, assert_valid_sender } from "./helpers";
import type { RuntimeStore } from "../core/scheduler/runtime-store";
import type { ConnectorSnapshotState } from "../core/scheduler/types";
import { createLogger } from "../../shared/lib/logger";

const themeSchema = z.enum(["light", "dark", "system"]);

export interface EventIpcDeps {
    runtimeStore: RuntimeStore;
}

export function registerEventIpc(deps: EventIpcDeps): () => void {
    const log = createLogger("ipc:event");

    const unsubState = deps.runtimeStore.subscribe({
        onStateChange(instanceId: string, state: ConnectorSnapshotState) {
            const channel = IPC_CHANNELS.EVENT_STATE_CHANGE;
            const args = [instanceId, state];
            const is_development = process.env["NODE_ENV"] === "development";
            if (is_development) log.debug("ipc request raw", { channel, args });
            try {
                const dto = toDTO(state);
                const winCount = BrowserWindow.getAllWindows().filter(
                    (w) => !w.isDestroyed(),
                ).length;
                log.debug(
                    `State change: ${instanceId} → ${dto.status} (broadcast to ${String(winCount)} windows)`,
                );
                for (const win of BrowserWindow.getAllWindows()) {
                    if (!win.isDestroyed()) {
                        win.webContents.send(channel, instanceId, dto);
                    }
                }
                if (is_development) {
                    log.debug("ipc response raw", {
                        channel,
                        result: { instanceId, dto, winCount },
                    });
                }
            } catch (error: unknown) {
                if (is_development) log.debug("ipc error raw", { channel, error });
                throw error;
            }
        },
    });

    const themeHandler = () => {
        const channel = IPC_CHANNELS.EVENT_THEME_CHANGE;
        const is_development = process.env["NODE_ENV"] === "development";
        if (is_development) log.debug("ipc request raw", { channel, args: [] });
        try {
            const isDark = nativeTheme.shouldUseDarkColors;
            log.debug(`Theme changed: ${isDark ? "dark" : "light"}`);
            for (const win of BrowserWindow.getAllWindows()) {
                if (!win.isDestroyed()) {
                    win.webContents.send(channel, isDark);
                }
            }
            if (is_development) log.debug("ipc response raw", { channel, result: isDark });
        } catch (error: unknown) {
            if (is_development) log.debug("ipc error raw", { channel, error });
            throw error;
        }
    };

    nativeTheme.on("updated", themeHandler);

    // Allow renderer to set the app theme explicitly.
    // Setting nativeTheme.themeSource triggers the "updated" event above,
    // which broadcasts to all windows automatically.
    ipcMain.handle(IPC_CHANNELS.THEME_SET, (e, mode: unknown) => {
        assert_valid_sender(e);
        const channel = IPC_CHANNELS.THEME_SET;
        const args = [mode];
        const is_development = process.env["NODE_ENV"] === "development";
        if (is_development) log.debug("ipc request raw", { channel, args });
        try {
            const parsed = themeSchema.safeParse(mode);
            if (!parsed.success) {
                log.warn(`Invalid THEME_SET mode: ${String(mode)}`);
                if (is_development) log.debug("ipc response raw", { channel, result: undefined });
                return;
            }
            nativeTheme.themeSource = parsed.data;
            if (is_development) log.debug("ipc response raw", { channel, result: undefined });
        } catch (error: unknown) {
            if (is_development) log.debug("ipc error raw", { channel, error });
            throw error;
        }
    });

    return () => {
        unsubState();
        nativeTheme.off("updated", themeHandler);
        ipcMain.removeHandler(IPC_CHANNELS.THEME_SET);
    };
}
