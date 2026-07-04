import type { IpcMainInvokeEvent } from "electron";
import type { IpcResult, PluginSnapshotDTO } from "../../shared/types/ipc";
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
    if (url.startsWith("file://")) return;
    const dev_url = process.env["ELECTRON_RENDERER_URL"];
    if (dev_url && url.startsWith(dev_url)) return;
    throw new Error(`Invalid sender protocol: ${url}`);
}

export function toDTO(state: ConnectorSnapshotState): PluginSnapshotDTO {
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
