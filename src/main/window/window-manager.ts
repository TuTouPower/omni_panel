import { BrowserWindow, nativeTheme, shell } from "electron";
import { createLogger } from "../../shared/lib/logger";
import { is_e2e_headless } from "../e2e-headless";

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
    minHeight?: number;
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
    },
    setting: {
        route: "setting",
        width: 820,
        height: 660,
        frame: false,
        show: false,
        showWhenReady: true,
        titleBarStyle: "hidden",
        titleBarOverlay: false,
        roundedCorners: true,
        minWidth: 480,
        minHeight: 360,
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
        frame: false,
        show: false,
        showWhenReady: true,
        titleBarStyle: "hidden",
        titleBarOverlay: false,
        roundedCorners: true,
        minWidth: 480,
        minHeight: 360,
    },
    history: {
        route: "history",
        width: 1000,
        height: 720,
        frame: false,
        show: false,
        showWhenReady: true,
        titleBarStyle: "hidden",
        titleBarOverlay: false,
        roundedCorners: true,
        minWidth: 480,
        minHeight: 360,
    },
};

/** t252 AC9: 各窗口系统标题（任务栏/Alt-Tab）与面板标题一致。 */
const PANEL_TITLES: Record<string, string> = {
    usage: "Omni Panel - Usage",
    setting: "Omni Panel - Settings",
    agent: "Omni Panel - Agent",
    history: "Omni Panel - Session",
};

export interface WindowManager {
    createWindowFor(
        key: string,
        options?: { load?: boolean; route_query?: Record<string, string> },
    ): BrowserWindow;
    getRendererUrl(route: string, route_query?: Record<string, string>): string;
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
    function getRendererUrl(route: string, route_query?: Record<string, string>): string {
        const theme = nativeTheme.shouldUseDarkColors ? "dark" : "light";
        const query_parts: string[] = [`ou_theme=${theme}`];
        if (route_query) {
            for (const [k, v] of Object.entries(route_query)) {
                query_parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
            }
        }
        const query = query_parts.join("&");
        const devServerUrl = process.env["ELECTRON_RENDERER_URL"];
        if (devServerUrl) {
            return `${devServerUrl}?${query}#${route}`;
        }
        return `file://${opts.rendererIndexPath}?${query}#${route}`;
    }

    function createWindowFor(
        key: string,
        options: { load?: boolean; route_query?: Record<string, string> } = {},
    ): BrowserWindow {
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
            // t280: e2e headless 门控——E2E=1 且 E2E_HEADLESS=1 时窗口存在但不弹屏。
            show: is_e2e_headless() ? false : (cfg.show ?? true),
            autoHideMenuBar: cfg.autoHideMenuBar ?? false,
            resizable: cfg.resizable ?? true,
            ...(cfg.minWidth !== undefined && { minWidth: cfg.minWidth }),
            ...(cfg.minHeight !== undefined && { minHeight: cfg.minHeight }),
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

        const panel_title = PANEL_TITLES[key];
        if (panel_title) {
            win.setTitle(panel_title);
            // t252 AC9: 页面加载后 index.html <title> 会触发 page-title-updated 用
            // document.title 覆盖 setTitle 的值。阻止之，并重设面板标题，保持
            // 任务栏/Alt-Tab 标题恒等于面板标题。
            win.on("page-title-updated", (event) => {
                event.preventDefault();
                if (!win.isDestroyed()) win.setTitle(panel_title);
            });
        }

        if (process.platform === "win32") {
            win.setAppDetails({ appId: "omni-panel" });
        }
        // Open external http(s) links in the system default browser instead of
        // spawning a new Electron window (t156). 畸形 url 拒绝（p125）。
        win.webContents.setWindowOpenHandler(({ url }) => {
            let parsed: URL;
            try {
                parsed = new URL(url);
            } catch {
                log.warn(`Blocked window-open for malformed URL: ${url}`);
                return { action: "deny" };
            }
            if (parsed.protocol === "http:" || parsed.protocol === "https:") {
                void shell.openExternal(url);
            } else {
                log.warn(`Blocked window-open for non-http(s) URL: ${url}`);
            }
            return { action: "deny" };
        });

        // t297: 面板窗口自身导航守卫。消息内容不可信，若 <a href> 未走外部打开
        // 路径而触发同窗口导航，will-navigate 兜底拒绝非白名单导航。file: 放行
        // （渲染入口为 file://，SettingsView 配置导入后的 location.reload() 属同
        // 入口 reload，见 SettingsView.tsx:296）；http(s) 放行（外部打开路径）。
        win.webContents.on("will-navigate", (event, url) => {
            let parsed: URL;
            try {
                parsed = new URL(url);
            } catch {
                event.preventDefault();
                log.warn(`Blocked navigation to malformed URL: ${url}`);
                return;
            }
            if (
                parsed.protocol !== "http:" &&
                parsed.protocol !== "https:" &&
                parsed.protocol !== "file:"
            ) {
                event.preventDefault();
                log.warn(`Blocked navigation to non-whitelist URL: ${url}`);
            }
        });

        if (cfg.autoHideMenuBar) {
            win.setMenuBarVisibility(false);
        }
        if (options.load !== false) {
            void win
                .loadURL(getRendererUrl(cfg.route, options.route_query))
                .catch((err: unknown) => {
                    log.error(
                        `loadURL failed for ${key}: ${err instanceof Error ? err.message : String(err)}`,
                    );
                });
        }
        // t280: e2e headless 门控下 showWhenReady 也跳过（否则 ready-to-show 会 show）。
        if (cfg.showWhenReady && options.load !== false && !is_e2e_headless()) {
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
