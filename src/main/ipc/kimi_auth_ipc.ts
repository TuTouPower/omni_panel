import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { IpcResult } from "./helpers";
import { create_oauth_device_ipc, type OAuthDeviceIpcChannels } from "./oauth_device_ipc";
import type { KimiOAuthManager } from "../core/auth/kimi_oauth_manager";
import type {
    DeviceCodeStart,
    OAuthLoginResult,
    LoginStatus,
    RefreshResult,
} from "../core/auth/oauth_helpers";

export interface KimiAuthIpcDeps {
    readonly manager: KimiOAuthManager;
}

const channels: OAuthDeviceIpcChannels = {
    login_start: IPC_CHANNELS.KIMI_LOGIN_START,
    login_poll: IPC_CHANNELS.KIMI_LOGIN_POLL,
    login_cancel: IPC_CHANNELS.KIMI_LOGIN_CANCEL,
    login_status: IPC_CHANNELS.KIMI_LOGIN_STATUS,
    logout: IPC_CHANNELS.KIMI_LOGOUT,
    refresh: IPC_CHANNELS.KIMI_REFRESH,
};

function ipc_for(deps: KimiAuthIpcDeps) {
    return create_oauth_device_ipc({ manager: deps.manager, channels, log_name: "ipc:kimi-auth" });
}

export async function handle_kimi_login_start(
    deps: KimiAuthIpcDeps,
): Promise<IpcResult<DeviceCodeStart>> {
    return ipc_for(deps).login_start();
}

export async function handle_kimi_login_poll(
    deps: KimiAuthIpcDeps,
    instance_id: string,
    device_code: string,
    interval: number,
    expires_at_epoch_ms: number,
): Promise<IpcResult<OAuthLoginResult>> {
    return ipc_for(deps).login_poll(instance_id, device_code, interval, expires_at_epoch_ms);
}

export function handle_kimi_login_cancel(
    deps: KimiAuthIpcDeps,
    instance_id: string,
): Promise<IpcResult<void>> {
    return ipc_for(deps).login_cancel(instance_id);
}

export async function handle_kimi_login_status(
    deps: KimiAuthIpcDeps,
    instance_id: string,
): Promise<IpcResult<LoginStatus>> {
    return ipc_for(deps).login_status(instance_id);
}

export async function handle_kimi_logout(
    deps: KimiAuthIpcDeps,
    instance_id: string,
): Promise<IpcResult<{ logged_out: boolean }>> {
    return ipc_for(deps).logout(instance_id);
}

export async function handle_kimi_refresh(
    deps: KimiAuthIpcDeps,
    instance_id: string,
): Promise<IpcResult<RefreshResult>> {
    return ipc_for(deps).refresh(instance_id);
}

export function registerKimiAuthIpc(deps: KimiAuthIpcDeps): void {
    ipc_for(deps).register();
}
