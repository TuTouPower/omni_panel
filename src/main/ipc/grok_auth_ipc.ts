import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { IpcResult } from "./helpers";
import { create_oauth_device_ipc, type OAuthDeviceIpcChannels } from "./oauth_device_ipc";
import type { GrokOAuthManager } from "../core/auth/grok_oauth_manager";
import type {
    DeviceCodeStart,
    OAuthLoginResult,
    LoginStatus,
    RefreshResult,
} from "../core/auth/oauth_helpers";

export interface GrokAuthIpcDeps {
    readonly manager: GrokOAuthManager;
}

const channels: OAuthDeviceIpcChannels = {
    login_start: IPC_CHANNELS.GROK_LOGIN_START,
    login_poll: IPC_CHANNELS.GROK_LOGIN_POLL,
    login_cancel: IPC_CHANNELS.GROK_LOGIN_CANCEL,
    login_status: IPC_CHANNELS.GROK_LOGIN_STATUS,
    logout: IPC_CHANNELS.GROK_LOGOUT,
    refresh: IPC_CHANNELS.GROK_REFRESH,
};

function ipc_for(deps: GrokAuthIpcDeps) {
    return create_oauth_device_ipc({ manager: deps.manager, channels, log_name: "ipc:grok-auth" });
}

export async function handle_grok_login_start(
    deps: GrokAuthIpcDeps,
): Promise<IpcResult<DeviceCodeStart>> {
    return ipc_for(deps).login_start();
}

export async function handle_grok_login_poll(
    deps: GrokAuthIpcDeps,
    instance_id: string,
    device_code: string,
    interval: number,
    expires_at_epoch_ms: number,
): Promise<IpcResult<OAuthLoginResult>> {
    return ipc_for(deps).login_poll(instance_id, device_code, interval, expires_at_epoch_ms);
}

export function handle_grok_login_cancel(
    deps: GrokAuthIpcDeps,
    instance_id: string,
): Promise<IpcResult<void>> {
    return ipc_for(deps).login_cancel(instance_id);
}

export async function handle_grok_login_status(
    deps: GrokAuthIpcDeps,
    instance_id: string,
): Promise<IpcResult<LoginStatus>> {
    return ipc_for(deps).login_status(instance_id);
}

export async function handle_grok_logout(
    deps: GrokAuthIpcDeps,
    instance_id: string,
): Promise<IpcResult<{ logged_out: boolean }>> {
    return ipc_for(deps).logout(instance_id);
}

export async function handle_grok_refresh(
    deps: GrokAuthIpcDeps,
    instance_id: string,
): Promise<IpcResult<RefreshResult>> {
    return ipc_for(deps).refresh(instance_id);
}

export function registerGrokAuthIpc(deps: GrokAuthIpcDeps): void {
    ipc_for(deps).register();
}
