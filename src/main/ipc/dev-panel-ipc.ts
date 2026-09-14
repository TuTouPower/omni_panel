import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { DevPanelConfiguration } from "../../shared/types/dev-panel";
import { devPanelConfigurationSchema } from "../core/config/types";
import type { DevPanelScanManager } from "../core/dev-panel/scan-manager";
import { assert_valid_sender, fail, ok, type IpcResult } from "./helpers";

export function registerDevPanelIpc(
    ipc: IpcMain,
    deps: { readonly manager: DevPanelScanManager; readonly open: () => void },
): void {
    ipc.handle(IPC_CHANNELS.DEV_PANEL_OPEN, (event: IpcMainInvokeEvent) => {
        assert_valid_sender(event);
        deps.open();
    });

    ipc.handle(
        IPC_CHANNELS.DEV_PANEL_SCAN,
        (
            event: IpcMainInvokeEvent,
            raw_configuration: unknown,
        ): IpcResult<ReturnType<DevPanelScanManager["start"]>> => {
            assert_valid_sender(event);
            const parsed = devPanelConfigurationSchema.safeParse(raw_configuration);
            if (!parsed.success) return fail("INVALID_ARGUMENT", "Invalid dev panel configuration");
            return ok(deps.manager.start(parsed.data as DevPanelConfiguration));
        },
    );

    ipc.handle(
        IPC_CHANNELS.DEV_PANEL_STATUS,
        (event: IpcMainInvokeEvent): IpcResult<ReturnType<DevPanelScanManager["get_status"]>> => {
            assert_valid_sender(event);
            return ok(deps.manager.get_status());
        },
    );

    ipc.handle(IPC_CHANNELS.DEV_PANEL_CANCEL, (event: IpcMainInvokeEvent): IpcResult<null> => {
        assert_valid_sender(event);
        deps.manager.cancel();
        return ok(null);
    });
}
