import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/types/ipc";
import { ok, fail, assert_valid_sender, type IpcResult } from "./helpers";
import { createLogger } from "../../shared/lib/logger";
import type {
    GrokBotOAuthManager,
    GrokBotPkceStart,
    GrokBotLoginResult,
    GrokBotRefreshResult,
} from "../core/auth/grok_bot_oauth_manager";

const log = createLogger("ipc:grok-bot-auth");

export interface GrokBotAuthIpcDeps {
    readonly manager: GrokBotOAuthManager;
}

export async function handle_grok_bot_login_start(
    deps: GrokBotAuthIpcDeps,
): Promise<IpcResult<GrokBotPkceStart>> {
    try {
        const result = await deps.manager.start_login();
        return ok(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error(`login_start failed: ${message}`);
        const code = message.includes("BROWSER_OPEN_FAILED")
            ? "BROWSER_OPEN_FAILED"
            : "INTERNAL_ERROR";
        return fail(code, message);
    }
}

export async function handle_grok_bot_login_poll(
    deps: GrokBotAuthIpcDeps,
    instance_id: string,
    uuid: string,
    verifier: string,
    timeout_ms?: number,
): Promise<IpcResult<GrokBotLoginResult>> {
    try {
        const result = await deps.manager.await_completion(instance_id, uuid, verifier, timeout_ms);
        return ok(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error(`login_poll failed for ${instance_id}: ${message}`);
        const code = message.includes("CONFLICT") ? "CONFLICT" : "OAUTH_ERROR";
        return fail(code, message);
    }
}

export function handle_grok_bot_login_cancel(
    deps: GrokBotAuthIpcDeps,
    instance_id: string,
): IpcResult<void> {
    if (!instance_id || instance_id.trim() === "") {
        return fail("INVALID_ARGUMENT", "instance_id is required");
    }
    try {
        deps.manager.cancel_login(instance_id.trim());
        return ok(undefined);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return fail("INTERNAL_ERROR", message);
    }
}

export async function handle_grok_bot_logout(
    deps: GrokBotAuthIpcDeps,
    instance_id: string,
): Promise<IpcResult<{ logged_out: boolean }>> {
    if (!instance_id || instance_id.trim() === "") {
        return fail("INVALID_ARGUMENT", "instance_id is required");
    }
    try {
        await deps.manager.logout(instance_id.trim());
        return ok({ logged_out: true });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return fail("INTERNAL_ERROR", message);
    }
}

export async function handle_grok_bot_refresh(
    deps: GrokBotAuthIpcDeps,
    instance_id: string,
): Promise<IpcResult<GrokBotRefreshResult>> {
    try {
        const result = await deps.manager.refresh_now(instance_id);
        return ok(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return fail("INTERNAL_ERROR", message);
    }
}

export function registerGrokBotAuthIpc(deps: GrokBotAuthIpcDeps): void {
    ipcMain.handle(IPC_CHANNELS.GROK_BOT_LOGIN_START, async (event) => {
        assert_valid_sender(event);
        return handle_grok_bot_login_start(deps);
    });

    ipcMain.handle(
        IPC_CHANNELS.GROK_BOT_LOGIN_POLL,
        async (
            event,
            instance_id: unknown,
            uuid: unknown,
            verifier: unknown,
            timeout_ms: unknown,
        ) => {
            assert_valid_sender(event);
            if (typeof instance_id !== "string" || !instance_id.trim()) {
                return fail("INVALID_ARGUMENT", "instance_id must be a non-empty string");
            }
            if (typeof uuid !== "string" || !uuid.trim()) {
                return fail("INVALID_ARGUMENT", "uuid must be a non-empty string");
            }
            if (typeof verifier !== "string" || !verifier.trim()) {
                return fail("INVALID_ARGUMENT", "verifier must be a non-empty string");
            }
            let parsed_timeout: number | undefined;
            if (timeout_ms !== undefined) {
                if (
                    typeof timeout_ms !== "number" ||
                    !Number.isFinite(timeout_ms) ||
                    timeout_ms < 10_000 ||
                    timeout_ms > 600_000
                ) {
                    return fail(
                        "INVALID_ARGUMENT",
                        "timeout_ms must be a finite number between 10000 and 600000",
                    );
                }
                parsed_timeout = timeout_ms;
            }
            return handle_grok_bot_login_poll(deps, instance_id, uuid, verifier, parsed_timeout);
        },
    );

    ipcMain.handle(IPC_CHANNELS.GROK_BOT_LOGIN_CANCEL, (event, instance_id: unknown) => {
        assert_valid_sender(event);
        if (typeof instance_id !== "string" || !instance_id.trim()) {
            return fail("INVALID_ARGUMENT", "instance_id must be a non-empty string");
        }
        return handle_grok_bot_login_cancel(deps, instance_id);
    });

    ipcMain.handle(IPC_CHANNELS.GROK_BOT_LOGOUT, async (event, instance_id: unknown) => {
        assert_valid_sender(event);
        if (typeof instance_id !== "string" || !instance_id.trim()) {
            return fail("INVALID_ARGUMENT", "instance_id must be a non-empty string");
        }
        return handle_grok_bot_logout(deps, instance_id);
    });

    ipcMain.handle(IPC_CHANNELS.GROK_BOT_REFRESH, async (event, instance_id: unknown) => {
        assert_valid_sender(event);
        if (typeof instance_id !== "string" || !instance_id.trim()) {
            return fail("INVALID_ARGUMENT", "instance_id must be a non-empty string");
        }
        return handle_grok_bot_refresh(deps, instance_id);
    });
}
