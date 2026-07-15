import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { IpcResult } from "./helpers";
import { ok, fail, assert_valid_sender } from "./helpers";
import { createLogger } from "../../shared/lib/logger";
import type {
    DeviceCodeStart,
    GrokOAuthManager,
    LoginStatus,
    OAuthLoginResult,
    RefreshResult,
} from "../core/auth/grok_oauth_manager";

const log = createLogger("ipc:grok-auth");

export interface GrokAuthIpcDeps {
    readonly manager: GrokOAuthManager;
}

export async function handle_grok_login_start(
    deps: GrokAuthIpcDeps,
): Promise<IpcResult<DeviceCodeStart>> {
    try {
        const result = await deps.manager.start_device_login();
        return ok(result);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`login_start failed: ${message}`);
        return fail("INTERNAL_ERROR", message);
    }
}

export async function handle_grok_login_poll(
    deps: GrokAuthIpcDeps,
    instance_id: string,
    device_code: string,
    interval: number,
    expires_at_epoch_ms: number,
): Promise<IpcResult<OAuthLoginResult>> {
    try {
        const result = await deps.manager.await_completion(
            device_code,
            interval,
            expires_at_epoch_ms,
            instance_id,
        );
        return ok(result);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`login_poll failed for ${instance_id}: ${message}`);
        return fail("OAUTH_ERROR", message);
    }
}

export async function handle_grok_login_status(
    deps: GrokAuthIpcDeps,
    instance_id: string,
): Promise<IpcResult<LoginStatus>> {
    try {
        const result = await deps.manager.get_login_status(instance_id);
        return ok(result);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`login_status failed for ${instance_id}: ${message}`);
        return fail("INTERNAL_ERROR", message);
    }
}

export async function handle_grok_logout(
    deps: GrokAuthIpcDeps,
    instance_id: string,
): Promise<IpcResult<{ logged_out: boolean }>> {
    try {
        await deps.manager.logout(instance_id);
        return ok({ logged_out: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`logout failed for ${instance_id}: ${message}`);
        return fail("INTERNAL_ERROR", message);
    }
}

export async function handle_grok_refresh(
    deps: GrokAuthIpcDeps,
    instance_id: string,
): Promise<IpcResult<RefreshResult>> {
    try {
        const result = await deps.manager.refresh_now(instance_id);
        return ok(result);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`refresh failed for ${instance_id}: ${message}`);
        return fail("INTERNAL_ERROR", message);
    }
}

export function registerGrokAuthIpc(deps: GrokAuthIpcDeps): void {
    ipcMain.handle(IPC_CHANNELS.GROK_LOGIN_START, (event) => {
        assert_valid_sender(event);
        return handle_grok_login_start(deps);
    });
    ipcMain.handle(
        IPC_CHANNELS.GROK_LOGIN_POLL,
        (
            event,
            instance_id: string,
            device_code: string,
            interval: number,
            expires_at_epoch_ms: number,
        ) => {
            assert_valid_sender(event);
            return handle_grok_login_poll(
                deps,
                instance_id,
                device_code,
                interval,
                expires_at_epoch_ms,
            );
        },
    );
    ipcMain.handle(IPC_CHANNELS.GROK_LOGIN_STATUS, (event, instance_id: string) => {
        assert_valid_sender(event);
        return handle_grok_login_status(deps, instance_id);
    });
    ipcMain.handle(IPC_CHANNELS.GROK_LOGOUT, (event, instance_id: string) => {
        assert_valid_sender(event);
        return handle_grok_logout(deps, instance_id);
    });
    ipcMain.handle(IPC_CHANNELS.GROK_REFRESH, (event, instance_id: string) => {
        assert_valid_sender(event);
        return handle_grok_refresh(deps, instance_id);
    });
    log.info("Grok OAuth IPC handlers registered");
}
