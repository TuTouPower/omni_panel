import type { IpcMainInvokeEvent } from "electron";
import type { IpcResult, ConnectorSnapshotDTO } from "../../shared/types/ipc";
import type { ConnectorSnapshotState } from "../core/scheduler/types";

export type { IpcResult };

export function ok<T>(data: T): IpcResult<T> {
    return { ok: true, data };
}

export function fail(code: string, message: string): IpcResult<never> {
    return { ok: false, error: { code, message } };
}

export function assert_valid_sender(event: IpcMainInvokeEvent): void {
    const url = event.senderFrame?.url ?? "";
    if (!url || url === "about:blank") {
        throw new Error("IPC not allowed from unknown origin");
    }
    // Allow the app's own packaged pages (file://) and, when running under
    // electron-vite dev, the dev server. Do NOT gate on NODE_ENV — it is not
    // reliably set in packaged Electron builds, so the production check could
    // silently no-op and let any origin invoke privileged IPC.
    if (url.startsWith("file://")) {
        // I15: 仅允许打包 renderer index.html 入口，拒绝其他 file:// HTML
        // （如被 XSS 导航进入 renderer 的恶意页）。
        try {
            const u = new URL(url);
            if (!u.pathname.endsWith("index.html")) {
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
        // I15: origin 比对，防 `localhost:5173evil.com` 前缀绕过。
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
