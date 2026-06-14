import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { SessionLoginRequest, SessionLoginResult, IpcResult } from "../../shared/types/ipc";
import { ok, fail, assert_valid_sender } from "./helpers";
import type { SessionManager } from "../core/session/session-manager";
import { createLogger } from "../../shared/lib/logger";
import { createLoggedIpcHandler } from "./logged";

export interface SessionIpcDeps {
    sessionManager: SessionManager;
}

export async function handleSessionLogin(
    deps: SessionIpcDeps,
    request: SessionLoginRequest,
): Promise<IpcResult<SessionLoginResult>> {
    if (!request.instance_id) return fail("VALIDATION_ERROR", "缺少 instance_id");
    if (!request.login_url) return fail("VALIDATION_ERROR", "缺少 login_url");
    if (!request.cookie_names.length) return fail("VALIDATION_ERROR", "缺少 cookie_names");
    try {
        const parsed = new URL(request.login_url);
        if (parsed.protocol !== "https:") {
            return fail("VALIDATION_ERROR", "login_url 必须使用 HTTPS 协议");
        }
    } catch {
        return fail("VALIDATION_ERROR", "login_url 格式无效");
    }

    try {
        const result = await deps.sessionManager.start_login({
            instance_id: request.instance_id,
            login_url: request.login_url,
            cookie_names: request.cookie_names,
        });
        return ok(result);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("already in progress")) {
            return fail("CONFLICT", message);
        }
        if (message.includes("timed out")) {
            return fail("TIMEOUT", message);
        }
        return fail("INTERNAL_ERROR", message);
    }
}

export async function registerSessionIpc(deps: SessionIpcDeps): Promise<void> {
    const { ipcMain } = await import("electron");
    const log = createLogger("ipc:session");
    const logged = createLoggedIpcHandler(log);

    ipcMain.handle(IPC_CHANNELS.SESSION_LOGIN, (e, request: SessionLoginRequest) =>
        logged(IPC_CHANNELS.SESSION_LOGIN, [request.instance_id], () => {
            assert_valid_sender(e);
            log.info(`Session login requested for ${request.instance_id}`);
            return handleSessionLogin(deps, request);
        }),
    );

    ipcMain.handle(IPC_CHANNELS.SESSION_REFRESH, (e, request: SessionLoginRequest) =>
        logged(IPC_CHANNELS.SESSION_REFRESH, [request.instance_id], () => {
            assert_valid_sender(e);
            log.info(`Session refresh requested for ${request.instance_id}`);
            return handleSessionLogin(deps, request);
        }),
    );
}
