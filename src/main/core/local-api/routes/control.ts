import type { IncomingMessage, ServerResponse } from "node:http";
import type { LaunchAtLoginState } from "../../launch-at-login";
import type { PauseState } from "../../scheduler/scheduler-orchestrator";
import { json_response } from "../http_helpers";

export interface ControlState {
    readonly pause: PauseState;
    readonly autostart: LaunchAtLoginState;
}

export interface ControlDeps {
    readonly refresh_all: () => void;
    readonly pause: () => void;
    readonly resume: () => void;
    readonly restart: () => void;
    readonly quit: () => void;
    readonly autostart?: () => Promise<LaunchAtLoginState> | LaunchAtLoginState;
    readonly get_state?: () => Promise<ControlState> | ControlState;
}

export async function handle_web_control(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    deps: ControlDeps,
): Promise<boolean> {
    if (!url.pathname.startsWith("/v1/control/")) return false;
    if (url.pathname === "/v1/control/status" && req.method === "GET") {
        if (!deps.get_state) return false;
        json_response(res, 200, await deps.get_state());
        return true;
    }
    if (req.method !== "POST") {
        json_response(res, 405, { error: "Method not allowed" });
        return true;
    }
    switch (url.pathname) {
        case "/v1/control/refresh-all":
            deps.refresh_all();
            json_response(res, 200, { status: "ok" });
            return true;
        case "/v1/control/pause":
            deps.pause();
            json_response(res, 200, { status: "ok" });
            return true;
        case "/v1/control/resume":
            deps.resume();
            json_response(res, 200, { status: "ok" });
            return true;
        case "/v1/control/restart":
            json_response(res, 200, { status: "ok" });
            setImmediate(() => {
                deps.restart();
            });
            return true;
        case "/v1/control/quit":
            json_response(res, 200, { status: "ok" });
            setImmediate(() => {
                deps.quit();
            });
            return true;
        case "/v1/control/autostart":
            if (!deps.autostart) return false;
            json_response(res, 200, {
                status: "ok",
                autostart: await deps.autostart(),
            });
            return true;
        default:
            return false;
    }
}
