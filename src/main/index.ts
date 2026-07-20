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
    shell,
} from "electron";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { createConfigStore } from "./core/config/config-store";
import { auto_seed_connectors } from "./core/config/auto-seed";
import {
    getConfigPath,
    getDataRoot,
    getBundledConnectorsDir,
    getUserConnectorsDir,
    get_tray_icon_path,
    get_app_icon_path,
    get_observations_db_path,
    get_token_stats_db_path,
    get_snapshot_cache_path,
} from "./core/paths";
import { initLogging, defaultLogLevelForEnv } from "./core/logging";
import { createLogger, setLogLevel } from "../shared/lib/logger";
import { createRuntimeStore } from "./core/scheduler/runtime-store";
import { createSecretsStore } from "./core/config/secrets-store";
import { create_file_vault_backend } from "./core/vault/file-vault-backend";
import { create_session_manager } from "./core/session/session-manager";
import { create_observation_store } from "./core/observation/observation-store";
import { createRefreshService } from "./core/scheduler/refresh-service";
import { createConnectorScheduler } from "./core/scheduler/connector-scheduler";
import { decide_settings_close } from "./core/settings-close-action";
import { createWindowManager, WINDOW_CONFIGS, SECURE_WEB_PREFS } from "./window/window-manager";
import {
    createSchedulerOrchestrator,
    to_connector_list_config,
} from "./core/scheduler/scheduler-orchestrator";
import { hydrate_runtime_store } from "./core/scheduler/hydrate-runtime-store";
import { discover_connector_definitions } from "./core/connector/manifest-loader";
import { init_global_network } from "./core/connector/net-client";
import { build_csp_header } from "./security/csp";
import { registerConnectorIpc } from "./ipc/connector-ipc";
import { registerConfigIpc } from "./ipc/config-ipc";
import { registerEventIpc } from "./ipc/event-ipc";
import { registerAuthIpc, handleCookieLogin, trySilentCookieRefresh } from "./ipc/auth-ipc";
import { registerGrokAuthIpc } from "./ipc/grok_auth_ipc";
import { registerTokenStatsIpc } from "./ipc/token-stats-ipc";
import { registerTrendIpc } from "./ipc/trend-ipc";
import { create_token_stats_store } from "./core/token-stats/token-stats-store";
import { create_token_stats_manager } from "./core/token-stats/manager";
import { create_local_api_server } from "./core/local-api/server";
import type { LocalAPIServer } from "./core/local-api/server";
import type { AppConfiguration } from "../shared/types/config";
import type { TokenStatsConfig } from "../shared/types/token-stats";
import { registerSessionIpc } from "./ipc/session-ipc";
import { create_grok_oauth_manager } from "./core/auth/grok_oauth_manager";
import { resolve_effective_proxy_url } from "./core/network/effective_proxy";
import { close_all_proxy_agents } from "./core/network/proxy-pool";
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

function getPreloadPath(): string {
    return join(__dirname, "../preload/index.js");
}

const windowManager = createWindowManager({
    getPreloadPath,
    getIconPath: get_app_icon_path,
    rendererIndexPath: resolve(join(__dirname, "../renderer/index.html")),
});

let cleanupEventIpc: (() => void) | null = null;
let cleanupPopupIpc: (() => void) | null = null;

void app.whenReady().then(async () => {
    try {
        const dataRoot = getDataRoot();
        await cleanup_temp_files(dataRoot);
        const cleanupLogging = await initLogging(dataRoot);
        let logging_cleanup_done = false;
        const log = createLogger("main");

        log.info("Application starting");

        // 全局连接池：每 origin 连接上限 + keepAlive 复用，消除并发 TLS 握手风暴
        init_global_network();

        // CSP programmatically. dev 放开 'unsafe-inline' 让 @vitejs/plugin-react 的
        // React Refresh preamble（inline <script>）能注入；prod 保持最严格 'self'。
        // 实现见 src/main/security/csp.ts（纯函数 + 单测，防回退）。
        const devServerUrl = process.env["ELECTRON_RENDERER_URL"];
        const devOrigin = devServerUrl ? new URL(devServerUrl).origin : null;
        const devHost = devServerUrl ? new URL(devServerUrl).host : null;
        const csp_header = build_csp_header(devOrigin, devHost);
        session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
            callback({
                responseHeaders: {
                    ...details.responseHeaders,
                    "Content-Security-Policy": [csp_header],
                },
            });
        });
        const configPath = getConfigPath();

        const configStore = createConfigStore(configPath);
        const runtimeStore = createRuntimeStore(get_snapshot_cache_path());
        await runtimeStore.hydrateFromCache();
        const vault = await create_file_vault_backend(dataRoot);
        const secretsStore = createSecretsStore(vault);
        const observationStore = create_observation_store(get_observations_db_path());

        const bundledDir = getBundledConnectorsDir();
        const userDir = getUserConnectorsDir();
        const allDefinitions = await discover_connector_definitions(bundledDir, userDir);
        log.info(`Discovered ${String(allDefinitions.length)} connectors`);

        const config = await configStore.load();
        const { seeded: seededPlugins, updatedExisting } = auto_seed_connectors(
            config.plugins,
            allDefinitions,
        );
        if (seededPlugins.length > 0 || updatedExisting.length > 0) {
            const updatedById = new Map(updatedExisting.map((p) => [p.instanceId, p]));
            const mergedPlugins = config.plugins.map((p) => updatedById.get(p.instanceId) ?? p);
            await configStore.save({
                ...config,
                plugins: [...mergedPlugins, ...seededPlugins],
            });
            if (seededPlugins.length > 0) {
                log.info(`Auto-seeded ${String(seededPlugins.length)} connectors`);
            }
        }

        const currentConfig = await configStore.load();
        setLogLevel(currentConfig.logLevel ?? defaultLogLevelForEnv());

        // Resolve system proxy for OAuth and connector HTTP requests.
        // If the user hasn't configured a proxy in settings, fall back to the
        // system proxy (e.g., Windows Internet Settings proxy at 127.0.0.1:7890).
        // Re-run on every config save so toggling a system proxy (Clash on/off)
        // takes effect without an app restart (D12).
        const detect_system_proxy = async (): Promise<string | undefined> => {
            try {
                const proxyInfo = await session.defaultSession.resolveProxy("https://auth.x.ai");
                const match = /PROXY\s+([^\s;]+)/.exec(proxyInfo);
                if (match?.[1]) {
                    const proxy = `http://${match[1]}`;
                    log.info(`Detected system proxy: ${proxy}`);
                    return proxy;
                }
            } catch {
                // resolveProxy not available or failed — continue without proxy
            }
            return undefined;
        };
        let detected_system_proxy = await detect_system_proxy();
        let currentConfigSnapshot = currentConfig;

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

        // Grok OAuth manager — device-code login + scheduled token refresh.
        // Read the current config for every request so proxy changes apply immediately.
        const grokOAuthManager = create_grok_oauth_manager({
            vault,
            get_proxy_url: () =>
                resolve_effective_proxy_url(
                    currentConfigSnapshot.proxy?.url,
                    detected_system_proxy,
                ),
        });

        const refreshService = createRefreshService({
            definitions: allDefinitions,
            observationStore,
            runtimeStore,
            configStore,
            vault,
            resolve_proxy_url: (config) =>
                resolve_effective_proxy_url(config.proxy?.url, detected_system_proxy),
            sessionLogin: async (instanceId: string) => {
                // Try silent cookie refresh first (no window popup).
                // trySilentCookieRefresh 内部从 definitions + config 查 provider 与 cookieNames。
                const silent = await trySilentCookieRefresh(
                    { configStore, secretsStore, definitions: allDefinitions, sessionManager },
                    instanceId,
                );
                if (silent) {
                    return { saved: true };
                }
                // Fall back to interactive login window
                const result = await handleCookieLogin(
                    { configStore, secretsStore, definitions: allDefinitions, sessionManager },
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

        // Token stats: store + manager (subprocess-based collection)
        const tokenStatsStore = create_token_stats_store(get_token_stats_db_path());
        const tokenStatsManager = create_token_stats_manager({
            store: tokenStatsStore,
            on_update: () => {
                // Broadcast to all windows that token stats were updated
                BrowserWindow.getAllWindows().forEach((win) => {
                    if (!win.isDestroyed()) {
                        win.webContents.send(IPC_CHANNELS.TOKEN_STATS_UPDATED);
                    }
                });
            },
        });
        const build_token_stats_config = (cfg: typeof currentConfigSnapshot): TokenStatsConfig => ({
            win_home: homedir(),
            // WSL 默认开启：无 WSL 的机器上 UNC 读取会静默失败（reader 已容错）
            wsl_enabled: cfg.tokenStats?.wslEnabled ?? true,
            wsl_distro: cfg.tokenStats?.wslDistro ?? "Ubuntu-22.04",
            wsl_user: cfg.tokenStats?.wslUser ?? "", // 空 = collector 自动探测
            poll_interval_ms: (cfg.tokenStats?.pollIntervalMinutes ?? 10) * 60_000,
        });
        tokenStatsManager.start(build_token_stats_config(currentConfigSnapshot));

        // Register IPC handlers
        await registerConnectorIpc({
            configStore,
            runtimeStore,
            refreshService,
            definitions: allDefinitions,
        });
        registerTokenStatsIpc(ipcMain, { store: tokenStatsStore, manager: tokenStatsManager });
        registerTrendIpc(ipcMain, { store: observationStore });
        const onConfigSaved = (updatedConfig: AppConfiguration): void => {
            const previousConfig = currentConfigSnapshot;
            currentConfigSnapshot = updatedConfig;
            setLogLevel(updatedConfig.logLevel ?? defaultLogLevelForEnv());
            log.info("Config saved — reconciling scheduler and secret keys");
            const newKeys = buildSecretParamKeys(updatedConfig);
            secretParamKeys.clear();
            for (const [k, v] of newKeys) {
                secretParamKeys.set(k, v);
            }
            orchestrator.reconcile(
                to_connector_list_config(previousConfig),
                to_connector_list_config(updatedConfig),
            );
            const grokDef = allDefinitions.find((d) => d.manifest.provider === "grok");
            const active_grok_instance_ids = grokDef
                ? updatedConfig.plugins
                      .filter(
                          (plugin) =>
                              plugin.enabled && plugin.executablePath === grokDef.executablePath,
                      )
                      .map((plugin) => plugin.instanceId)
                : [];
            grokOAuthManager.reconcile_auto_refresh(active_grok_instance_ids);
            // Update token stats config if changed
            tokenStatsManager.update_config(build_token_stats_config(updatedConfig));
            // Re-detect system proxy (D12): a config save is a reasonable hook for
            // "the user may have just toggled their system proxy".
            void detect_system_proxy().then((proxy) => {
                detected_system_proxy = proxy;
            });
            for (const win of BrowserWindow.getAllWindows()) {
                if (!win.isDestroyed()) {
                    win.webContents.send(IPC_CHANNELS.CONFIG_CHANGED, updatedConfig);
                }
            }
            main_panel_controller?.apply_config_change();
        };

        await registerConfigIpc({
            configStore,
            secretsStore,
            secretParamKeys,
            onConfigSaved,
        });

        // Local HTTP API: serves the web panel UI + observation ingest.
        const web_root_path = app.isPackaged
            ? join(process.resourcesPath, "web")
            : join(app.getAppPath(), "out", "web");
        const local_api: LocalAPIServer = create_local_api_server(observationStore, {
            token_stats_store: tokenStatsStore,
            config_deps: { configStore, secretsStore, secretParamKeys, onConfigSaved },
            connector_deps: {
                configStore,
                runtimeStore,
                refreshService,
                definitions: allDefinitions,
            },
            ...(existsSync(web_root_path) ? { web_root: web_root_path } : {}),
        });
        await local_api.start();
        log.info(`Web panel: http://localhost:${String(local_api.get_port())}/v1/health`);
        await registerLogIpc(dataRoot);
        cleanupEventIpc = registerEventIpc({ runtimeStore });
        registerGrokAuthIpc({ manager: grokOAuthManager });

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
        registerAuthIpc({
            configStore,
            secretsStore,
            definitions: allDefinitions,
            sessionManager,
        });

        // Window references — shared between tray and E2E mode
        /** Custom tray menu frameless window (replaces native context menu). */
        let trayMenuWin: BrowserWindow | null = null;

        // Settings window singleton
        let settingsWin: BrowserWindow | null = null;
        // True once shutdown begins: settings then destroys instead of hiding.
        let quitting = false;
        // Whether saved bounds have been applied since the settings window was
        // (re)created. Apply only on first show, then keep user moves across reopens.
        let settings_bounds_applied = false;

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

        function apply_settings_bounds(win: BrowserWindow): void {
            const saved = currentConfigSnapshot.settingsBounds;
            if (!saved) {
                win.center();
                return;
            }
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
            win.setBounds({ x, y, width, height });
        }

        // Create the hidden, pre-loaded settings window (idempotent). Kept alive
        // for the session so reopening just reveals an already-painted dark window
        // and skips the fresh-window show animation that flashes white on Windows.
        function ensure_settings_window(): void {
            if (settingsWin && !settingsWin.isDestroyed()) return;
            // load:false -> createWindowFor neither loads nor wires ready-to-show,
            // so the window stays hidden (show:false) while we pre-load it below.
            settingsWin = windowManager.createWindowFor("setting", { load: false });
            void settingsWin
                .loadURL(windowManager.getRendererUrl("setting"))
                .catch((err: unknown) => {
                    log.error(
                        `settings loadURL failed: ${err instanceof Error ? err.message : String(err)}`,
                    );
                });
            settingsWin.on("resize", save_settings_bounds);
            settingsWin.on("move", save_settings_bounds);
            // Hide instead of destroy on close (unless quitting) so the window
            // persists across opens.
            settingsWin.on("close", (event) => {
                if (decide_settings_close(quitting) === "hide") {
                    event.preventDefault();
                    settingsWin?.hide();
                }
            });
            settings_bounds_applied = false;
        }

        function createOrFocusSettings(): { created: boolean } {
            ensure_settings_window();
            const win = settingsWin;
            if (!win || win.isDestroyed()) return { created: false };
            if (!settings_bounds_applied) {
                apply_settings_bounds(win);
                settings_bounds_applied = true;
            }
            win.show();
            win.focus();
            return { created: true };
        }

        // Register IPC handler for opening settings from renderer
        ipcMain.handle(
            IPC_CHANNELS.SETTINGS_OPEN,
            (_event, context?: { instanceId?: string; provider?: string; accountId?: string }) => {
                createOrFocusSettings();
                if (!context || !settingsWin || settingsWin.isDestroyed()) return;
                const win = settingsWin;
                const wc = win.webContents;
                const send_navigate = () => {
                    if (!win.isDestroyed()) wc.send(IPC_CHANNELS.SETTINGS_NAVIGATE, context);
                };
                // The window may be pre-warmed (already loaded) or freshly created
                // (still loading). Send once it's ready either way.
                if (wc.isLoading()) {
                    wc.once("did-finish-load", send_navigate);
                } else {
                    send_navigate();
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
            process.platform === "darwin"
                ? "darwin"
                : process.platform === "win32"
                  ? "win32"
                  : "linux";

        main_panel_controller = create_main_panel_controller({
            platform: main_panel_platform,
            get_config: () => currentConfigSnapshot,
            save_config: (next) => {
                currentConfigSnapshot = next;
                configStore.scheduleSave(next);
            },
            create_window: () => windowManager.createWindowFor("usage", { load: false }),
            get_renderer_url: (route: string) => windowManager.getRendererUrl(route),
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

        // Open main panel BEFORE pre-warming settings so popup is the first window.
        // This matters for Playwright E2E tests which expect firstWindow() = popup.
        main_panel_controller.open_or_focus();

        // Pre-warm the settings window (hidden + loaded) so opening it later just
        // reveals an already-painted dark window, avoiding the fresh-window show
        // animation that flashes white on Windows.
        // Skip in E2E mode — tests expect settings.open() to emit a "window" event.
        if (process.env["E2E"] !== "1") {
            ensure_settings_window();
        }

        // Hydrate runtime store from observation history for manualRefreshOnly connectors
        hydrate_runtime_store({
            runtimeStore,
            observationStore,
            connectorConfigs: currentConfig.plugins,
            definitions: allDefinitions,
        });

        // Start periodic refresh for enabled plugins
        orchestrator.startAll(to_connector_list_config(currentConfig));

        // Start OAuth auto-refresh for enabled grok connector instances. The manager
        // gracefully skips instances without stored tokens.
        {
            const grokDef = allDefinitions.find((d) => d.manifest.provider === "grok");
            const active_grok_instance_ids = grokDef
                ? currentConfig.plugins
                      .filter(
                          (plugin) =>
                              plugin.enabled && plugin.executablePath === grokDef.executablePath,
                      )
                      .map((plugin) => plugin.instanceId)
                : [];
            grokOAuthManager.reconcile_auto_refresh(active_grok_instance_ids);
        }

        // Sleep/wake handling
        powerMonitor.on("suspend", () => {
            log.info("System suspending — stopping all schedulers");
            orchestrator.suspend("system");
        });

        powerMonitor.on("resume", () => {
            log.info("System resumed — restarting schedulers");
            orchestrator.resume("system");
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
            void trayMenuWin.loadURL(windowManager.getRendererUrl("tray")).catch((err: unknown) => {
                log.error(
                    `tray loadURL failed: ${err instanceof Error ? err.message : String(err)}`,
                );
            });

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
                void refreshService.refreshAll().catch((err: unknown) => {
                    log.error(
                        `tray refresh-all failed: ${err instanceof Error ? err.message : String(err)}`,
                    );
                });
            });
            ipcMain.handle(IPC_CHANNELS.TRAY_TOGGLE_PAUSE, () => {
                is_paused = !is_paused;
                if (is_paused) {
                    orchestrator.suspend("user");
                } else {
                    // resume() reloads config and startAll()s (which refreshes
                    // immediately). The previous rebuild()+startAll() here restarted
                    // every connector twice and desynced from the orchestrator's own
                    // suspend/resume generation — dropped.
                    orchestrator.resume("user");
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
            ipcMain.handle(IPC_CHANNELS.TOKEN_STATS_OPEN, () => {
                hideTrayMenu();
                const win = windowManager.createWindowFor("agent");
                win.show();
                win.focus();
            });
            ipcMain.handle(IPC_CHANNELS.TRAY_OPEN_WEB, () => {
                void shell.openExternal(`http://localhost:${String(local_api.get_port())}/`);
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

                // Copy the bounds - Electron doesn't guarantee getBounds() returns a
                // fresh object, so don't mutate the return value in place (A19).
                const trayBounds = { ...tray.getBounds() };
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
            quitting = true;
            void local_api.stop();
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
            grokOAuthManager.shutdown();
            void close_all_proxy_agents();
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
                    configStore.hasPendingSave()
                        ? configStore.flushPendingSave()
                        : Promise.resolve(),
                    runtimeStore.flushPendingCache(),
                    logging_cleanup_done
                        ? Promise.resolve()
                        : cleanupLogging().then(() => {
                              logging_cleanup_done = true;
                          }),
                ])
                    .catch((err: unknown) => {
                        log.error(
                            `shutdown flush failed: ${err instanceof Error ? err.message : String(err)}`,
                        );
                    })
                    .finally(() => {
                        app.quit();
                    });
            }
        });

        // Main panel already opened earlier (before settings pre-warm)
    } catch (err: unknown) {
        // D4: any startup failure (vault init, SQLite open, connector discovery,
        // config load, local API start) used to escape as an unhandledRejection and
        // leave a half-started app running with no window/tray/IPC. Surface the
        // error to the user and exit explicitly.
        const logger = createLogger("main");
        logger.error("Startup failed - aborting", err);
        try {
            const { dialog } = await import("electron");
            dialog.showErrorBox(
                "OmniUsage 启动失败",
                `应用启动遇到错误：\n${err instanceof Error ? err.message : String(err)}\n\n请查看日志后重试。`,
            );
        } catch {
            // dialog not available — nothing more we can do
        }
        app.exit(1);
    }
});

app.on("window-all-closed", () => {
    // Don't quit — tray keeps app alive
});
