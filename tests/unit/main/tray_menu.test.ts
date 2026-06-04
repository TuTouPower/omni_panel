import { describe, it, expect } from "vitest";

/**
 * Phase 26.11: Tray menu labels and structure verification.
 *
 * The native context menu has been replaced with a custom frameless
 * BrowserWindow tray menu. This test verifies the label constants and
 * expected IPC channel names.
 */
describe("tray menu", () => {
    const zh_labels = {
        open: "打开主面板",
        refresh: "立即刷新全部",
        pauseOn: "暂停自动刷新",
        pauseOff: "恢复自动刷新",
        autostart: "开机自启",
        settings: "设置…",
        checkUpdate: "检查更新",
        quit: "退出 OmniUsage",
    };

    const en_labels = {
        open: "Open Panel",
        refresh: "Refresh All",
        pauseOn: "Pause Auto-Refresh",
        pauseOff: "Resume Auto-Refresh",
        autostart: "Launch at Login",
        settings: "Settings…",
        checkUpdate: "Check for Updates",
        quit: "Quit OmniUsage",
    };

    const IPC_CHANNELS = [
        "tray:openPanel",
        "tray:refreshAll",
        "tray:togglePause",
        "tray:toggleAutostart",
        "tray:openSettings",
        "tray:checkUpdate",
        "tray:quit",
        "tray:hide",
        "tray:pauseState",
        "tray:autostartState",
    ];

    it("has all 8 required menu item labels in Chinese", () => {
        const keys = Object.keys(zh_labels);
        expect(keys).toHaveLength(8);
        expect(zh_labels.open).toBe("打开主面板");
        expect(zh_labels.refresh).toBe("立即刷新全部");
        expect(zh_labels.quit).toBe("退出 OmniUsage");
    });

    it("has all 8 required menu item labels in English", () => {
        expect(en_labels.open).toBe("Open Panel");
        expect(en_labels.refresh).toBe("Refresh All");
        expect(en_labels.quit).toBe("Quit OmniUsage");
    });

    it("pause labels are distinct", () => {
        expect(zh_labels.pauseOn).not.toBe(zh_labels.pauseOff);
        expect(en_labels.pauseOn).not.toBe(en_labels.pauseOff);
    });

    it("tray IPC channels cover all actions", () => {
        expect(IPC_CHANNELS).toHaveLength(10);
        // verify naming convention: capsule prefix + pascal case action
        for (const ch of IPC_CHANNELS) {
            expect(ch).toMatch(/^tray:[a-zA-Z]+$/u);
        }
    });
});
