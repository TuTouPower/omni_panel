import { app, BrowserWindow, Tray, Menu, nativeImage } from "electron";
import { join } from "node:path";
import { getConfigPath, getDataRoot } from "./core/paths";
import { createConfigStore } from "./core/config/config-store";
import { createRuntimeStore } from "./core/scheduler/runtime-store";
import { createSecretsStore } from "./core/config/secrets-store";
import { createSafeStorageCrypto } from "./core/config/safe-storage-crypto";
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
    void win.loadURL(`../renderer/${cfg.route}`);
    return win;
}

let cleanupEventIpc: (() => void) | null = null;

void app.whenReady().then(async () => {
    const configPath = getConfigPath();
    const dataRoot = getDataRoot();

    const crypto = createSafeStorageCrypto();
    const configStore = createConfigStore(configPath);
    const runtimeStore = createRuntimeStore();
    const secretsStore = createSecretsStore(join(dataRoot, "secrets.json"), crypto);

    // Build secretParamKeys from plugin metadata
    const config = await configStore.load();
    const secretParamKeys = new Map<string, ReadonlySet<string>>();
    for (const plugin of config.plugins) {
        // Metadata parsing will be integrated later; for now empty set
        secretParamKeys.set(plugin.stateId, new Set());
    }

    // Register IPC handlers
    const refreshService = {
        refresh: async () => {
            // Will be wired to PluginRefreshService in integration
        },
        refreshAll: async () => {
            // Will be wired to PluginRefreshService in integration
        },
    };
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
