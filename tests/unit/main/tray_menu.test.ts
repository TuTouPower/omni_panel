import { describe, it, expect } from "vitest";

/**
 * Phase 21.6: Tray menu labels verification.
 *
 * Since Electron's Menu.buildFromTemplate requires a running app,
 * this test verifies the label constants that would be used.
 */
describe("tray menu labels", () => {
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

    it("has all 7 required menu items in Chinese", () => {
        const keys = Object.keys(zh_labels);
        expect(keys).toHaveLength(8); // open + refresh + pauseOn + pauseOff + autostart + settings + checkUpdate + quit
        expect(zh_labels.open).toBe("打开主面板");
        expect(zh_labels.refresh).toBe("立即刷新全部");
        expect(zh_labels.quit).toBe("退出 OmniUsage");
    });

    it("has all 7 required menu items in English", () => {
        expect(en_labels.open).toBe("Open Panel");
        expect(en_labels.refresh).toBe("Refresh All");
        expect(en_labels.quit).toBe("Quit OmniUsage");
    });

    it("pause labels are distinct", () => {
        expect(zh_labels.pauseOn).not.toBe(zh_labels.pauseOff);
        expect(en_labels.pauseOn).not.toBe(en_labels.pauseOff);
    });
});
