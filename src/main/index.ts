import { app, BrowserWindow, Tray, Menu, nativeImage, screen, powerMonitor } from "electron";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
    getConfigPath,
    getDataRoot,
    getStatesDir,
    getBundledPluginsDir,
    getUserPluginsDir,
    getPluginCacheDir,
    getSdkDir,
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
import { createSchedulerOrchestrator } from "./core/scheduler/scheduler-orchestrator";
import { executePlugin } from "./core/plugin/runner";
import { parsePluginResult } from "./core/plugin/output-parser";
import { buildPluginCommand } from "./core/plugin/command-builder";
import { registerPluginIpc } from "./ipc/plugin-ipc";
import { registerConfigIpc } from "./ipc/config-ipc";
import { registerEventIpc } from "./ipc/event-ipc";
import { registerLogIpc } from "./ipc/log-ipc";
import { discoverPlugins } from "./core/plugin/discovery";
import { compilePlugin } from "./core/plugin/compiler";
import type { PluginConfiguration } from "../shared/types/config";
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
    const log = createLogger("main");
    log.info(`Creating window: ${key} (${String(cfg.width)}x${String(cfg.height)})`);
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
    win.on("closed", () => {
        log.info(`Window closed: ${key}`);
    });
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

    // Build command builder using Electron's Node runtime
    const buildCommand = (
        executablePath: string,
        parameterValues: Record<string, string>,
        language: "zh-Hans" | "en",
    ) => {
        const compiledPath = compiledPaths.get(executablePath) ?? executablePath;
        return buildPluginCommand(compiledPath, parameterValues, language, process.execPath);
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
                    existing.executablePath = def.executablePath;
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
            };
        });
        await configStore.save({ ...config, plugins: [...config.plugins, ...seededPlugins] });
        log.info(
            `Auto-seeded ${String(seededPlugins.length)} plugins: ${seededPlugins.map((p) => p.name).join(", ")}`,
        );
    }

    // Reload config after potential seeding
    const currentConfig = await configStore.load();

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

    // Window references — shared between tray and E2E mode
    let popupWin: BrowserWindow | null = null;
    let settingsWin: BrowserWindow | null = null;

    // System tray — skip in E2E mode (tray may crash in headless/CI)
    if (process.env["E2E"] !== "1") {
        const trayIcon = nativeImage
            .createFromPath(get_tray_icon_path())
            .resize({ width: 16, height: 16 });
        if (trayIcon.isEmpty()) {
            log.warn("Tray icon loaded as empty image");
        }
        const tray = new Tray(trayIcon);
        tray.setToolTip("OmniUsage");
        log.info("System tray created");

        // Left-click → toggle popup (usage view)
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

        // Right-click → context menu
        const language = currentConfig.language;
        const labels =
            language === "zh-Hans"
                ? { settings: "设置", quit: "退出" }
                : { settings: "Settings", quit: "Quit" };
        tray.setContextMenu(
            Menu.buildFromTemplate([
                {
                    label: labels.settings,
                    click: () => {
                        if (settingsWin && !settingsWin.isDestroyed()) {
                            settingsWin.focus();
                            return;
                        }
                        settingsWin = createWindowFor("settings");
                        settingsWin.on("closed", () => {
                            settingsWin = null;
                        });
                    },
                },
                { type: "separator" },
                {
                    label: labels.quit,
                    click: () => {
                        app.quit();
                    },
                },
            ]),
        );
    } // end of E2E !== "1" tray block

    app.on("before-quit", () => {
        log.info("Application shutting down");
        void configStore.flushPendingSave();
        orchestrator.shutdown();
        cleanupEventIpc?.();
        cleanupEventIpc = null;
    });

    // In E2E mode, auto-open popup so tests don't need tray interaction
    if (process.env["E2E"] === "1") {
        log.info("E2E mode: auto-opening popup");
        popupWin = createWindowFor("popup");
    }
});

app.on("window-all-closed", () => {
    // Don't quit — tray keeps app alive
});
