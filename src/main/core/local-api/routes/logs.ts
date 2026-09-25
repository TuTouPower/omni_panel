import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { get_logs_dir } from "../../paths";
import { get_local_date_string } from "../../../../shared/lib/local-time";
import { handleRendererLog } from "../../../ipc/log-ipc";
import { json_response, read_json_body, send_result } from "../http_helpers";

export function handle_logs_export(res: ServerResponse, user_data_path: string | undefined): void {
    if (!user_data_path) {
        json_response(res, 503, { error: "logs export unavailable" });
        return;
    }
    const log_dir = get_logs_dir(user_data_path);
    const date = get_local_date_string();
    const log_file = path.join(log_dir, `app-${date}.log`);
    const download_name = `omni-panel-log-${date}.log`;
    fs.stat(log_file, (stat_err, s) => {
        if (stat_err || !s.isFile()) {
            json_response(res, 404, {
                error: "日志文件不存在",
                code: "LOG_NOT_FOUND",
            });
            return;
        }
        res.writeHead(200, {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": `attachment; filename="${download_name}"`,
        });
        const stream = fs.createReadStream(log_file);
        stream.on("error", () => {
            res.destroy();
        });
        stream.pipe(res);
    });
}

export async function handle_renderer_log(
    req: IncomingMessage,
    res: ServerResponse,
): Promise<void> {
    const parsed = await read_json_body(req, res);
    if (!parsed.ok) return;
    send_result(res, handleRendererLog(parsed.value));
}
