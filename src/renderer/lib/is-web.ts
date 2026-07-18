/**
 * True when running inside the standalone web build (browser reaching the
 * desktop app's local-api), set as `data-web` on <html> by install_web_usageboard.
 * Used to hide Electron-only controls (hide-to-tray, window min/max/close) that
 * have no meaning in a browser tab.
 */
export function is_web(): boolean {
    return document.documentElement.dataset["web"] != null;
}
