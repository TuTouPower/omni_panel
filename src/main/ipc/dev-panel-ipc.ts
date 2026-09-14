import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { DevPanelConfiguration } from "../../shared/types/dev-panel";
import {
    devPanelModelRoutingSaveRequestSchema,
    devPanelModelRoutingTestRequestSchema,
} from "../../shared/schemas/dev-panel-model-routing";
import type {
    DevPanelModelRoutingSaveRequest,
    DevPanelModelRoutingTestRequest,
} from "../../shared/types/dev-panel-model-routing";
import { devPanelConfigurationSchema } from "../core/config/types";
import type { DevPanelModelRoutingManager } from "../core/dev-panel/model-routing";
import type { DevPanelScanManager } from "../core/dev-panel/scan-manager";
import { assert_valid_sender, fail, ok, type IpcResult } from "./helpers";

export function registerDevPanelIpc(
    ipc: IpcMain,
    deps: {
        readonly manager: DevPanelScanManager;
        readonly model_routing: DevPanelModelRoutingManager;
        readonly open: () => void;
    },
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

    ipc.handle(IPC_CHANNELS.DEV_PANEL_MODEL_ROUTING_CONFIG, async (event: IpcMainInvokeEvent) => {
        assert_valid_sender(event);
        return ok(await deps.model_routing.get_config());
    });

    ipc.handle(IPC_CHANNELS.DEV_PANEL_MODEL_ROUTING_CHANNELS, async (event: IpcMainInvokeEvent) => {
        assert_valid_sender(event);
        return ok(await deps.model_routing.get_channels());
    });

    ipc.handle(
        IPC_CHANNELS.DEV_PANEL_MODEL_ROUTING_SAVE,
        async (event: IpcMainInvokeEvent, raw_request: unknown) => {
            assert_valid_sender(event);
            const parsed = devPanelModelRoutingSaveRequestSchema.safeParse(raw_request);
            if (!parsed.success) return fail("INVALID_ARGUMENT", "模型路由保存请求无效");
            return ok(
                await deps.model_routing.save(parsed.data as DevPanelModelRoutingSaveRequest),
            );
        },
    );

    ipc.handle(
        IPC_CHANNELS.DEV_PANEL_MODEL_ROUTING_TEST,
        async (event: IpcMainInvokeEvent, raw_request: unknown) => {
            assert_valid_sender(event);
            const parsed = devPanelModelRoutingTestRequestSchema.safeParse(raw_request);
            if (!parsed.success) return fail("INVALID_ARGUMENT", "模型自检请求无效");
            return ok(
                await deps.model_routing.test(parsed.data as DevPanelModelRoutingTestRequest),
            );
        },
    );

    ipc.handle(IPC_CHANNELS.DEV_PANEL_MODEL_ROUTING_SNAPSHOT, async (event: IpcMainInvokeEvent) => {
        assert_valid_sender(event);
        return ok(await deps.model_routing.get_snapshot_info());
    });
}
