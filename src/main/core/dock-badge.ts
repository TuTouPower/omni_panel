import { app } from "electron";

export interface ClearDockBadgeDeps {
    readonly platform?: NodeJS.Platform;
    readonly dock?: { setBadge: (text: string) => void } | undefined;
    readonly setBadgeCount?: (count: number) => boolean | Promise<boolean>;
}

/**
 * t488: 在 macOS 宿主下清除 Dock 历史通知角标与未读计数。
 * 当应用激活（app.on("activate")）、窗口展示或获得焦点时调用。
 * 非 macOS 平台（Windows / Linux）静默跳过，不调用不存在的平台 API。
 */
export function clear_dock_badge(deps?: ClearDockBadgeDeps): void {
    const platform = deps?.platform ?? process.platform;
    if (platform !== "darwin") {
        return;
    }

    const dock = deps?.dock ?? (typeof app !== "undefined" ? app.dock : undefined);
    if (dock && typeof dock.setBadge === "function") {
        try {
            dock.setBadge("");
        } catch {
            // Ignore errors if dock service is unavailable or detached
        }
    }

    const setBadgeCount =
        deps?.setBadgeCount ??
        (typeof app !== "undefined" && typeof app.setBadgeCount === "function"
            ? app.setBadgeCount.bind(app)
            : undefined);
    if (typeof setBadgeCount === "function") {
        try {
            void setBadgeCount(0);
        } catch {
            // Ignore errors
        }
    }
}
