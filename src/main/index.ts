import { app, BrowserWindow, Tray, Menu, nativeImage, screen, powerMonitor } from "electron";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
    getConfigPath,
    getDataRoot,
    getStatesDir,
    getBundledPluginsDir,
    getUserPluginsDir,
    get_tray_icon_path,
} from "./core/paths";
import { initLogging } from "./core/logging";
import { createLogger } from "../shared/lib/logger";
import { createConfigStore } from "./core/config/config-store";
import { createCacheStore } from "./core/cache/cache-store";
import { createRuntimeStore } from "./core/scheduler/runtime-store";
import { createSecretsStore } from "./core/config/secrets-store";
import { createSafeStorageCrypto } from "./core/config/safe-storage-crypto";
import { createRefreshService } from "./core/scheduler/refresh-service";
import { createPluginScheduler } from "./core/scheduler/plugin-scheduler";
import { executePlugin } from "./core/plugin/runner";
import { parsePluginOutput } from "./core/plugin/output-parser";
import { buildPluginCommand } from "./core/plugin/command-builder";
import { registerPluginIpc } from "./ipc/plugin-ipc";
import { registerConfigIpc } from "./ipc/config-ipc";
import { registerEventIpc } from "./ipc/event-ipc";
import { registerSystemIpc } from "./ipc/system-ipc";
import { discoverPlugins } from "./core/plugin/discovery";
import { findPython } from "./core/plugin/python-detect";
import type { PluginDefinition } from "./core/plugin/types";

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
    // Vite build output mirrors the source directory structure,
    // so src/renderer/index.html ends up at ../renderer/main_window/src/renderer/index.html
    return `file://${resolve(join(__dirname, "../renderer/main_window/src/renderer/index.html"))}#${route}`;
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
    const dataRoot = getDataRoot();
    await initLogging(dataRoot);
    const log = createLogger("main");

    log.info("Application starting");
    const configPath = getConfigPath();
    const statesDir = getStatesDir();

    const crypto = createSafeStorageCrypto();
    const configStore = createConfigStore(configPath);
    const cacheStore = createCacheStore(statesDir);
    const runtimeStore = createRuntimeStore();
    const secretsStore = createSecretsStore(join(dataRoot, "secrets.json"), crypto);

    // Discover bundled + user plugins
    const bundledDir = getBundledPluginsDir();
    const userDir = getUserPluginsDir();
    const bundledDefs = await discoverPlugins(bundledDir, "bundled");
    const userDefs = await discoverPlugins(userDir, "user");
    const allDefinitions: readonly PluginDefinition[] = [...bundledDefs, ...userDefs];
    log.info(
        `Discovered ${String(allDefinitions.length)} plugins (${String(bundledDefs.length)} bundled, ${String(userDefs.length)} user)`,
    );

    // Detect Python
    let pythonCommand = "python3";
    let pythonAvailable = true;
    try {
        pythonCommand = await findPython();
        log.info(`Python detected: ${pythonCommand}`);
    } catch {
        pythonAvailable = false;
        log.warn("Python 3.8+ not detected, plugin functionality unavailable");
    }

    // Build command builder with detected Python
    const buildCommand = (
        executablePath: string,
        parameterValues: Record<string, string>,
        language: "zh-Hans" | "en",
    ) => buildPluginCommand(executablePath, parameterValues, language, pythonCommand);

    // Build secretParamKeys from plugin metadata
    const config = await configStore.load();

    // Auto-seed: create default plugin instances on first launch
    if (config.plugins.length === 0 && allDefinitions.length > 0) {
        log.info("First launch: auto-seeding plugin instances");
        const seededPlugins = allDefinitions.map((def) => {
            const meta = def.metadata;
            const zhName = meta ? (meta as Record<string, unknown>)["name@zh-Hans"] : undefined;
            const name =
                (typeof zhName === "string" ? zhName : undefined) ??
                meta?.name ??
                def.scriptName.replace(/\.py$/, "");
            return {
                instanceId: randomUUID(),
                stateId: randomUUID(),
                name,
                enabled: true,
                executablePath: def.executablePath,
                refreshIntervalSeconds: 300,
                parameterValues: {},
            };
        });
        await configStore.save({ ...config, plugins: seededPlugins });
    }

    // Reload config after potential seeding
    const currentConfig = await configStore.load();

    const secretParamKeys = new Map<string, ReadonlySet<string>>();
    for (const plugin of currentConfig.plugins) {
        const scriptName = plugin.executablePath.split("/").pop() ?? plugin.executablePath;
        const def = allDefinitions.find((d) => d.scriptName === scriptName);
        const secretKeys = new Set<string>();
        if (def?.metadata?.parameters) {
            for (const param of def.metadata.parameters) {
                if (param.type === "secret") {
                    secretKeys.add(param.name);
                }
            }
        }
        secretParamKeys.set(plugin.instanceId, secretKeys);
    }

    // Wire real refresh service
    const refreshService = createRefreshService({
        runner: executePlugin,
        outputParser: parsePluginOutput,
        commandBuilder: buildCommand,
        cacheStore,
        runtimeStore,
        configStore,
        secretsStore,
        secretParamKeys,
    });

    // Register IPC handlers
    await registerPluginIpc({
        configStore,
        runtimeStore,
        refreshService,
        definitions: allDefinitions,
    });
    await registerConfigIpc({
        configStore,
        secretsStore,
        secretParamKeys,
        onConfigSaved: (updatedConfig) => {
            // Rebuild scheduling for all enabled plugins
            scheduler.stopAll();
            for (const plugin of updatedConfig.plugins) {
                if (plugin.enabled) {
                    scheduler.start(plugin.instanceId, plugin.refreshIntervalSeconds);
                }
            }
        },
    });
    await registerSystemIpc({
        pythonStatus: { available: pythonAvailable, command: pythonCommand },
    });
    cleanupEventIpc = registerEventIpc({ runtimeStore });

    // Start periodic refresh scheduler for enabled plugins
    const scheduler = createPluginScheduler({
        refresh: (instanceId: string) => refreshService.refresh(instanceId),
    });
    let scheduledCount = 0;
    for (const plugin of currentConfig.plugins) {
        if (plugin.enabled) {
            scheduler.start(plugin.instanceId, plugin.refreshIntervalSeconds);
            scheduledCount++;
        }
    }
    log.info(`Scheduler started for ${String(scheduledCount)} plugins`);

    // Sleep/wake handling — pause scheduling during sleep, resume on wake
    const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
    let safetyNetTimer: ReturnType<typeof setTimeout> | null = null;

    function resumeScheduling(): void {
        if (safetyNetTimer) {
            clearTimeout(safetyNetTimer);
            safetyNetTimer = null;
        }
        void configStore.load().then((latestConfig) => {
            for (const plugin of latestConfig.plugins) {
                if (plugin.enabled) {
                    scheduler.start(plugin.instanceId, plugin.refreshIntervalSeconds);
                }
            }
        });
    }

    powerMonitor.on("suspend", () => {
        scheduler.stopAll();
        // Safety net: resume if wake event is missed
        safetyNetTimer = setTimeout(resumeScheduling, FOUR_HOURS_MS);
    });

    powerMonitor.on("resume", () => {
        resumeScheduling();
    });

    // Window references — shared between tray and E2E mode
    let popupWin: BrowserWindow | null = null;
    let dashboardWin: BrowserWindow | null = null;
    let settingsWin: BrowserWindow | null = null;

    // System tray — skip in E2E mode (tray may crash in headless/CI)
    if (process.env["E2E"] !== "1") {
        const trayIcon = nativeImage
            .createFromPath(get_tray_icon_path())
            .resize({ width: 16, height: 16 });
        const tray = new Tray(trayIcon);
        tray.setToolTip("OmniUsage");

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
            const clampedY = Math.min(
                y,
                display.workArea.y + display.workArea.height - popupHeight,
            );
            popupWin.setBounds({
                x: clampedX,
                y: clampedY,
                width: popupWidth,
                height: popupHeight,
            });
            popupWin.show();

            popupWin.on("closed", () => {
                popupWin = null;
            });
        });
    } // end of E2E !== "1" tray block

    app.on("before-quit", () => {
        if (safetyNetTimer) {
            clearTimeout(safetyNetTimer);
            safetyNetTimer = null;
        }
        scheduler.stopAll();
        cleanupEventIpc?.();
        cleanupEventIpc = null;
    });

    // In E2E mode, auto-open dashboard so tests don't need tray interaction
    if (process.env["E2E"] === "1") {
        dashboardWin = createWindowFor("dashboard");
    }
});

app.on("window-all-closed", () => {
    // Don't quit — tray keeps app alive
});
