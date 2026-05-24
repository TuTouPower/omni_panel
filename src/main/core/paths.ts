import { app } from "electron";
import { join } from "node:path";

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
    return join(app.getAppPath(), "resources", "plugins");
}

export function getUserPluginsDir(): string {
    return join(getDataRoot(), "plugins");
}

export function getLogsDir(): string {
    return join(getDataRoot(), "logs");
}
