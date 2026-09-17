import { app } from "electron";

export interface DockVisibilityDeps {
    readonly platform?: NodeJS.Platform;
    readonly dock?: { hide: () => void; show: () => void } | undefined;
}

/**
 * p254: 按配置显隐 macOS Dock 图标（仅保留菜单栏图标）。
 * 即时生效，无需重启；隐藏后设置/面板入口走托盘菜单。
 * 非 macOS 平台静默跳过（任务栏行为另议，不在本条范围）。
 */
export function apply_dock_visibility(hide: boolean, deps?: DockVisibilityDeps): void {
    const platform = deps?.platform ?? process.platform;
    if (platform !== "darwin") {
        return;
    }

    const dock = deps?.dock ?? (typeof app !== "undefined" ? app.dock : undefined);
    if (!dock) {
        return;
    }
    try {
        if (hide) {
            dock.hide();
        } else {
            dock.show();
        }
    } catch {
        // Ignore errors if dock service is unavailable or detached
    }
}
