// Pure decision extracted from the settings window 'close' handler so it can be
// unit-tested without booting Electron. The settings window is persistent: a
// close while the app is running hides the window (so it can be reused, avoiding
// the fresh-window show animation that flashes white on Windows); during quit we
// let the close proceed so before-quit can destroy it.
export type SettingsCloseDecision = "hide" | "proceed";

export function decide_settings_close(quitting: boolean): SettingsCloseDecision {
    return quitting ? "proceed" : "hide";
}
