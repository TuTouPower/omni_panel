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
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import {
    getConfigPath,
    getDataRoot,
    getStatesDir,
    getBundledPluginsDir,
    getUserPluginsDir,
    getPluginCacheDir,
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
import { registerLogIpc } from "./ipc/log-ipc";
import { registerPopupIpc } from "./ipc/popup-ipc";
import { IPC_CHANNELS } from "../shared/types/ipc";
import {
    create_popup_height_controller,
    type PopupHeightController,
    type PopupPlatform,
    type PopupAnchorContext,
    type BoundsLike,
} from "./core/popup/popup-height-controller";
import { discoverPlugins } from "./core/plugin/discovery";
import { compilePlugin } from "./core/plugin/compiler";
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

/**
 * Find the system Node.js binary. Plugins must run under a real Node runtime,
 * not under Electron (ELECTRON_RUN_AS_NODE is unreliable in packaged apps).
 */
function findSystemNode(): string {
    const isWin = process.platform === "win32";
    const nodeCmd = isWin ? "node.exe" : "node";

    // Search PATH for node
    const pathDirs = (process.env["PATH"] ?? "").split(isWin ? ";" : ":");
    for (const dir of pathDirs) {
        const candidate = join(dir, nodeCmd);
        if (existsSync(candidate) && isRealNode(candidate)) return candidate;
    }
    // Fallback: use process.execPath (Electron) — may fail in packaged mode
    return process.execPath;
}

function isRealNode(binPath: string): boolean {
    try {
        const version = execSync(`"${binPath}" --version`, {
            timeout: 5000,
            encoding: "utf8",
            stdio: ["pipe", "pipe", "pipe"],
        }).trim();
        return /^v\d+\.\d+\.\d+/.test(version);
    } catch {
        return false;
    }
}

const SYSTEM_NODE = findSystemNode();

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
}

const WINDOW_CONFIGS: Record<string, WindowConfig> = {
    popup: { route: "popup", width: 460, height: 480, frame: false, show: false },
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
        width: 184,
        height: 340,
        frame: false,
        show: false,
    },
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
    const log = createLogger("main");
    log.info(`Creating window: ${key} (${String(cfg.width)}x${String(cfg.height)})`);
    const win = new BrowserWindow({
        width: cfg.width,
        height: cfg.height,
        frame: cfg.frame ?? true,
        show: cfg.show ?? true,
        autoHideMenuBar: cfg.autoHideMenuBar ?? false,
        ...(cfg.titleBarStyle !== undefined && { titleBarStyle: cfg.titleBarStyle }),
        ...(cfg.titleBarOverlay !== undefined && { titleBarOverlay: cfg.titleBarOverlay }),
        ...(cfg.roundedCorners !== undefined && { roundedCorners: cfg.roundedCorners }),
        icon: get_app_icon_path(),
        webPreferences: {
            ...SECURE_WEB_PREFS,
            preload: getPreloadPath(),
        },
    });
    if (cfg.autoHideMenuBar) {
        win.setMenuBarVisibility(false);
    }
    void win.loadURL(getRendererUrl(cfg.route));
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
    const devServerUrl = process.env["MAIN_WINDOW_VITE_DEV_SERVER_URL"];
    const devOrigin = devServerUrl ? new URL(devServerUrl).origin : null;
    const cspScriptSrc = devOrigin ? `'self' ${devOrigin} 'unsafe-eval'` : "'self'";
    const cspConnectSrc = devOrigin ? `'self' ${devOrigin} ws:` : "'self'";
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                "Content-Security-Policy": [
                    `default-src 'self'; script-src ${cspScriptSrc}; style-src 'self' 'unsafe-inline'; connect-src ${cspConnectSrc};`,
                ],
            },
        });
    });
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

    // Compile TS plugins to JS
    const cacheDir = getPluginCacheDir();
    const sdkDir = getSdkDir();
    const compiledPaths = new Map<string, string>();

    for (const def of allDefinitions) {
        const result = await compilePlugin(def, cacheDir, sdkDir);
        if (result.executablePath) {
            compiledPaths.set(def.executablePath, result.executablePath);
            if (result.status === "stale_cache") {
                log.warn(`Plugin ${def.scriptName} using stale cache: ${result.error}`);
            }
        } else if (result.status === "compile_error") {
            log.warn(`Plugin ${def.scriptName} failed to compile: ${result.error}`);
        }
    }

    // Build command using system Node (not Electron)
    const buildCommand = (
        executablePath: string,
        parameterValues: Record<string, string>,
        language: "zh-Hans" | "en",
    ) => {
        const compiledPath = compiledPaths.get(executablePath) ?? executablePath;
        return buildPluginCommand(compiledPath, parameterValues, language, SYSTEM_NODE);
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
        const plugin = currentConfig.plugins.find((p) => p.instanceId === instanceId);
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
            log.info("Config saved — rebuilding scheduler and secret keys");
            const newKeys = buildSecretParamKeys(updatedConfig);
            secretParamKeys.clear();
            for (const [k, v] of newKeys) {
                secretParamKeys.set(k, v);
            }
            orchestrator.rebuild(updatedConfig);
        },
    });
    await registerLogIpc();
    cleanupEventIpc = registerEventIpc({ runtimeStore });

    // Window references — shared between tray and E2E mode
    let popupWin: BrowserWindow | null = null;
    /** Custom tray menu frameless window (replaces native context menu). */
    let trayMenuWin: BrowserWindow | null = null;

    // Settings window singleton
    let settingsWin: BrowserWindow | null = null;

    function createOrFocusSettings(): void {
        if (settingsWin && !settingsWin.isDestroyed()) {
            settingsWin.show();
            settingsWin.focus();
            return;
        }
        settingsWin = createWindowFor("settings");
        settingsWin.center();
        settingsWin.on("closed", () => {
            settingsWin = null;
        });
    }

    // Register IPC handler for opening settings from renderer
    ipcMain.handle(IPC_CHANNELS.SETTINGS_OPEN, () => {
        createOrFocusSettings();
    });

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

    // Popup height controller (Phase 20). Renderer reports content height;
    // controller applies clamped, debounced resizes to the BrowserWindow.
    let popup_controller: PopupHeightController | null = null;
    const popup_anchor_state: {
        tray_bounds: BoundsLike | null;
        user_moved: boolean;
        // Set while controller-driven setBounds is in flight so the
        // `move` event handler does not mistake it for a user drag.
        suppress_move: boolean;
    } = {
        tray_bounds: null,
        user_moved: false,
        suppress_move: false,
    };

    const popup_platform: PopupPlatform =
        process.platform === "darwin" ? "darwin" : process.platform === "win32" ? "win32" : "linux";

    function build_popup_controller(win: BrowserWindow): PopupHeightController {
        return create_popup_height_controller({
            platform: popup_platform,
            get_window: () => {
                if (win.isDestroyed()) return null;
                return {
                    isDestroyed: () => win.isDestroyed(),
                    getBounds: () => win.getBounds(),
                    setBounds: (bounds) => {
                        popup_anchor_state.suppress_move = true;
                        try {
                            win.setBounds(bounds);
                        } finally {
                            // BrowserWindow.setBounds can emit `move`
                            // asynchronously on some platforms; release the
                            // flag on the next tick so the immediately
                            // following move event is still suppressed.
                            setImmediate(() => {
                                popup_anchor_state.suppress_move = false;
                            });
                        }
                    },
                };
            },
            get_display_for_window: () => {
                const bounds = win.getBounds();
                return screen.getDisplayMatching(bounds);
            },
            get_anchor: (): PopupAnchorContext => ({
                tray_bounds: popup_anchor_state.tray_bounds,
                user_moved: popup_anchor_state.user_moved,
            }),
        });
    }

    cleanupPopupIpc = registerPopupIpc({
        get_controller: () => popup_controller,
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
            for (const p of currentConfig.plugins) {
                if (p.enabled) void refreshService.refresh(p.instanceId);
            }
        });
        ipcMain.handle("tray:togglePause", () => {
            is_paused = !is_paused;
            if (is_paused) {
                orchestrator.suspend();
            } else {
                orchestrator.resume();
                orchestrator.rebuild(currentConfig);
                orchestrator.startAll(currentConfig);
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
        ipcMain.handle("tray:hide", () => {
            hideTrayMenu();
        });

        // Click → toggle popup (left-click)
        tray.on("click", () => {
            // Hide tray menu if visible
            if (trayMenuWin && !trayMenuWin.isDestroyed() && trayMenuWin.isVisible()) {
                trayMenuWin.removeListener("blur", hideTrayMenu);
                trayMenuWin.hide();
            }

            log.info(
                `[tray] click handler fired, popupWin exists: ${popupWin ? "true" : "false"}, destroyed: ${String(popupWin?.isDestroyed())}`,
            );
            if (popupWin && !popupWin.isDestroyed()) {
                popupWin.close();
                popupWin = null;
                popup_controller = null;
                log.info("[tray] closed popup");
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
            const popupWidth = popupCfg?.width ?? 460;
            const popupHeight = popupCfg?.height ?? 480;
            const x = Math.round(trayBounds.x + trayBounds.width / 2 - popupWidth / 2);
            const y = Math.round(trayBounds.y + trayBounds.height + 4);
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
            popupWin.focus();

            // Initialise Phase 20 height controller for this popup session.
            popup_anchor_state.tray_bounds =
                trayBounds.width > 0 && trayBounds.height > 0 ? trayBounds : null;
            popup_anchor_state.user_moved = false;
            popup_controller = build_popup_controller(popupWin);

            // Track user-initiated moves so subsequent resizes don't snap back to tray.
            popupWin.on("move", () => {
                if (popup_anchor_state.suppress_move) return;
                popup_anchor_state.user_moved = true;
            });

            popupWin.on("closed", () => {
                popupWin = null;
                popup_controller = null;
                popup_anchor_state.tray_bounds = null;
                popup_anchor_state.user_moved = false;
                popup_anchor_state.suppress_move = false;
            });
        });

        // Right-click → show custom tray menu
        tray.on("right-click", () => {
            // Hide popup if open
            if (popupWin && !popupWin.isDestroyed()) {
                popupWin.close();
                popupWin = null;
                popup_controller = null;
            }

            if (!trayMenuWin || trayMenuWin.isDestroyed()) return;

            const trayBounds = tray.getBounds();
            const display = screen.getDisplayNearestPoint({
                x: trayBounds.x + trayBounds.width / 2,
                y: trayBounds.y + trayBounds.height / 2,
            });
            const menuWidth = trayMenuCfg?.width ?? 184;
            const menuHeight = trayMenuCfg?.height ?? 340;

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

    // In E2E mode, auto-open popup so tests don't need tray interaction
    if (process.env["E2E"] === "1") {
        log.info("E2E mode: auto-opening popup");
        popupWin = createWindowFor("popup");
        popup_anchor_state.tray_bounds = null;
        popup_anchor_state.user_moved = false;
        popup_controller = build_popup_controller(popupWin);
        popupWin.on("move", () => {
            if (popup_anchor_state.suppress_move) return;
            popup_anchor_state.user_moved = true;
        });
        popupWin.on("closed", () => {
            popupWin = null;
            popup_controller = null;
            popup_anchor_state.tray_bounds = null;
            popup_anchor_state.user_moved = false;
            popup_anchor_state.suppress_move = false;
        });
    }
});

app.on("window-all-closed", () => {
    // Don't quit — tray keeps app alive
});
