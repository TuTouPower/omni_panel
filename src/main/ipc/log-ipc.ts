import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { RendererLogPayload } from "../../shared/types/ipc";
import type { Logger } from "../../shared/lib/logger";
import { createLogger } from "../../shared/lib/logger";
import type { IpcResult } from "./helpers";
import { ok } from "./helpers";

export function handleRendererLog(payload: unknown): IpcResult<void> {
    if (!payload || typeof payload !== "object") return ok(undefined);

    const { level, module, message } = payload as RendererLogPayload;
    const meta =
        process.env["NODE_ENV"] === "development"
            ? (payload as RendererLogPayload).meta
            : undefined;
    const log: Logger = createLogger(
        module.startsWith("renderer:") ? module : `renderer:${module}`,
    );

    switch (level) {
        case "debug":
            log.debug(message, meta);
            break;
        case "info":
            log.info(message, meta);
            break;
        case "warn":
            log.warn(message, meta);
            break;
        case "error":
            log.error(message, meta);
            break;
        default:
            log.warn(`Invalid renderer log level: ${String(level)} — ${message}`, meta);
            break;
    }

    return ok(undefined);
}

export async function registerLogIpc(): Promise<void> {
    const { ipcMain } = await import("electron");
    const log = createLogger("ipc:log");
    ipcMain.handle(IPC_CHANNELS.LOG_RENDERER, (_e, payload: unknown) => {
        const channel = IPC_CHANNELS.LOG_RENDERER;
        const args = [payload];
        const is_development = process.env["NODE_ENV"] === "development";
        if (is_development) log.debug("ipc request raw", { channel, args });
        try {
            const result = handleRendererLog(payload);
            if (is_development) log.debug("ipc response raw", { channel, result });
            return result;
        } catch (error: unknown) {
            if (is_development) log.debug("ipc error raw", { channel, error });
            throw error;
        }
    });
}
