import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { PythonStatus } from "../../shared/types/ipc";
import type { IpcResult } from "./helpers";
import { ok } from "./helpers";

export interface SystemIpcDeps {
    pythonStatus: PythonStatus;
}

export function handlePythonStatus(deps: SystemIpcDeps): IpcResult<PythonStatus> {
    return ok(deps.pythonStatus);
}

export async function registerSystemIpc(deps: SystemIpcDeps): Promise<void> {
    const { ipcMain } = await import("electron");
    ipcMain.handle(IPC_CHANNELS.SYSTEM_PYTHON_STATUS, () => handlePythonStatus(deps));
}
