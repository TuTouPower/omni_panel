import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { RendererLogPayload } from "../../shared/types/ipc";
import type { Logger } from "../../shared/lib/logger";
import { createLogger } from "../../shared/lib/logger";
import { exportCurrentLog } from "../core/logging";
import type { IpcResult } from "./helpers";
import { fail, ok, assert_valid_sender } from "./helpers";

export function handleRendererLog(payload: unknown): IpcResult<void> {
    if (!payload || typeof payload !== "object") return ok(undefined);

    const { level, module, message } = payload as RendererLogPayload;
    if (typeof module !== "string" || typeof message !== "string") return ok(undefined);
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

export async function handleLogExport(
    userDataPath: string,
): Promise<IpcResult<{ saved: boolean }>> {
    const log = createLogger("ipc:log");
    try {
        const { dialog } = await import("electron");
        const { filePath, canceled } = await dialog.showSaveDialog({
            title: "导出运行日志",
            defaultPath: `omni-usage-log-${new Date().toISOString().slice(0, 10)}.log`,
            filters: [{ name: "Log", extensions: ["log"] }],
        });
        if (canceled || !filePath) return ok({ saved: false });
        await exportCurrentLog(userDataPath, filePath);
        return ok({ saved: true });
    } catch (err: unknown) {
        log.error("导出日志失败", err);
        return fail("INTERNAL_ERROR", "导出运行日志失败");
    }
}

export async function registerLogIpc(userDataPath: string): Promise<void> {
    const { ipcMain } = await import("electron");
    const log = createLogger("ipc:log");
    ipcMain.handle(IPC_CHANNELS.LOG_RENDERER, (e, payload: unknown) => {
        assert_valid_sender(e);
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
    ipcMain.handle(IPC_CHANNELS.LOG_EXPORT, (e) => {
        assert_valid_sender(e);
        return handleLogExport(userDataPath);
    });
}
