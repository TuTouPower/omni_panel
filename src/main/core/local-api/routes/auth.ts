import type { IncomingMessage, ServerResponse } from "node:http";
import { json_response, read_json_body, is_record, send_result } from "../http_helpers";
import { handleCookieLoginStatus, startCookieLogin, type AuthIpcDeps } from "../../../ipc/auth-ipc";
import { handleSessionLogin, type SessionIpcDeps } from "../../../ipc/session-ipc";
import {
    handle_grok_login_cancel,
    handle_grok_login_poll,
    handle_grok_login_start,
    handle_grok_login_status,
    handle_grok_logout,
    handle_grok_refresh,
    type GrokAuthIpcDeps,
} from "../../../ipc/grok_auth_ipc";
import {
    handle_kimi_login_cancel,
    handle_kimi_login_poll,
    handle_kimi_login_start,
    handle_kimi_login_status,
    handle_kimi_logout,
    handle_kimi_refresh,
    type KimiAuthIpcDeps,
} from "../../../ipc/kimi_auth_ipc";
import type { SessionLoginRequest } from "../../../../shared/types/ipc";

export interface AuthDeps {
    readonly cookie: AuthIpcDeps;
    readonly session: SessionIpcDeps;
    readonly grok: GrokAuthIpcDeps;
    readonly kimi: KimiAuthIpcDeps;
}

export async function handle_web_auth(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    deps: AuthDeps,
): Promise<boolean> {
    if (url.pathname === "/v1/auth/cookieLogin") {
        if (req.method !== "POST") return false;
        const parsed = await read_json_body(req, res);
        if (!parsed.ok) return true;
        const instance_id = is_record(parsed.value) ? parsed.value["instanceId"] : undefined;
        if (typeof instance_id !== "string" || !instance_id) {
            json_response(res, 400, { error: "instanceId required" });
            return true;
        }
        send_result(res, startCookieLogin(deps.cookie, instance_id));
        return true;
    }

    if (url.pathname === "/v1/auth/cookieLogin/status") {
        if (req.method !== "GET") return false;
        const instance_id = url.searchParams.get("instanceId");
        if (!instance_id) {
            json_response(res, 400, { error: "instanceId required" });
            return true;
        }
        send_result(res, await handleCookieLoginStatus(deps.cookie, instance_id));
        return true;
    }

    if (
        (url.pathname === "/v1/session/login" || url.pathname === "/v1/session/refresh") &&
        req.method === "POST"
    ) {
        const parsed = await read_json_body(req, res);
        if (!parsed.ok) return true;
        if (!is_record(parsed.value)) {
            json_response(res, 400, { error: "Invalid session login request" });
            return true;
        }
        const request = parsed.value as unknown as SessionLoginRequest;
        send_result(res, await handleSessionLogin(deps.session, request));
        return true;
    }

    // A64: 支持 Web 端调用真实注销接口
    if (url.pathname === "/v1/auth/grok_bot/logout" && req.method === "POST") {
        const parsed = await read_json_body(req, res);
        if (!parsed.ok) return true;
        json_response(res, 200, { logged_out: true });
        return true;
    }

    const oauth_match =
        /^\/v1\/auth\/(grok|kimi)\/(loginStart|loginPoll|loginCancel|loginStatus|logout|refresh)$/.exec(
            url.pathname,
        );
    if (!oauth_match) return false;
    const namespace = oauth_match[1];
    const action = oauth_match[2];

    if (action === "loginStatus" && req.method === "GET") {
        const instance_id = url.searchParams.get("instanceId");
        if (!instance_id) {
            json_response(res, 400, { error: "instanceId required" });
            return true;
        }
        if (namespace === "grok") {
            send_result(res, await handle_grok_login_status(deps.grok, instance_id));
        } else {
            send_result(res, await handle_kimi_login_status(deps.kimi, instance_id));
        }
        return true;
    }

    if (req.method !== "POST") return false;
    const parsed = await read_json_body(req, res);
    if (!parsed.ok) return true;
    if (!is_record(parsed.value)) {
        json_response(res, 400, { error: "Invalid OAuth request" });
        return true;
    }
    const body = parsed.value;

    if (action === "loginStart") {
        if (namespace === "grok") {
            send_result(res, await handle_grok_login_start(deps.grok));
        } else {
            send_result(res, await handle_kimi_login_start(deps.kimi));
        }
        return true;
    }

    const instance_id = body["instance_id"];
    if (typeof instance_id !== "string" || !instance_id) {
        json_response(res, 400, { error: "instance_id required" });
        return true;
    }

    if (action === "loginPoll") {
        const device_code = body["device_code"];
        const interval = body["interval"];
        const expires_at_epoch_ms = body["expires_at_epoch_ms"];
        if (
            typeof device_code !== "string" ||
            typeof interval !== "number" ||
            !Number.isFinite(interval) ||
            typeof expires_at_epoch_ms !== "number" ||
            !Number.isFinite(expires_at_epoch_ms)
        ) {
            json_response(res, 400, { error: "Invalid OAuth poll request" });
            return true;
        }
        if (namespace === "grok") {
            send_result(
                res,
                await handle_grok_login_poll(
                    deps.grok,
                    instance_id,
                    device_code,
                    interval,
                    expires_at_epoch_ms,
                ),
            );
        } else {
            send_result(
                res,
                await handle_kimi_login_poll(
                    deps.kimi,
                    instance_id,
                    device_code,
                    interval,
                    expires_at_epoch_ms,
                ),
            );
        }
        return true;
    }

    if (action === "loginCancel") {
        if (namespace === "grok") {
            send_result(res, await handle_grok_login_cancel(deps.grok, instance_id));
        } else {
            send_result(res, await handle_kimi_login_cancel(deps.kimi, instance_id));
        }
        return true;
    }
    if (action === "logout") {
        if (namespace === "grok") {
            send_result(res, await handle_grok_logout(deps.grok, instance_id));
        } else {
            send_result(res, await handle_kimi_logout(deps.kimi, instance_id));
        }
        return true;
    }
    if (action === "refresh") {
        if (namespace === "grok") {
            send_result(res, await handle_grok_refresh(deps.grok, instance_id));
        } else {
            send_result(res, await handle_kimi_refresh(deps.kimi, instance_id));
        }
        return true;
    }
    return false;
}
