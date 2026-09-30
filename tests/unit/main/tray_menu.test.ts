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
    "退出 OmniPanel",
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
    "Quit OmniPanel",
] as const;

describe("tray menu", () => {
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

    it("p256: tray menu dismiss fallback is wired (focus-hide + in-menu hint)", async () => {
        const main_source = await import("../../../src/main/index.ts?raw").then((m) => m.default);
        // 我方其它窗口获焦即收菜单（showInactive 无 blur 时的兜底）。
        expect(main_source).toContain("browser-window-focus");
        const tray_source = await import("../../../src/renderer/views/TrayMenu?raw").then(
            (m) => m.default,
        );
        // 桌面空白/外部应用点不到本进程，菜单内明示再次点击托盘收起。
        expect(tray_source).toContain("tray-dismiss-hint");
        expect(tray_source).toContain("再次点击托盘图标可收起菜单");
        // t536：focus 处理委托入口 + 关停行兜底出口的接线哨兵（组合行为由
        // main_panel_controller.test 的 p258 / AC-004 组固定，这里只保证 index
        // 接线未被摘除）。
        expect(main_source).toContain("handle_browser_window_focus");
        expect(main_source).toContain("log_application_shutdown");
    });
    // t536：删除原「p258: popup outside-focus auto-hide is wired ...」源文本断言。
    // 理由：该用例以字符串绑定 index.ts 内联实现位置，t536 将 browser-window-focus
    // 处理委托给 handle_browser_window_focus（main-panel-controller），断言必然失效；
    // 其语义（获焦收起 + pinToTop 豁免 + floating 不收）已由行为测试覆盖：
    // main_panel_controller.test.ts 的 p258 纯函数组与 t536 AC-004 组合组。
    it("t539: tray 右键切换接线使用焦点感知 helper（AC-003）", async () => {
        const main_source = await import("../../../src/main/index.ts?raw").then((m) => m.default);
        // 右键收起条件不再是裸 isVisible，而走 should_show_tray_menu_on_right_click
        //（可见且聚焦才收，可见失焦/它 Space 走显示）。
        expect(main_source).toContain("should_show_tray_menu_on_right_click");
    });
});
