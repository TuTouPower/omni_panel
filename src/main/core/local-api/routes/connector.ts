import type { IncomingMessage, ServerResponse } from "node:http";
import type { ConnectorIpcDeps } from "../../../ipc/connector-ipc";
import {
    handleConnectorCatalog,
    handleConnectorGetState,
    handleConnectorList,
    handleConnectorRefresh,
    handleConnectorRefreshAll,
    handleConnectorSnapshot,
} from "../../../ipc/connector-ipc";
import type { IpcResult } from "../../../ipc/helpers";
import { send_result } from "../http_helpers";

export async function handle_web_connector(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    deps: ConnectorIpcDeps,
): Promise<boolean> {
    if (url.pathname === "/v1/connectors") {
        if (req.method === "GET") {
            send_result(res, await handleConnectorList(deps));
            return true;
        }
        if (req.method === "POST") {
            send_result(res, handleConnectorRefreshAll(deps));
            return true;
        }
        return false;
    }
    if (url.pathname === "/v1/catalog") {
        if (req.method === "GET") {
            send_result(res, handleConnectorCatalog(deps));
            return true;
        }
        return false;
    }
    if (url.pathname === "/v1/connectors/snapshot" && req.method === "GET") {
        send_result(res, handleConnectorSnapshot(deps));
        return true;
    }
    const match = /^\/v1\/connectors\/([^/]+)\/(state|refresh)$/.exec(url.pathname);
    if (match) {
        const instance_id = decodeURIComponent(match[1] ?? "");
        const action = match[2];
        if (action === "state" && req.method === "GET") {
            let result: IpcResult<unknown>;
            try {
                result = handleConnectorGetState(deps, instance_id);
            } catch (err: unknown) {
                result = {
                    ok: false,
                    error: { code: "INTERNAL_ERROR", message: String(err) },
                };
            }
            send_result(res, result);
            return true;
        }
        if (action === "refresh" && req.method === "POST") {
            send_result(res, await handleConnectorRefresh(deps, instance_id));
            return true;
        }
    }
    return false;
}
