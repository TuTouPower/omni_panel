import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { createLogger } from "../../shared/lib/logger";
import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { PopupContentHeightReport } from "../../shared/types/ipc";
import { ok, fail, assert_valid_sender } from "./helpers";
import type { IpcResult } from "./helpers";
import { parseSizeReport } from "./size-validation";

const log = createLogger("popup-ipc");

// Real-world display resolution cap (e.g. 4K = 3840). Reject implausible sizes
// that would only make sense as a DoS / UI-disruption attempt.
const POPUP_SIZE_MAX = 4096;

export interface PopupIpcDeps {
    report_content_height: (report: PopupContentHeightReport) => number | null;
}

export function registerPopupIpc(deps: PopupIpcDeps): () => void {
    const handler = (event: IpcMainInvokeEvent, payload: unknown): IpcResult<null> => {
        assert_valid_sender(event);
        log.debug("POPUP_REPORT_CONTENT_HEIGHT received");
        const report = parseSizeReport(
            payload,
            ["content_height", "collapsed_min_height"],
            POPUP_SIZE_MAX,
        );
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
