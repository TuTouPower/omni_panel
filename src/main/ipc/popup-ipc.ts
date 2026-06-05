import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { PopupContentHeightReport } from "../../shared/types/ipc";
import { ok, fail } from "./helpers";
import type { IpcResult } from "./helpers";

export interface PopupIpcDeps {
    report_content_height: (report: PopupContentHeightReport) => number | null;
}

function is_valid_report(value: unknown): value is PopupContentHeightReport {
    if (typeof value !== "object" || value === null) return false;
    const v = value as { content_height?: unknown; collapsed_min_height?: unknown };
    return (
        typeof v.content_height === "number" &&
        Number.isFinite(v.content_height) &&
        v.content_height >= 0 &&
        typeof v.collapsed_min_height === "number" &&
        Number.isFinite(v.collapsed_min_height) &&
        v.collapsed_min_height >= 0
    );
}

export function registerPopupIpc(deps: PopupIpcDeps): () => void {
    const handler = (_event: unknown, payload: unknown): IpcResult<null> => {
        if (!is_valid_report(payload)) {
            return fail("invalid_payload", "popup height report must include numeric heights");
        }
        deps.report_content_height(payload);
        return ok(null);
    };
    ipcMain.handle(IPC_CHANNELS.POPUP_REPORT_CONTENT_HEIGHT, handler);
    return () => {
        ipcMain.removeHandler(IPC_CHANNELS.POPUP_REPORT_CONTENT_HEIGHT);
    };
}
