import { ipcMain } from "electron";
import type { IpcResult } from "./helpers";
import { ok, fail, assert_valid_sender } from "./helpers";
import { createLogger } from "../../shared/lib/logger";
import type {
    DeviceCodeStart,
    OAuthLoginResult,
    LoginStatus,
    RefreshResult,
} from "../core/auth/oauth_helpers";
import type { DeviceCodeOAuthManager } from "../core/auth/device_code_oauth_manager";

/**
 * 参数化 device-code OAuth IPC 注册器（t339）：grok/kimi 的公共实现。
 * 差异收敛到 `OAuthDeviceIpcChannels`（channel 名）与 log_name。
 */

export interface OAuthDeviceIpcChannels {
    readonly login_start: string;
    readonly login_poll: string;
    readonly login_cancel: string;
    readonly login_status: string;
    readonly logout: string;
    readonly refresh: string;
}

export interface OAuthDeviceIpcDeps {
    readonly manager: DeviceCodeOAuthManager;
    readonly channels: OAuthDeviceIpcChannels;
    readonly log_name: string;
}

export function create_oauth_device_ipc(deps: OAuthDeviceIpcDeps) {
    const log = createLogger(deps.log_name);

    async function login_start(): Promise<IpcResult<DeviceCodeStart>> {
        try {
            const result = await deps.manager.start_device_login();
            return ok(result);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log.error(`login_start failed`);
            return fail("INTERNAL_ERROR", message);
        }
    }

    async function login_poll(
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
            log.error(`login_poll failed for ${instance_id}`);
            return fail("OAUTH_ERROR", message);
        }
    }

    function login_cancel(instance_id: string): Promise<IpcResult<void>> {
        try {
            deps.manager.cancel_device_login(instance_id);
            return Promise.resolve(ok(undefined));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log.error(`login_cancel failed for ${instance_id}`);
            return Promise.resolve(fail("INTERNAL_ERROR", message));
        }
    }

    async function login_status(instance_id: string): Promise<IpcResult<LoginStatus>> {
        try {
            const result = await deps.manager.get_login_status(instance_id);
            return ok(result);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log.error(`login_status failed for ${instance_id}`);
            return fail("INTERNAL_ERROR", message);
        }
    }

    async function logout(instance_id: string): Promise<IpcResult<{ logged_out: boolean }>> {
        try {
            await deps.manager.logout(instance_id);
            return ok({ logged_out: true });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log.error(`logout failed for ${instance_id}`);
            return fail("INTERNAL_ERROR", message);
        }
    }

    async function refresh(instance_id: string): Promise<IpcResult<RefreshResult>> {
        try {
            const result = await deps.manager.refresh_now(instance_id);
            return ok(result);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log.error(`refresh failed for ${instance_id}`);
            return fail("INTERNAL_ERROR", message);
        }
    }

    function register(): void {
        ipcMain.handle(deps.channels.login_start, (event) => {
            assert_valid_sender(event);
            return login_start();
        });
        ipcMain.handle(
            deps.channels.login_poll,
            (
                event,
                instance_id: string,
                device_code: string,
                interval: number,
                expires_at_epoch_ms: number,
            ) => {
                assert_valid_sender(event);
                return login_poll(instance_id, device_code, interval, expires_at_epoch_ms);
            },
        );
        ipcMain.handle(deps.channels.login_cancel, (event, instance_id: string) => {
            assert_valid_sender(event);
            return login_cancel(instance_id);
        });
        ipcMain.handle(deps.channels.login_status, (event, instance_id: string) => {
            assert_valid_sender(event);
            return login_status(instance_id);
        });
        ipcMain.handle(deps.channels.logout, (event, instance_id: string) => {
            assert_valid_sender(event);
            return logout(instance_id);
        });
        ipcMain.handle(deps.channels.refresh, (event, instance_id: string) => {
            assert_valid_sender(event);
            return refresh(instance_id);
        });
        log.info("OAuth IPC handlers registered");
    }

    return { login_start, login_poll, login_cancel, login_status, logout, refresh, register };
}
