import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { IpcResult } from "./helpers";
import { ok, assert_valid_sender } from "./helpers";
import { BUILD_INFO } from "../../generated/build-info";

export interface BuildInfo {
    version: string;
    branch: string;
    commit: string;
}

export function handleBuildInfo(version: string): IpcResult<BuildInfo> {
    return ok({
        version,
        branch: BUILD_INFO.branch,
        commit: BUILD_INFO.commit,
    });
}

export function registerBuildInfoIpc(getVersion: () => string): void {
    ipcMain.handle(IPC_CHANNELS.APP_BUILD_INFO, (e: IpcMainInvokeEvent) => {
        assert_valid_sender(e);
        return handleBuildInfo(getVersion());
    });
}
