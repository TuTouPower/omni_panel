import {
    app,
    BrowserWindow,
    nativeTheme,
    Tray,
    nativeImage,
    screen,
    powerMonitor,
    session,
    ipcMain,
} from "electron";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
    getConfigPath,
    getDataRoot,
    getStatesDir,
    getBundledPluginsDir,
    getUserPluginsDir,
    getPluginCacheDir,
    getBundledPluginCacheDir,
    getSdkDir,
    get_tray_icon_path,
    get_app_icon_path,
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
import { createSchedulerOrchestrator } from "./core/scheduler/scheduler-orchestrator";
import { executePlugin } from "./core/plugin/runner";
import { parsePluginResult } from "./core/plugin/output-parser";
import { buildPluginCommand } from "./core/plugin/command-builder";
import { registerPluginIpc } from "./ipc/plugin-ipc";
import { registerConfigIpc } from "./ipc/config-ipc";
import { registerEventIpc } from "./ipc/event-ipc";
import { registerAuthIpc } from "./ipc/auth-ipc";
import { registerLogIpc } from "./ipc/log-ipc";
import { registerPopupIpc } from "./ipc/popup-ipc";
import { createCookieRefreshService } from "./core/cookie-refresh/cookie-refresh-service";
import { parseSizeReport } from "./ipc/size-validation";
import { IPC_CHANNELS } from "../shared/types/ipc";
import { create_main_panel_controller } from "./core/main-panel/main-panel-controller";
import type { MainPanelController } from "./core/main-panel/main-panel-types";
import { discoverPlugins } from "./core/plugin/discovery";
import { compilePlugin } from "./core/plugin/compiler";
import {
    BundledResourceIntegrityError,
    verify_bundled_resources,
} from "./core/plugin/bundled_resource_verifier";
import type { PluginConfiguration } from "../shared/types/config";
import type { PluginDefinition } from "./core/plugin/types";

// Suppress EPIPE when stdout pipe is closed (e.g. launched from script with broken pipe)
process.on("uncaughtException", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") return;
    throw err;
});

// Prevent white screen on systems where GPU process crashes
app.disableHardwareAcceleration();

// Single-instance lock — prevent duplicate app instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
}

const SECURE_WEB_PREFS = {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
} as const;

const PLUGIN_NODE = process.execPath;

interface WindowConfig {
    route: string;
    width: number;
    height: number;
    frame?: boolean;
    show?: boolean;
    autoHideMenuBar?: boolean;
    titleBarStyle?: "hidden" | "hiddenInset" | "default";
    titleBarOverlay?: boolean;
    roundedCorners?: boolean;
    resizable?: boolean;
    minWidth?: number;
    maxWidth?: number;
}

const WINDOW_CONFIGS: Record<string, WindowConfig> = {
    popup: {
        route: "popup",
        width: 482,
        height: 480,
        frame: false,
        show: false,
        resizable: true,
        minWidth: 472,
        maxWidth: 780,
    },
    settings: {
        route: "settings",
        width: 820,
        height: 660,
        frame: false,
        show: true,
        titleBarStyle: "hidden",
        titleBarOverlay: false,
        roundedCorners: true,
    },
    tray_menu: {
        route: "tray",
        width: 1,
        height: 1,
        frame: false,
        show: false,
    },
};

function getPreloadPath(): string {
    return join(__dirname, "../preload/index.js");
}

function getRendererUrl(route: string): string {
    const devServerUrl = process.env["ELECTRON_RENDERER_URL"];
    if (devServerUrl) {
        return `${devServerUrl}#${route}`;
    }
    return `file://${resolve(join(__dirname, "../renderer/index.html"))}#${route}`;
}

function createWindowFor(key: string, options: { load?: boolean } = {}): BrowserWindow {
    const cfg = WINDOW_CONFIGS[key];
    if (!cfg) throw new Error(`Unknown window: ${key}`);
    const log = createLogger("main");
    log.info(`Creating window: ${key} (${String(cfg.width)}x${String(cfg.height)})`);
    const win = new BrowserWindow({
        width: cfg.width,
        height: cfg.height,
        frame: cfg.frame ?? true,
        show: cfg.show ?? true,
        autoHideMenuBar: cfg.autoHideMenuBar ?? false,
        resizable: cfg.resizable ?? true,
        ...(cfg.minWidth !== undefined && { minWidth: cfg.minWidth }),
        ...(cfg.maxWidth !== undefined && { maxWidth: cfg.maxWidth }),
        ...(cfg.titleBarStyle !== undefined && { titleBarStyle: cfg.titleBarStyle }),
        ...(cfg.titleBarOverlay !== undefined && { titleBarOverlay: cfg.titleBarOverlay }),
        ...(cfg.roundedCorners !== undefined && { roundedCorners: cfg.roundedCorners }),
        icon: get_app_icon_path(),
        webPreferences: {
            ...SECURE_WEB_PREFS,
            preload: getPreloadPath(),
        },
    });
    // Group all windows under one taskbar icon on Windows
    if (process.platform === "win32") {
        win.setAppDetails({ appId: "omni-usage" });
    }
    if (cfg.autoHideMenuBar) {
        win.setMenuBarVisibility(false);
    }
    if (options.load !== false) {
        void win.loadURL(getRendererUrl(cfg.route));
    }
    win.on("closed", () => {
        log.info(`Window closed: ${key}`);
    });
    return win;
}

let cleanupEventIpc: (() => void) | null = null;
let cleanupPopupIpc: (() => void) | null = null;

void app.whenReady().then(async () => {
    // When ELECTRON_RUN_AS_NODE=1, Electron loads this entry but is used as a
    // Node runtime for plugin scripts.  Skip all GUI initialization so each
    // plugin spawn doesn't create its own window/tray.
    if (process.env["ELECTRON_RUN_AS_NODE"] === "1") {
        return;
    }

    const dataRoot = getDataRoot();
    await initLogging(dataRoot);
    const log = createLogger("main");

    log.info("Application starting");

    // Set CSP programmatically — allows Vite dev server in dev mode
    const devServerUrl = process.env["ELECTRON_RENDERER_URL"];
    const devOrigin = devServerUrl ? new URL(devServerUrl).origin : null;
    const cspScriptSrc = devOrigin ? `'self' ${devOrigin} 'unsafe-eval'` : "'self'";
    const cspConnectSrc = devOrigin ? `'self' ${devOrigin} ws:` : "'self'";
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                "Content-Security-Policy": [
                    `default-src 'self'; script-src ${cspScriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src ${cspConnectSrc};`,
                ],
            },
        });
    });
    const configPath = getConfigPath();
    const statesDir = getStatesDir();

    const crypto =
        process.env["E2E"] === "1"
            ? {
                  encrypt(plaintext: string): string {
                      return Buffer.from(plaintext, "utf8").toString("base64");
                  },
                  decrypt(ciphertext: string): string {
                      return Buffer.from(ciphertext, "base64").toString("utf8");
                  },
              }
            : createSafeStorageCrypto();
    const configStore = createConfigStore(configPath);
    const cacheStore = createCacheStore(statesDir);
    const runtimeStore = createRuntimeStore();
    const secretsStore = createSecretsStore(join(dataRoot, "secrets.json"), crypto);

    // Discover bundled + user plugins
    const bundledDir = getBundledPluginsDir();
    const userDir = getUserPluginsDir();
    const sdkDir = getSdkDir();
    let bundledDefs: readonly PluginDefinition[] = [];
    if (app.isPackaged) {
        try {
            await verify_bundled_resources(bundledDir, sdkDir);
            bundledDefs = await discoverPlugins(bundledDir, "bundled");
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            if (error instanceof BundledResourceIntegrityError) {
                log.error(`Bundled plugin integrity check failed: ${message}`);
            } else {
                log.error(`Bundled plugin integrity check could not run: ${message}`);
            }
        }
    } else {
        bundledDefs = await discoverPlugins(bundledDir, "bundled");
    }
    const userDefs = await discoverPlugins(userDir, "user");
    const allDefinitions: readonly PluginDefinition[] = [...bundledDefs, ...userDefs];
    log.info(
        `Discovered ${String(allDefinitions.length)} plugins (${String(bundledDefs.length)} bundled, ${String(userDefs.length)} user)`,
    );

    // Compile TS plugins to JS
    const cacheDir = getPluginCacheDir();
    const compiledPaths = new Map<string, string>();

    for (const def of allDefinitions) {
        const fallbackCacheDir =
            app.isPackaged && def.source === "bundled" ? getBundledPluginCacheDir() : undefined;
        const result = await compilePlugin(
            def,
            cacheDir,
            sdkDir,
            fallbackCacheDir ? { fallbackCacheDir } : {},
        );
        if (result.executablePath) {
            compiledPaths.set(def.executablePath, result.executablePath);
            if (result.status === "stale_cache") {
                log.warn(`Plugin ${def.scriptName} using stale cache: ${result.error}`);
            }
        } else if (result.status === "compile_error") {
            log.warn(`Plugin ${def.scriptName} failed to compile: ${result.error}`);
        }
    }

    const buildCommand = (
        executablePath: string,
        parameterValues: Record<string, string>,
        language: "zh-Hans" | "en",
    ) => {
        const compiledPath = compiledPaths.get(executablePath) ?? executablePath;
        return buildPluginCommand(compiledPath, parameterValues, language, PLUGIN_NODE);
    };

    // Build secretParamKeys from plugin metadata
    const config = await configStore.load();

    // Auto-seed: create default plugin instances for missing definitions.
    // Match by script base name (without extension) to handle renames (e.g. .py → .ts).
    const existingByName = new Map<string, (typeof config.plugins)[number]>();
    for (const p of config.plugins) {
        const baseName =
            p.executablePath
                .replace(/\.[^.]+$/, "")
                .split(/[/\\]/)
                .pop() ?? "";
        existingByName.set(baseName, p);
    }

    const { newDefs, renamedPlugins } = (() => {
        const newDefs: PluginDefinition[] = [];
        const renamedPlugins: { oldPath: string; newPath: string }[] = [];
        for (const def of allDefinitions) {
            const baseName = def.scriptName.replace(/\.[^.]+$/, "");
            const existing = existingByName.get(baseName);
            if (existing) {
                if (existing.executablePath !== def.executablePath) {
                    renamedPlugins.push({
                        oldPath: existing.executablePath,
                        newPath: def.executablePath,
                    });
                    (existing as { executablePath: string }).executablePath = def.executablePath;
                }
            } else {
                newDefs.push(def);
            }
        }
        return { newDefs, renamedPlugins };
    })();

    if (renamedPlugins.length > 0) {
        log.info(
            `Updated ${String(renamedPlugins.length)} plugin paths: ${renamedPlugins.map((r) => r.oldPath.split(/[/\\]/).pop()).join(", ")}`,
        );
        await configStore.save(config);
    }

    if (newDefs.length > 0) {
        log.info(`Auto-seeding ${String(newDefs.length)} missing plugin instances`);
        const seededPlugins = newDefs.map((def) => {
            const meta = def.metadata;
            const zhName = meta ? (meta as Record<string, unknown>)["name@zh-Hans"] : undefined;
            const name =
                (typeof zhName === "string" ? zhName : undefined) ??
                meta?.name ??
                def.scriptName.replace(/\.ts$/, "");
            return {
                instanceId: randomUUID(),
                stateId: randomUUID(),
                name,
                enabled: true,
                executablePath: def.executablePath,
                refreshIntervalSeconds: 300,
                parameterValues: {},
                endpointOverrides: {},
            };
        });
        await configStore.save({ ...config, plugins: [...config.plugins, ...seededPlugins] });
        log.info(
            `Auto-seeded ${String(seededPlugins.length)} plugins: ${seededPlugins.map((p) => p.name).join(", ")}`,
        );
    }

    // Reload config after potential seeding
    const currentConfig = await configStore.load();
    let currentConfigSnapshot = currentConfig;

    // Apply saved theme so nativeTheme.shouldUseDarkColors is correct from the start
    nativeTheme.themeSource = currentConfig.theme ?? "system";

    function buildSecretParamKeys(cfg: {
        plugins: readonly PluginConfiguration[];
    }): Map<string, ReadonlySet<string>> {
        const map = new Map<string, ReadonlySet<string>>();
        for (const plugin of cfg.plugins) {
            const def = allDefinitions.find((d) => d.executablePath === plugin.executablePath);
            const secretKeys = new Set<string>();
            if (def?.metadata?.parameters) {
                for (const param of def.metadata.parameters) {
                    if (param.type === "secret") {
                        secretKeys.add(param.name);
                    }
                }
            }
            map.set(plugin.instanceId, secretKeys);
        }
        return map;
    }

    const secretParamKeys = buildSecretParamKeys(currentConfig);

    // Build metadataEndpoints map from plugin definitions
    function getMetadataEndpoints(instanceId: string): Record<string, string | null> | undefined {
        const plugin = currentConfigSnapshot.plugins.find((p) => p.instanceId === instanceId);
        if (!plugin) return undefined;
        const def = allDefinitions.find((d) => d.executablePath === plugin.executablePath);
        return def?.metadata?.endpoints;
    }

    // Wire real refresh service
    const refreshService = createRefreshService({
        runner: executePlugin,
        outputParser: parsePluginResult,
        commandBuilder: buildCommand,
        cacheStore,
        runtimeStore,
        configStore,
        secretsStore,
        secretParamKeys,
        getMetadataEndpoints,
    });

    // Scheduler orchestrator — centralises scheduling, suspend/resume, shutdown
    const scheduler = createPluginScheduler({
        refresh: (instanceId: string) => refreshService.refresh(instanceId),
    });
    const orchestrator = createSchedulerOrchestrator({ scheduler, configStore });

    let main_panel_controller: MainPanelController | null = null;
    let tray_ref: Tray | null = null;

    // Cookie refresh service — background session cookie renewal
    const cookieRefreshService = createCookieRefreshService({
        configStore,
        secretsStore,
        definitions: allDefinitions,
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
            currentConfigSnapshot = updatedConfig;
            log.info("Config saved — rebuilding scheduler and secret keys");
            const newKeys = buildSecretParamKeys(updatedConfig);
            secretParamKeys.clear();
            for (const [k, v] of newKeys) {
                secretParamKeys.set(k, v);
            }
            orchestrator.rebuild(updatedConfig);
            const new_hours = updatedConfig.cookieRefreshHours;
            const old_hours = currentConfigSnapshot.cookieRefreshHours;
            if (new_hours !== old_hours) {
                start_cookie_refresh_timer(new_hours);
            }
            for (const win of BrowserWindow.getAllWindows()) {
                if (!win.isDestroyed()) {
                    win.webContents.send(IPC_CHANNELS.CONFIG_CHANGED, updatedConfig);
                }
            }
            main_panel_controller?.apply_config_change();
        },
    });
    await registerLogIpc(dataRoot);
    cleanupEventIpc = registerEventIpc({ runtimeStore });
    registerAuthIpc({
        configStore,
        secretsStore,
        definitions: allDefinitions,
        cookieRefreshService,
    });

    // Window references — shared between tray and E2E mode
    /** Custom tray menu frameless window (replaces native context menu). */
    let trayMenuWin: BrowserWindow | null = null;

    // Settings window singleton
    let settingsWin: BrowserWindow | null = null;

    function createOrFocusSettings(): { created: boolean } {
        if (settingsWin && !settingsWin.isDestroyed()) {
            settingsWin.show();
            settingsWin.focus();
            return { created: false };
        }
        settingsWin = createWindowFor("settings");
        settingsWin.center();
        settingsWin.on("closed", () => {
            settingsWin = null;
        });
        return { created: true };
    }

    // Register IPC handler for opening settings from renderer
    ipcMain.handle(
        IPC_CHANNELS.SETTINGS_OPEN,
        (_event, context?: { instanceId?: string; provider?: string; accountId?: string }) => {
            const { created } = createOrFocusSettings();
            if (!context || !settingsWin || settingsWin.isDestroyed()) return;
            const win = settingsWin;
            if (created) {
                win.webContents.once("did-finish-load", () => {
                    if (!win.isDestroyed()) {
                        win.webContents.send(IPC_CHANNELS.SETTINGS_NAVIGATE, context);
                    }
                });
            } else {
                win.webContents.send(IPC_CHANNELS.SETTINGS_NAVIGATE, context);
            }
        },
    );

    // Settings window frameless controls
    ipcMain.on(IPC_CHANNELS.SETTINGS_MINIMIZE, () => {
        if (settingsWin && !settingsWin.isDestroyed()) settingsWin.minimize();
    });
    ipcMain.on(IPC_CHANNELS.SETTINGS_MAXIMIZE, () => {
        if (!settingsWin || settingsWin.isDestroyed()) return;
        if (settingsWin.isMaximized()) {
            settingsWin.unmaximize();
        } else {
            settingsWin.maximize();
        }
    });
    ipcMain.on(IPC_CHANNELS.SETTINGS_CLOSE, () => {
        if (settingsWin && !settingsWin.isDestroyed()) settingsWin.close();
    });

    ipcMain.handle(IPC_CHANNELS.MAIN_PANEL_HIDE, () => {
        main_panel_controller?.hide();
    });
    ipcMain.handle(
        IPC_CHANNELS.MAIN_PANEL_GET_MODE,
        () => main_panel_controller?.get_mode() ?? "popup",
    );

    const main_panel_platform =
        process.platform === "darwin" ? "darwin" : process.platform === "win32" ? "win32" : "linux";

    main_panel_controller = create_main_panel_controller({
        platform: main_panel_platform,
        get_config: () => currentConfigSnapshot,
        save_config: (next) => {
            currentConfigSnapshot = next;
            configStore.scheduleSave(next);
        },
        create_window: () => createWindowFor("popup", { load: false }),
        get_renderer_url: getRendererUrl,
        get_preload_path: getPreloadPath,
        get_app_icon_path,
        get_tray_bounds: () => tray_ref?.getBounds() ?? null,
        get_display_for_bounds: (bounds) => screen.getDisplayMatching(bounds),
        get_all_displays: () => screen.getAllDisplays(),
        get_primary_display: () => screen.getPrimaryDisplay(),
    });

    cleanupPopupIpc = registerPopupIpc({
        report_content_height: (report) =>
            main_panel_controller?.report_content_height(report) ?? null,
    });

    // Start periodic refresh for enabled plugins
    orchestrator.startAll(currentConfig);

    // Cookie refresh timer
    let cookie_refresh_timer: ReturnType<typeof setInterval> | null = null;

    function start_cookie_refresh_timer(hours: number | undefined) {
        if (cookie_refresh_timer) {
            clearInterval(cookie_refresh_timer);
            cookie_refresh_timer = null;
        }
        if (!hours || hours === 0) {
            log.info("Cookie refresh timer disabled (cookieRefreshHours=0)");
            return;
        }
        const ms = hours * 3_600 * 1_000;
        log.info(`Starting cookie refresh timer every ${String(hours)}h`);
        cookie_refresh_timer = setInterval(() => {
            log.info("Cookie refresh timer triggered");
            void cookieRefreshService.refreshAll();
        }, ms);
    }

    start_cookie_refresh_timer(currentConfig.cookieRefreshHours ?? 24);

    // Sleep/wake handling
    powerMonitor.on("suspend", () => {
        log.info("System suspending — stopping all schedulers");
        orchestrator.suspend();
    });

    powerMonitor.on("resume", () => {
        log.info("System resumed — restarting schedulers");
        orchestrator.resume();
    });

    // System tray — skip in E2E mode unless E2E_WITH_TRAY=1
    if (process.env["E2E"] !== "1" || process.env["E2E_WITH_TRAY"] === "1") {
        const trayIcon = nativeImage.createFromPath(get_tray_icon_path());
        if (trayIcon.isEmpty()) {
            log.warn("Tray icon loaded as empty image");
        }
        const tray = new Tray(trayIcon);
        tray_ref = tray;
        tray.setToolTip("OmniUsage — AI 用量监控");
        log.info("System tray created");
        if (process.env["E2E"] === "1") {
            // Expose tray click for E2E tests via IPC
            ipcMain.handle("test:tray-click", () => {
                log.info("[E2E test] test:tray-click received, emitting tray click");
                tray.emit("click");
                log.info("[E2E test] tray click emitted");
            });
        }

        // Tray menu state
        let is_paused = false;
        const hasLoginItemApi = typeof app.setLoginItemSettings === "function";

        // Custom tray menu window setup

        function hideTrayMenu(): void {
            if (!trayMenuWin || trayMenuWin.isDestroyed()) return;
            trayMenuWin.removeListener("blur", hideTrayMenu);
            trayMenuWin.hide();
            trayMenuWin.setSkipTaskbar(true);
        }

        // Create tray menu window once
        const trayMenuCfg = WINDOW_CONFIGS["tray_menu"];
        let tray_menu_size = {
            width: trayMenuCfg?.width ?? 184,
            height: trayMenuCfg?.height ?? 340,
        };
        trayMenuWin = new BrowserWindow({
            width: trayMenuCfg?.width ?? 184,
            height: trayMenuCfg?.height ?? 340,
            frame: false,
            transparent: true,
            skipTaskbar: true,
            alwaysOnTop: true,
            show: false,
            resizable: false,
            icon: get_app_icon_path(),
            webPreferences: {
                ...SECURE_WEB_PREFS,
                preload: getPreloadPath(),
            },
        });
        void trayMenuWin.loadURL(getRendererUrl("tray"));

        // Forward pause/autostart state to tray menu renderer
        const send_tray_state = (): void => {
            if (trayMenuWin && !trayMenuWin.isDestroyed()) {
                try {
                    trayMenuWin.webContents.send("tray:pauseState", is_paused);
                    trayMenuWin.webContents.send(
                        "tray:autostartState",
                        hasLoginItemApi ? app.getLoginItemSettings().openAtLogin : false,
                    );
                } catch {
                    // window may be destroyed mid-send
                }
            }
        };
        trayMenuWin.webContents.on("did-finish-load", () => {
            send_tray_state();
        });
        trayMenuWin.on("closed", () => {
            trayMenuWin = null;
        });

        // Tray menu IPC handlers
        ipcMain.handle("tray:openPanel", () => {
            hideTrayMenu();
            tray.emit("click");
        });
        ipcMain.handle("tray:refreshAll", () => {
            for (const p of currentConfigSnapshot.plugins) {
                if (p.enabled) void refreshService.refresh(p.instanceId);
            }
        });
        ipcMain.handle("tray:togglePause", () => {
            is_paused = !is_paused;
            if (is_paused) {
                orchestrator.suspend();
            } else {
                orchestrator.resume();
                orchestrator.rebuild(currentConfigSnapshot);
                orchestrator.startAll(currentConfigSnapshot);
            }
            send_tray_state();
        });
        ipcMain.handle("tray:toggleAutostart", () => {
            if (!hasLoginItemApi) return;
            const current = app.getLoginItemSettings().openAtLogin;
            app.setLoginItemSettings({ openAtLogin: !current });
            send_tray_state();
        });
        ipcMain.handle("tray:openSettings", () => {
            hideTrayMenu();
            createOrFocusSettings();
        });
        ipcMain.handle("tray:checkUpdate", () => {
            log.info("Check for updates requested (not yet implemented)");
        });
        ipcMain.handle("tray:quit", () => {
            app.quit();
        });
        ipcMain.handle("tray:restart", () => {
            app.relaunch();
            app.quit();
        });
        ipcMain.handle("tray:hide", () => {
            hideTrayMenu();
        });
        ipcMain.handle(IPC_CHANNELS.TRAY_REPORT_MENU_SIZE, (_event, report: unknown) => {
            const parsed = parseSizeReport(report, ["width", "height"]);
            if (!parsed) return;

            const width = parsed["width"];
            const height = parsed["height"];
            if (width === undefined || height === undefined) return;

            tray_menu_size = {
                width: Math.max(1, Math.ceil(width)),
                height: Math.max(1, Math.ceil(height)),
            };
            if (trayMenuWin && !trayMenuWin.isDestroyed() && trayMenuWin.isVisible()) {
                const bounds = trayMenuWin.getBounds();
                trayMenuWin.setBounds({ ...bounds, ...tray_menu_size });
            }
        });

        // Click → toggle main panel (left-click)
        tray.on("click", () => {
            if (trayMenuWin && !trayMenuWin.isDestroyed() && trayMenuWin.isVisible()) {
                trayMenuWin.removeListener("blur", hideTrayMenu);
                trayMenuWin.hide();
            }

            log.info("[tray] toggling main panel");
            main_panel_controller?.open_or_toggle();
        });

        // Right-click → show custom tray menu
        tray.on("right-click", () => {
            if (!trayMenuWin || trayMenuWin.isDestroyed()) return;

            const trayBounds = tray.getBounds();
            const display = screen.getDisplayNearestPoint({
                x: trayBounds.x + trayBounds.width / 2,
                y: trayBounds.y + trayBounds.height / 2,
            });
            const menuWidth = tray_menu_size.width;
            const menuHeight = tray_menu_size.height;

            const cx = Math.round(trayBounds.x + trayBounds.width / 2 - menuWidth / 2);
            const cy = trayBounds.y + trayBounds.height + 4;

            const clampedX = Math.max(
                display.workArea.x,
                Math.min(cx, display.workArea.x + display.workArea.width - menuWidth),
            );
            const clampedY =
                cy + menuHeight > display.workArea.y + display.workArea.height
                    ? trayBounds.y - menuHeight - 4
                    : cy;

            trayMenuWin.setBounds({
                x: clampedX,
                y: clampedY,
                width: menuWidth,
                height: menuHeight,
            });
            send_tray_state();
            trayMenuWin.show();
            trayMenuWin.focus();
            trayMenuWin.once("blur", hideTrayMenu);
        });
    } // end of E2E !== "1" tray block

    app.on("before-quit", () => {
        log.info("Application shutting down");
        if (trayMenuWin && !trayMenuWin.isDestroyed()) {
            trayMenuWin.destroy();
            trayMenuWin = null;
        }
        if (settingsWin && !settingsWin.isDestroyed()) {
            settingsWin.destroy();
            settingsWin = null;
        }
        main_panel_controller?.close_for_mode_switch();
        main_panel_controller = null;
        if (cookie_refresh_timer) {
            clearInterval(cookie_refresh_timer);
            cookie_refresh_timer = null;
        }
        orchestrator.shutdown();
        cleanupEventIpc?.();
        cleanupEventIpc = null;
        cleanupPopupIpc?.();
        cleanupPopupIpc = null;
    });

    app.on("will-quit", (e) => {
        if (configStore.hasPendingSave()) {
            e.preventDefault();
            void configStore.flushPendingSave().finally(() => {
                app.quit();
            });
        }
    });

    // In E2E mode, auto-open main panel so tests don't need tray interaction
    if (process.env["E2E"] === "1") {
        log.info("E2E mode: auto-opening main panel");
        main_panel_controller.open_or_focus();
    } else {
        // Auto-open main panel on app start
        main_panel_controller.open_or_focus();
    }
});

app.on("window-all-closed", () => {
    // Don't quit — tray keeps app alive
});
