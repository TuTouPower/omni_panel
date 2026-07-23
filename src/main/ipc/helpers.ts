import type { IpcMainInvokeEvent } from "electron";
import { pathToFileURL } from "node:url";
import type { IpcResult, ConnectorSnapshotDTO } from "../../shared/types/ipc";
import type { ConnectorSnapshotState } from "../core/scheduler/types";

export type { IpcResult };

export function ok<T>(data: T): IpcResult<T> {
    return { ok: true, data };
}

export function fail(code: string, message: string): IpcResult<never> {
    return { ok: false, error: { code, message } };
}

/** t067: 主进程启动时设置，file:// sender 精确比对 rendererIndexPath。 */
let renderer_index_pathname: string | null = null;

export function set_renderer_index_path(abs_path: string): void {
    if (!abs_path) {
        renderer_index_pathname = null;
        return;
    }
    try {
        renderer_index_pathname = pathToFileURL(abs_path).pathname;
    } catch {
        renderer_index_pathname = null;
    }
}

export function assert_valid_sender(event: IpcMainInvokeEvent): void {
    const url = event.senderFrame?.url ?? "";
    if (!url || url === "about:blank") {
        throw new Error("IPC not allowed from unknown origin");
    }
    if (url.startsWith("file://")) {
        try {
            const u = new URL(url);
            if (renderer_index_pathname) {
                // t067: 精确比对 rendererIndexPath pathname（非 endsWith index.html）。
                if (u.pathname !== renderer_index_pathname) {
                    throw new Error(`Invalid file:// sender path: ${u.pathname}`);
                }
            } else if (!u.pathname.endsWith("index.html")) {
                // fallback（未初始化或测试环境）：endsWith 增量防御。
                throw new Error(`Invalid file:// sender path: ${u.pathname}`);
            }
        } catch (err) {
            throw err instanceof Error && err.message.startsWith("Invalid file://")
                ? err
                : new Error(`Invalid file:// sender URL: ${url}`);
        }
        return;
    }
    const dev_url = process.env["ELECTRON_RENDERER_URL"];
    if (dev_url) {
        try {
            if (new URL(dev_url).origin === new URL(url).origin) return;
        } catch {
            // fall through to reject
        }
    }
    throw new Error(`Invalid sender protocol: ${url}`);
}

/**
 * I14: 校验 IPC 调用来自 setting route（CONFIG_GET_SECRETS 等敏感通道）。
 * renderer URL `file://...index.html?...#setting`；web 同 `#setting`。
 */
export function assert_setting_route(event: IpcMainInvokeEvent): void {
    const url = event.senderFrame?.url ?? "";
    let hash = "";
    try {
        hash = new URL(url).hash;
    } catch {
        // 空 hash 走拒绝分支
    }
    if (hash !== "#setting") {
        throw new Error(`IPC only allowed from setting route, got hash=${hash || "(none)"}`);
    }
}

export function state_to_snapshot_dto(state: ConnectorSnapshotState): ConnectorSnapshotDTO {
    switch (state.status) {
        case "idle":
            return { status: "idle" };
        case "loading":
            return {
                status: "loading",
                ...(state.lastSuccess !== undefined && {
                    updatedAt: state.lastSuccess.updatedAt,
                    items: state.lastSuccess.items,
                    ...(state.lastSuccess.badge !== undefined && {
                        badge: state.lastSuccess.badge,
                    }),
                    ...(state.lastSuccess.chart !== undefined && {
                        chart: state.lastSuccess.chart,
                    }),
                }),
            };
        case "ready":
            return {
                status: "ready",
                items: state.items,
                updatedAt: state.updatedAt.toISOString(),
                ...(state.badge !== undefined && { badge: state.badge }),
                ...(state.chart !== undefined && { chart: state.chart }),
            };
        case "failed":
            return {
                status: "failed",
                error: state.error,
                ...(state.lastSuccess !== undefined && {
                    updatedAt: state.lastSuccess.updatedAt,
                    items: state.lastSuccess.items,
                    ...(state.lastSuccess.badge !== undefined && {
                        badge: state.lastSuccess.badge,
                    }),
                    ...(state.lastSuccess.chart !== undefined && {
                        chart: state.lastSuccess.chart,
                    }),
                }),
            };
    }
}
