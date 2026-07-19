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

// userData 下文件路径常量集中入口。可选 base 参数用于注入临时目录（测试场景），
// 默认走 getDataRoot()，保持调用方零侵入。
export function get_vault_path(base: string = getDataRoot()): string {
    return join(base, "secrets.vault");
}

export function get_vault_key_path(base: string = getDataRoot()): string {
    return join(base, "vault.key");
}

// Note (A17): token-stats-store and observation-store share this single SQLite
// file. better-sqlite3 supports multiple connections to the same file in-process
// without corruption, so the shared path is intentional. If the stores ever
// split (independent backup / migration cadence), update both call sites
// (index.ts creates both stores from this path) and the test fixtures.
export function get_observations_db_path(base: string = getDataRoot()): string {
    return join(base, "observations.sqlite");
}

// Alias for token-stats-store so its dependency on the shared DB is explicit
// at the call site. Currently returns the same file as get_observations_db_path.
export function get_token_stats_db_path(base: string = getDataRoot()): string {
    return get_observations_db_path(base);
}

export function get_snapshot_cache_path(base: string = getDataRoot()): string {
    return join(base, "snapshot-cache.json");
}

export function get_logs_dir(base: string = getDataRoot()): string {
    return join(base, "logs");
}

export function getBundledConnectorsDir(): string {
    if (app.isPackaged) {
        return join(process.resourcesPath, "connectors");
    }
    return join(PROJECT_ROOT, "connectors");
}

export function getUserConnectorsDir(): string {
    return join(getDataRoot(), "connectors");
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
