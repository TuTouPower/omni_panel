import { BrowserWindow, nativeTheme } from "electron";
import { createLogger } from "../../shared/lib/logger";

const log = createLogger("window-manager");

export const SECURE_WEB_PREFS = {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
} as const;

export interface WindowConfig {
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
    showWhenReady?: boolean;
}

export const WINDOW_CONFIGS: Record<string, WindowConfig> = {
    usage: {
        route: "usage",
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
        show: false,
        showWhenReady: true,
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
    agent: {
        route: "agent",
        width: 900,
        height: 700,
        frame: true,
        show: false,
        showWhenReady: true,
        roundedCorners: true,
    },
};

export interface WindowManager {
    createWindowFor(key: string, options?: { load?: boolean }): BrowserWindow;
    getRendererUrl(route: string): string;
}

/**
 * Owns the window catalogue, the renderer-URL theme plumbing, and the
 * BrowserWindow factory. Extracted from index.ts so the "what windows exist
 * and how they are created" knowledge has its own module + interface instead
 * of living inside the app's giant ready-closure.
 *
 * Preload path and icon path are passed in (they are app-path helpers that
 * depend on the app root, not on window logic) to avoid __dirname coupling.
 */
export function createWindowManager(opts: {
    getPreloadPath: () => string;
    getIconPath: () => string;
    /** Absolute filesystem path to the built renderer index.html. Passed in
     * because its resolution depends on the app root, not window logic. */
    rendererIndexPath: string;
}): WindowManager {
    function getRendererUrl(route: string): string {
        const theme = nativeTheme.shouldUseDarkColors ? "dark" : "light";
        const devServerUrl = process.env["ELECTRON_RENDERER_URL"];
        if (devServerUrl) {
            return `${devServerUrl}?ou_theme=${theme}#${route}`;
        }
        return `file://${opts.rendererIndexPath}?ou_theme=${theme}#${route}`;
    }

    function createWindowFor(key: string, options: { load?: boolean } = {}): BrowserWindow {
        const cfg = WINDOW_CONFIGS[key];
        if (!cfg) throw new Error(`Unknown window: ${key}`);
        log.info(`Creating window: ${key} (${String(cfg.width)}x${String(cfg.height)})`);
        log.debug(
            `Window ${key} theme: shouldUseDarkColors=${String(nativeTheme.shouldUseDarkColors)}, themeSource=${nativeTheme.themeSource}`,
        );
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
            icon: opts.getIconPath(),
            backgroundColor: nativeTheme.shouldUseDarkColors ? "#181b22" : "#ffffff",
            webPreferences: {
                ...SECURE_WEB_PREFS,
                preload: opts.getPreloadPath(),
            },
        });
        if (process.platform === "win32") {
            win.setAppDetails({ appId: "omni-usage" });
        }
        if (cfg.autoHideMenuBar) {
            win.setMenuBarVisibility(false);
        }
        if (options.load !== false) {
            void win.loadURL(getRendererUrl(cfg.route)).catch((err: unknown) => {
                log.error(
                    `loadURL failed for ${key}: ${err instanceof Error ? err.message : String(err)}`,
                );
            });
        }
        if (cfg.showWhenReady && options.load !== false) {
            win.once("ready-to-show", () => {
                if (!win.isDestroyed()) win.show();
            });
        }
        win.on("closed", () => {
            log.info(`Window closed: ${key}`);
        });
        return win;
    }

    return { createWindowFor, getRendererUrl };
}
