import type { IncomingMessage, ServerResponse } from "node:http";
import type { DevPanelScanManager } from "../../dev-panel/scan-manager";
import type { DevPanelModelRoutingManager } from "../../dev-panel/model-routing";
import { devPanelConfigurationSchema } from "../../config/types";
import {
    devPanelModelRoutingSaveRequestSchema,
    devPanelModelRoutingTestRequestSchema,
} from "../../../../shared/schemas/dev-panel-model-routing";
import { json_response, read_json_body } from "../http_helpers";

export interface DevPanelDeps {
    readonly manager: DevPanelScanManager;
    readonly model_routing: DevPanelModelRoutingManager;
}

export async function handle_web_dev_panel(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    deps: DevPanelDeps,
): Promise<boolean> {
    if (url.pathname === "/v1/devPanel/status" && req.method === "GET") {
        json_response(res, 200, deps.manager.get_status());
        return true;
    }
    if (url.pathname === "/v1/devPanel/scan" && req.method === "POST") {
        const body = await read_json_body(req, res);
        if (!body.ok) return true;
        const parsed = devPanelConfigurationSchema.safeParse(body.value);
        if (!parsed.success) {
            json_response(res, 400, { error: "Invalid dev panel configuration" });
            return true;
        }
        json_response(res, 200, deps.manager.start(parsed.data));
        return true;
    }
    if (url.pathname === "/v1/devPanel/cancel" && req.method === "POST") {
        deps.manager.cancel();
        json_response(res, 200, null);
        return true;
    }
    if (url.pathname === "/v1/devPanel/modelRouting/config" && req.method === "GET") {
        try {
            json_response(res, 200, await deps.model_routing.get_config());
        } catch (error: unknown) {
            json_response(res, 502, {
                error: error instanceof Error ? error.message : "读取模型路由配置失败",
            });
        }
        return true;
    }
    if (url.pathname === "/v1/devPanel/modelRouting/channels" && req.method === "GET") {
        try {
            json_response(res, 200, await deps.model_routing.get_channels());
        } catch (error: unknown) {
            json_response(res, 502, {
                error: error instanceof Error ? error.message : "读取渠道列表失败",
            });
        }
        return true;
    }
    if (url.pathname === "/v1/devPanel/modelRouting/save" && req.method === "POST") {
        const body = await read_json_body(req, res);
        if (!body.ok) return true;
        const parsed = devPanelModelRoutingSaveRequestSchema.safeParse(body.value);
        if (!parsed.success) {
            json_response(res, 400, { error: "模型路由保存请求无效或未确认" });
            return true;
        }
        try {
            json_response(res, 200, await deps.model_routing.save(parsed.data));
        } catch (error: unknown) {
            json_response(res, 502, {
                error: error instanceof Error ? error.message : "保存模型路由失败",
            });
        }
        return true;
    }
    if (url.pathname === "/v1/devPanel/modelRouting/test" && req.method === "POST") {
        const body = await read_json_body(req, res);
        if (!body.ok) return true;
        const parsed = devPanelModelRoutingTestRequestSchema.safeParse(body.value);
        if (!parsed.success) {
            json_response(res, 400, { error: "模型自检请求无效" });
            return true;
        }
        try {
            json_response(res, 200, await deps.model_routing.test(parsed.data));
        } catch (error: unknown) {
            json_response(res, 502, {
                error: error instanceof Error ? error.message : "模型自检失败",
            });
        }
        return true;
    }
    if (url.pathname === "/v1/devPanel/modelRouting/snapshot" && req.method === "GET") {
        json_response(res, 200, await deps.model_routing.get_snapshot_info());
        return true;
    }
    return false;
}
