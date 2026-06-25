import { ipcMain } from "electron";
import { createLogger } from "../../shared/lib/logger";
import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { PopupContentHeightReport } from "../../shared/types/ipc";
import { ok, fail } from "./helpers";
import type { IpcResult } from "./helpers";
import { parseSizeReport } from "./size-validation";

const log = createLogger("popup-ipc");

export interface PopupIpcDeps {
    report_content_height: (report: PopupContentHeightReport) => number | null;
}

export function registerPopupIpc(deps: PopupIpcDeps): () => void {
    const handler = (_event: unknown, payload: unknown): IpcResult<null> => {
        log.debug("POPUP_REPORT_CONTENT_HEIGHT received");
        const report = parseSizeReport(payload, ["content_height", "collapsed_min_height"], 10000);
        if (!report) {
            log.warn("POPUP_REPORT_CONTENT_HEIGHT: invalid payload");
            return fail("invalid_payload", "popup height report must include numeric heights");
        }
        deps.report_content_height(report as unknown as PopupContentHeightReport);
        return ok(null);
    };
    ipcMain.handle(IPC_CHANNELS.POPUP_REPORT_CONTENT_HEIGHT, handler);
    log.debug("popup IPC handlers registered");
    return () => {
        ipcMain.removeHandler(IPC_CHANNELS.POPUP_REPORT_CONTENT_HEIGHT);
    };
}
