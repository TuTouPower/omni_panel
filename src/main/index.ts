import { app, BrowserWindow, Tray, Menu, nativeImage, screen } from "electron";
import { join, resolve } from "node:path";
import { getConfigPath, getDataRoot, getStatesDir } from "./core/paths";
import { createConfigStore } from "./core/config/config-store";
import { createCacheStore } from "./core/cache/cache-store";
import { createRuntimeStore } from "./core/scheduler/runtime-store";
import { createSecretsStore } from "./core/config/secrets-store";
import { createSafeStorageCrypto } from "./core/config/safe-storage-crypto";
import { createRefreshService } from "./core/scheduler/refresh-service";
import { executePlugin } from "./core/plugin/runner";
import { parsePluginOutput } from "./core/plugin/output-parser";
import { buildPluginCommand } from "./core/plugin/command-builder";
import { registerPluginIpc } from "./ipc/plugin-ipc";
import { registerConfigIpc } from "./ipc/config-ipc";
import { registerEventIpc } from "./ipc/event-ipc";

const SECURE_WEB_PREFS = {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
} as const;

interface WindowConfig {
    route: string;
    width: number;
    height: number;
    frame?: boolean;
    show?: boolean;
}

const WINDOW_CONFIGS: Record<string, WindowConfig> = {
    popup: { route: "popup", width: 360, height: 480, frame: false, show: false },
    dashboard: { route: "dashboard", width: 800, height: 600 },
    settings: { route: "settings", width: 640, height: 520 },
};

function getPreloadPath(): string {
    return join(__dirname, "preload.js");
}

function getRendererUrl(route: string): string {
    const devServerUrl = process.env["MAIN_WINDOW_VITE_DEV_SERVER_URL"];
    if (devServerUrl) {
        return `${devServerUrl}#${route}`;
    }
    return `file://${resolve(join(__dirname, "../renderer/main_window/index.html"))}#${route}`;
}

function createWindowFor(key: string): BrowserWindow {
    const cfg = WINDOW_CONFIGS[key];
    if (!cfg) throw new Error(`Unknown window: ${key}`);
    const win = new BrowserWindow({
        width: cfg.width,
        height: cfg.height,
        frame: cfg.frame ?? true,
        show: cfg.show ?? true,
        webPreferences: {
            ...SECURE_WEB_PREFS,
            preload: getPreloadPath(),
        },
    });
    void win.loadURL(getRendererUrl(cfg.route));
    return win;
}

let cleanupEventIpc: (() => void) | null = null;

void app.whenReady().then(async () => {
    const configPath = getConfigPath();
    const dataRoot = getDataRoot();
    const statesDir = getStatesDir();

    const crypto = createSafeStorageCrypto();
    const configStore = createConfigStore(configPath);
    const cacheStore = createCacheStore(statesDir);
    const runtimeStore = createRuntimeStore();
    const secretsStore = createSecretsStore(join(dataRoot, "secrets.json"), crypto);

    // Build secretParamKeys from plugin metadata
    const config = await configStore.load();
    const secretParamKeys = new Map<string, ReadonlySet<string>>();
    for (const plugin of config.plugins) {
        // Metadata parsing will be integrated later; for now empty set
        secretParamKeys.set(plugin.stateId, new Set());
    }

    // Wire real refresh service
    const refreshService = createRefreshService({
        runner: executePlugin,
        outputParser: parsePluginOutput,
        commandBuilder: buildPluginCommand,
        cacheStore,
        runtimeStore,
        configStore,
    });

    // Register IPC handlers
    await registerPluginIpc({ configStore, runtimeStore, refreshService });
    await registerConfigIpc({ configStore, secretsStore, secretParamKeys });
    cleanupEventIpc = registerEventIpc({ runtimeStore });

    // System tray
    const trayIcon = nativeImage.createEmpty();
    const tray = new Tray(trayIcon);
    tray.setToolTip("OmniUsage");

    let popupWin: BrowserWindow | null = null;
    let dashboardWin: BrowserWindow | null = null;
    let settingsWin: BrowserWindow | null = null;

    const contextMenu = Menu.buildFromTemplate([
        {
            label: "打开仪表板",
            click: () => {
                if (!dashboardWin || dashboardWin.isDestroyed()) {
                    dashboardWin = createWindowFor("dashboard");
                }
                dashboardWin.focus();
            },
        },
        {
            label: "设置",
            click: () => {
                if (!settingsWin || settingsWin.isDestroyed()) {
                    settingsWin = createWindowFor("settings");
                }
                settingsWin.focus();
            },
        },
        { type: "separator" },
        {
            label: "退出",
            click: () => {
                app.quit();
            },
        },
    ]);
    tray.setContextMenu(contextMenu);

    tray.on("click", () => {
        if (popupWin && !popupWin.isDestroyed()) {
            popupWin.close();
            popupWin = null;
            return;
        }
        popupWin = createWindowFor("popup");

        // Position popup near tray icon
        const trayBounds = tray.getBounds();
        const display = screen.getDisplayNearestPoint({
            x: trayBounds.x + trayBounds.width / 2,
            y: trayBounds.y + trayBounds.height / 2,
        });
        const popupCfg = WINDOW_CONFIGS["popup"];
        const popupWidth = popupCfg?.width ?? 360;
        const popupHeight = popupCfg?.height ?? 480;
        const x = Math.round(trayBounds.x + trayBounds.width / 2 - popupWidth / 2);
        const y = Math.round(trayBounds.y + trayBounds.height + 4);
        // Ensure popup stays within display bounds
        const clampedX = Math.max(
            display.workArea.x,
            Math.min(x, display.workArea.x + display.workArea.width - popupWidth),
        );
        const clampedY = Math.min(y, display.workArea.y + display.workArea.height - popupHeight);
        popupWin.setBounds({ x: clampedX, y: clampedY, width: popupWidth, height: popupHeight });
        popupWin.show();

        popupWin.on("closed", () => {
            popupWin = null;
        });
    });

    app.on("before-quit", () => {
        cleanupEventIpc?.();
        cleanupEventIpc = null;
    });
});

app.on("window-all-closed", () => {
    // Don't quit — tray keeps app alive
});
