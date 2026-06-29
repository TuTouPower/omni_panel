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
import { createConfigStore } from "./core/config/config-store";
import { auto_seed_connectors } from "./core/config/auto-seed";
import {
    getConfigPath,
    getDataRoot,
    getBundledConnectorsDir,
    getUserConnectorsDir,
    get_tray_icon_path,
    get_app_icon_path,
} from "./core/paths";
import { initLogging, defaultLogLevelForEnv } from "./core/logging";
import { createLogger, setLogLevel } from "../shared/lib/logger";
import { createRuntimeStore } from "./core/scheduler/runtime-store";
import { createSecretsStore } from "./core/config/secrets-store";
import { create_file_vault_backend } from "./core/vault/file-vault-backend";
import { create_session_manager } from "./core/session/session-manager";
import { create_async_observation_store } from "./core/observation/observation-store-async";
import { createRefreshService } from "./core/scheduler/refresh-service";
import { createConnectorScheduler } from "./core/scheduler/connector-scheduler";
import { createSchedulerOrchestrator } from "./core/scheduler/scheduler-orchestrator";
import { hydrate_runtime_store } from "./core/scheduler/hydrate-runtime-store";
import { discover_connector_definitions } from "./core/connector/manifest-loader";
import { registerConnectorIpc } from "./ipc/connector-ipc";
import { registerConfigIpc } from "./ipc/config-ipc";
import { registerEventIpc } from "./ipc/event-ipc";
import { registerAuthIpc, handleCookieLogin, trySilentCookieRefresh } from "./ipc/auth-ipc";
import { registerSessionIpc } from "./ipc/session-ipc";
import { registerLogIpc } from "./ipc/log-ipc";
import { registerPopupIpc } from "./ipc/popup-ipc";
import { parseSizeReport } from "./ipc/size-validation";
import { IPC_CHANNELS } from "../shared/types/ipc";
import { create_main_panel_controller } from "./core/main-panel/main-panel-controller";
import type { MainPanelController } from "./core/main-panel/main-panel-types";
import { cleanup_temp_files } from "./core/storage/write-json";

const process_log = createLogger("process");

// Suppress EPIPE when stdout pipe is closed (e.g. launched from script with broken pipe)
process.on("uncaughtException", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") return;
    process_log.error("Uncaught exception", err);
});

process.on("unhandledRejection", (reason: unknown) => {
    process_log.error(
        "Unhandled promise rejection",
        reason instanceof Error ? reason : String(reason),
    );
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
    const dataRoot = getDataRoot();
    await cleanup_temp_files(dataRoot);
    const cleanupLogging = await initLogging(dataRoot);
    let logging_cleanup_done = false;
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

    const configStore = createConfigStore(configPath);
    const runtimeStore = createRuntimeStore(join(dataRoot, "snapshot-cache.json"));
    await runtimeStore.hydrateFromCache();
    const vault = await create_file_vault_backend(dataRoot);
    const secretsStore = createSecretsStore(vault);
    const observationStore = create_async_observation_store(join(dataRoot, "observations.sqlite"));

    const bundledDir = getBundledConnectorsDir();
    const userDir = getUserConnectorsDir();
    const allDefinitions = await discover_connector_definitions(bundledDir, userDir);
    log.info(`Discovered ${String(allDefinitions.length)} connectors`);

    const config = await configStore.load();
    const { seeded: seededPlugins, changed: seedChanged } = auto_seed_connectors(
        config.plugins,
        allDefinitions,
    );
    if (seededPlugins.length > 0 || seedChanged) {
        await configStore.save({ ...config, plugins: [...config.plugins, ...seededPlugins] });
        if (seededPlugins.length > 0) {
            log.info(`Auto-seeded ${String(seededPlugins.length)} connectors`);
        }
    }

    const currentConfig = await configStore.load();
    let currentConfigSnapshot = currentConfig;
    setLogLevel(currentConfigSnapshot.logLevel ?? defaultLogLevelForEnv());

    function buildSecretParamKeys(cfg: typeof currentConfig): Map<string, ReadonlySet<string>> {
        const map = new Map<string, ReadonlySet<string>>();
        for (const plugin of cfg.plugins) {
            const def = allDefinitions.find((d) => d.executablePath === plugin.executablePath);
            map.set(
                plugin.instanceId,
                new Set(
                    def?.manifest.parameters
                        .filter((param) => param.type === "secret")
                        .map((param) => param.name) ?? [],
                ),
            );
        }
        return map;
    }

    const secretParamKeys = buildSecretParamKeys(currentConfig);

    nativeTheme.themeSource = currentConfig.theme ?? "system";

    const refreshService = createRefreshService({
        definitions: allDefinitions,
        observationStore,
        runtimeStore,
        configStore,
        vault,
        sessionLogin: async (instanceId: string) => {
            // Try silent cookie refresh first (no window popup)
            const silent = await trySilentCookieRefresh(secretsStore, instanceId);
            if (silent) {
                return { saved: true };
            }
            // Fall back to interactive login window
            const result = await handleCookieLogin(
                { configStore, secretsStore, definitions: allDefinitions },
                instanceId,
            );
            if (!result.ok) throw new Error(result.error.message);
            return result.data;
        },
    });

    // Scheduler orchestrator — centralises scheduling, suspend/resume, shutdown
    const scheduler = createConnectorScheduler({
        refresh: (instanceId: string) => refreshService.refresh(instanceId),
    });
    const orchestrator = createSchedulerOrchestrator({ scheduler, configStore });

    let main_panel_controller: MainPanelController | null = null;
    let tray_ref: Tray | null = null;

    // Register IPC handlers
    await registerConnectorIpc({
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
            setLogLevel(updatedConfig.logLevel ?? defaultLogLevelForEnv());
            log.info("Config saved — rebuilding scheduler and secret keys");
            const newKeys = buildSecretParamKeys(updatedConfig);
            secretParamKeys.clear();
            for (const [k, v] of newKeys) {
                secretParamKeys.set(k, v);
            }
            orchestrator.rebuild(updatedConfig);
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
    });

    // Session manager — controlled login window + credential capture
    const sessionManager = create_session_manager({
        vault,
        create_window: (partition) => {
            return new BrowserWindow({
                width: 520,
                height: 720,
                webPreferences: {
                    contextIsolation: true,
                    nodeIntegration: false,
                    sandbox: true,
                    partition,
                },
            });
        },
        create_session: (partition) => {
            const ses = session.fromPartition(partition);
            return {
                on_before_send_headers(handler) {
                    ses.webRequest.onBeforeSendHeaders((details, callback) => {
                        handler({ url: details.url, requestHeaders: details.requestHeaders });
                        callback({ requestHeaders: details.requestHeaders });
                    });
                },
                async get_cookies(url: string) {
                    const cookies = await ses.cookies.get({ url });
                    return cookies.map((c) => ({ name: c.name, value: c.value }));
                },
            };
        },
    });
    await registerSessionIpc({ sessionManager });

    // Window references — shared between tray and E2E mode
    /** Custom tray menu frameless window (replaces native context menu). */
    let trayMenuWin: BrowserWindow | null = null;

    // Settings window singleton
    let settingsWin: BrowserWindow | null = null;

    function save_settings_bounds(): void {
        if (!settingsWin || settingsWin.isDestroyed()) return;
        if (settingsWin.isMinimized() || settingsWin.isMaximized()) return;
        const bounds = settingsWin.getBounds();
        const display = screen.getDisplayMatching(bounds);
        const display_id = String(display.id);
        const saved = {
            x: bounds.x,
            y: bounds.y,
            width: Math.max(480, bounds.width),
            height: Math.max(360, bounds.height),
        };
        currentConfigSnapshot = {
            ...currentConfigSnapshot,
            settingsBounds: { ...saved, displayId: display_id },
        };
        configStore.scheduleSave(currentConfigSnapshot);
    }

    function createOrFocusSettings(): { created: boolean } {
        if (settingsWin && !settingsWin.isDestroyed()) {
            settingsWin.show();
            settingsWin.focus();
            return { created: false };
        }
        const saved = currentConfigSnapshot.settingsBounds;
        if (saved) {
            const displays = screen.getAllDisplays();
            const preferred = screen.getPrimaryDisplay();
            const target_display = saved.displayId
                ? (displays.find((d) => String(d.id) === saved.displayId) ?? preferred)
                : preferred;
            const work = target_display.workArea;
            const width = Math.min(Math.max(480, saved.width), work.width);
            const height = Math.min(Math.max(360, saved.height), work.height);
            const x = Math.max(work.x, Math.min(saved.x, work.x + work.width - width));
            const y = Math.max(work.y, Math.min(saved.y, work.y + work.height - height));
            settingsWin = createWindowFor("settings");
            settingsWin.setBounds({ x, y, width, height });
        } else {
            settingsWin = createWindowFor("settings");
            settingsWin.center();
        }
        settingsWin.on("resize", save_settings_bounds);
        settingsWin.on("move", save_settings_bounds);
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
    ipcMain.handle(IPC_CHANNELS.SETTINGS_MINIMIZE, () => {
        if (settingsWin && !settingsWin.isDestroyed()) settingsWin.minimize();
    });
    ipcMain.handle(IPC_CHANNELS.SETTINGS_MAXIMIZE, () => {
        if (!settingsWin || settingsWin.isDestroyed()) return;
        if (settingsWin.isMaximized()) {
            settingsWin.unmaximize();
        } else {
            settingsWin.maximize();
        }
    });
    ipcMain.handle(IPC_CHANNELS.SETTINGS_CLOSE, () => {
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

    // Hydrate runtime store from observation history for manualRefreshOnly connectors
    await hydrate_runtime_store({
        runtimeStore,
        observationStore,
        connectorConfigs: currentConfig.plugins,
        definitions: allDefinitions,
    });

    // Start periodic refresh for enabled plugins
    orchestrator.startAll(currentConfig);

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
            ipcMain.handle(IPC_CHANNELS.TEST_TRAY_CLICK, () => {
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
                    trayMenuWin.webContents.send(IPC_CHANNELS.TRAY_PAUSE_STATE, is_paused);
                    trayMenuWin.webContents.send(
                        IPC_CHANNELS.TRAY_AUTOSTART_STATE,
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
        ipcMain.handle(IPC_CHANNELS.TRAY_OPEN_PANEL, () => {
            hideTrayMenu();
            tray.emit("click");
        });
        ipcMain.handle(IPC_CHANNELS.TRAY_REFRESH_ALL, () => {
            for (const p of currentConfigSnapshot.plugins) {
                if (p.enabled) void refreshService.refresh(p.instanceId);
            }
        });
        ipcMain.handle(IPC_CHANNELS.TRAY_TOGGLE_PAUSE, () => {
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
        ipcMain.handle(IPC_CHANNELS.TRAY_TOGGLE_AUTOSTART, () => {
            if (!hasLoginItemApi) return;
            const current = app.getLoginItemSettings().openAtLogin;
            app.setLoginItemSettings({ openAtLogin: !current });
            send_tray_state();
        });
        ipcMain.handle(IPC_CHANNELS.TRAY_OPEN_SETTINGS, () => {
            hideTrayMenu();
            createOrFocusSettings();
        });
        ipcMain.handle(IPC_CHANNELS.TRAY_CHECK_UPDATE, () => {
            log.info("Check for updates requested (not yet implemented)");
        });
        ipcMain.handle(IPC_CHANNELS.TRAY_SURVEY, () => {
            log.info("Survey/feedback requested (not yet implemented)");
        });
        ipcMain.handle(IPC_CHANNELS.TRAY_SPONSOR, () => {
            log.info("Sponsor/support author requested (not yet implemented)");
        });
        ipcMain.handle(IPC_CHANNELS.TRAY_QUIT, () => {
            app.quit();
        });
        ipcMain.handle(IPC_CHANNELS.TRAY_RESTART, () => {
            app.relaunch();
            app.quit();
        });
        ipcMain.handle(IPC_CHANNELS.TRAY_HIDE, () => {
            hideTrayMenu();
        });
        ipcMain.handle(IPC_CHANNELS.TRAY_REPORT_MENU_SIZE, (_event, report: unknown) => {
            const parsed = parseSizeReport(report, ["width", "height"], 10000);
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
            // Tray.getBounds() returns zero on Windows; fall back to primary display center
            if (trayBounds.width <= 0 || trayBounds.height <= 0) {
                const primary = screen.getPrimaryDisplay();
                trayBounds.x = primary.workArea.x + primary.workArea.width / 2;
                trayBounds.y = primary.workArea.y + primary.workArea.height / 2;
                trayBounds.width = 0;
                trayBounds.height = 0;
            }
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
        orchestrator.shutdown();
        void runtimeStore.flushPendingCache();
        cleanupEventIpc?.();
        cleanupEventIpc = null;
        cleanupPopupIpc?.();
        cleanupPopupIpc = null;
    });

    app.on("will-quit", (e) => {
        if (configStore.hasPendingSave() || !logging_cleanup_done) {
            e.preventDefault();
            void Promise.all([
                configStore.hasPendingSave() ? configStore.flushPendingSave() : Promise.resolve(),
                logging_cleanup_done
                    ? Promise.resolve()
                    : cleanupLogging().then(() => {
                          logging_cleanup_done = true;
                      }),
            ]).finally(() => {
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
