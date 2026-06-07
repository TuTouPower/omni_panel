import { app } from "electron";
import { join, resolve } from "node:path";

// In dev mode, main entry is at out/main/index.js.
// __dirname here resolves to out/main, so ../.. reaches project root.
// app.getAppPath() also returns out/main in dev, but using __dirname
// is more explicit and doesn't depend on Electron's getAppPath semantics.
const PROJECT_ROOT = resolve(__dirname, "..", "..");

export function getDataRoot(): string {
    return app.getPath("userData");
}

export function getConfigPath(): string {
    return join(getDataRoot(), "config.json");
}

export function getStatesDir(): string {
    return join(getDataRoot(), "states");
}

export function getBundledPluginsDir(): string {
    if (app.isPackaged) {
        return join(process.resourcesPath, "plugins");
    }
    return join(PROJECT_ROOT, "assets", "plugins");
}

export function getUserPluginsDir(): string {
    return join(getDataRoot(), "plugins");
}

export function get_tray_icon_path(): string {
    if (app.isPackaged) {
        return join(process.resourcesPath, "tray-icon.png");
    }
    return join(PROJECT_ROOT, "assets", "tray-icon.png");
}

export function get_app_icon_path(): string {
    if (app.isPackaged) {
        return join(process.resourcesPath, "icon.png");
    }
    return join(PROJECT_ROOT, "assets", "icon.png");
}

export function getPluginCacheDir(): string {
    return join(getDataRoot(), "plugin-cache");
}

export function getBundledPluginCacheDir(): string {
    return join(process.resourcesPath, "plugin-cache");
}

export function getSdkDir(): string {
    if (app.isPackaged) {
        return join(process.resourcesPath, "sdk");
    }
    return join(PROJECT_ROOT, "src", "plugins", "sdk");
}
