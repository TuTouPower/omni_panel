import type { IncomingMessage, ServerResponse } from "node:http";
import type { ConfigIpcDeps } from "../../../ipc/config-ipc";
import {
    handleConfigCreateInstance,
    handleConfigDuplicate,
    handleConfigExportData,
    handleConfigGet,
    handleConfigGetSecrets,
    handleConfigImportData,
    handleConfigSave,
    handleConfigSaveSecrets,
} from "../../../ipc/config-ipc";
import { json_response, read_json_body, is_record, send_result } from "../http_helpers";

export async function handle_web_config(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    deps: ConfigIpcDeps,
): Promise<boolean> {
    if (url.pathname === "/v1/config/duplicate" && req.method === "POST") {
        const parsed = await read_json_body(req, res);
        if (!parsed.ok) return true;
        const instance_id = is_record(parsed.value) ? parsed.value["instanceId"] : undefined;
        send_result(res, await handleConfigDuplicate(deps, instance_id));
        return true;
    }
    if (url.pathname === "/v1/config/createInstance" && req.method === "POST") {
        const parsed = await read_json_body(req, res);
        if (!parsed.ok) return true;
        const manifest_id = is_record(parsed.value) ? parsed.value["manifestId"] : undefined;
        send_result(res, await handleConfigCreateInstance(deps, manifest_id));
        return true;
    }
    if (url.pathname === "/v1/config/export" && req.method === "GET") {
        send_result(
            res,
            await handleConfigExportData(deps, {
                includeSecrets: url.searchParams.get("includeSecrets") === "true",
            }),
        );
        return true;
    }
    if (url.pathname === "/v1/config/import" && req.method === "POST") {
        const parsed = await read_json_body(req, res);
        if (!parsed.ok) return true;
        send_result(res, await handleConfigImportData(deps, parsed.value));
        return true;
    }
    if (url.pathname === "/v1/config") {
        if (req.method === "GET") {
            send_result(res, await handleConfigGet(deps));
            return true;
        }
        if (req.method === "POST") {
            const parsed = await read_json_body(req, res);
            if (!parsed.ok) return true;
            send_result(res, await handleConfigSave(deps, parsed.value));
            return true;
        }
        return false;
    }
    if (url.pathname === "/v1/secrets") {
        if (req.method === "GET") {
            const instance_id = url.searchParams.get("instanceId");
            if (!instance_id) {
                json_response(res, 400, { error: "instanceId required" });
                return true;
            }
            send_result(res, await handleConfigGetSecrets(deps, { instanceId: instance_id }));
            return true;
        }
        if (req.method === "POST") {
            const parsed = await read_json_body(req, res);
            if (!parsed.ok) return true;
            send_result(res, await handleConfigSaveSecrets(deps, parsed.value));
            return true;
        }
        return false;
    }
    return false;
}
