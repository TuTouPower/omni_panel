import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { PopupContentHeightReport } from "../../shared/types/ipc";
import { ok, fail } from "./helpers";
import type { IpcResult } from "./helpers";
import { parseSizeReport } from "./size-validation";

export interface PopupIpcDeps {
    report_content_height: (report: PopupContentHeightReport) => number | null;
}

export function registerPopupIpc(deps: PopupIpcDeps): () => void {
    const handler = (_event: unknown, payload: unknown): IpcResult<null> => {
        const report = parseSizeReport(payload, ["content_height", "collapsed_min_height"], 10000);
        if (!report) {
            return fail("invalid_payload", "popup height report must include numeric heights");
        }
        deps.report_content_height(report as unknown as PopupContentHeightReport);
        return ok(null);
    };
    ipcMain.handle(IPC_CHANNELS.POPUP_REPORT_CONTENT_HEIGHT, handler);
    return () => {
        ipcMain.removeHandler(IPC_CHANNELS.POPUP_REPORT_CONTENT_HEIGHT);
    };
}
