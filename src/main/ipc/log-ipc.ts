import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { RendererLogPayload } from "../../shared/types/ipc";
import type { Logger } from "../../shared/lib/logger";
import { createLogger } from "../../shared/lib/logger";
import type { IpcResult } from "./helpers";
import { ok } from "./helpers";

export function handleRendererLog(payload: unknown): IpcResult<void> {
    if (!payload || typeof payload !== "object") return ok(undefined);

    const { level, module, message } = payload as RendererLogPayload;
    const log: Logger = createLogger(`renderer:${module}`);

    switch (level) {
        case "debug":
            log.debug(message);
            break;
        case "info":
            log.info(message);
            break;
        case "warn":
            log.warn(message);
            break;
        case "error":
            log.error(message);
            break;
    }

    return ok(undefined);
}

export async function registerLogIpc(): Promise<void> {
    const { ipcMain } = await import("electron");
    ipcMain.handle(IPC_CHANNELS.LOG_RENDERER, (_e, payload: unknown) => handleRendererLog(payload));
}
