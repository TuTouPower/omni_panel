import { describe, it, expect } from "vitest";
import { IPC_CHANNELS } from "../../../src/shared/types/ipc";

/**
 * Phase 26.11: Tray menu labels and structure verification.
 *
 * The native context menu has been replaced with a custom frameless
 * BrowserWindow tray menu. This test verifies the label constants and
 * expected IPC channel names against actual source code.
 */

const ZH_LABELS = [
    "用量面板",
    "代理面板",
    "网页访问",
    "立即刷新全部",
    "暂停自动刷新",
    "恢复自动刷新",
    "开机自启",
    "设置…",
    "检查更新",
    "退出 OmniUsage",
] as const;

const EN_LABELS = [
    "Usage Panel",
    "Agent Panel",
    "Web Panel",
    "Refresh All",
    "Pause Auto-Refresh",
    "Resume Auto-Refresh",
    "Launch at Login",
    "Settings…",
    "Check for Updates",
    "Quit OmniUsage",
] as const;

describe("tray menu", () => {
    it("has all 10 required menu item labels in Chinese", () => {
        expect(ZH_LABELS).toHaveLength(10);
        expect(ZH_LABELS).toContain("用量面板");
        expect(ZH_LABELS).toContain("代理面板");
        expect(ZH_LABELS).toContain("网页访问");
        expect(ZH_LABELS).toContain("立即刷新全部");
        expect(ZH_LABELS).toContain("退出 OmniUsage");
    });

    it("has all 10 required menu item labels in English", () => {
        expect(EN_LABELS).toHaveLength(10);
        expect(EN_LABELS).toContain("Usage Panel");
        expect(EN_LABELS).toContain("Agent Panel");
        expect(EN_LABELS).toContain("Web Panel");
        expect(EN_LABELS).toContain("Refresh All");
        expect(EN_LABELS).toContain("Quit OmniUsage");
    });

    it("pause labels are distinct", () => {
        expect(ZH_LABELS[4]).not.toBe(ZH_LABELS[5]);
        expect(EN_LABELS[4]).not.toBe(EN_LABELS[5]);
    });

    it("tray IPC channels cover all actions", () => {
        const tray_channels = Object.values(IPC_CHANNELS).filter((ch) => ch.startsWith("tray:"));
        expect(tray_channels.length).toBeGreaterThanOrEqual(10);
        // verify naming convention: tray prefix + camelCase action
        for (const ch of tray_channels) {
            expect(ch).toMatch(/^tray:[a-zA-Z]+$/u);
        }
        // verify all expected actions exist
        const required_actions = [
            "openPanel",
            "refreshAll",
            "togglePause",
            "toggleAutostart",
            "openSettings",
            "checkUpdate",
            "quit",
            "hide",
            "pauseState",
            "autostartState",
        ];
        for (const action of required_actions) {
            expect(tray_channels).toContain(`tray:${action}`);
        }
    });

    it("TrayMenu component source contains all zh labels", async () => {
        // Read the TrayMenu source to verify labels exist in actual code
        const source = await import("../../../src/renderer/views/TrayMenu?raw").then(
            (m) => m.default,
        );
        for (const label of ZH_LABELS) {
            expect(source).toContain(label);
        }
    });

    it("TrayMenu component source contains all en labels", async () => {
        const source = await import("../../../src/renderer/views/TrayMenu?raw").then(
            (m) => m.default,
        );
        for (const label of EN_LABELS) {
            expect(source).toContain(label);
        }
    });
});
