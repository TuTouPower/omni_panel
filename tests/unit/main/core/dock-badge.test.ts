import { describe, it, expect, vi, beforeEach } from "vitest";
import { clear_dock_badge } from "../../../../src/main/core/dock-badge";
import { create_main_panel_controller } from "../../../../src/main/core/main-panel/main-panel-controller";
import type { WindowLike } from "../../../../src/main/core/main-panel/main-panel-types";
import type { AppConfiguration } from "../../../../src/shared/types/config";

describe("dock-badge (t488)", () => {
    let mock_set_badge: ReturnType<typeof vi.fn>;
    let mock_set_badge_count: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mock_set_badge = vi.fn();
        mock_set_badge_count = vi.fn();
    });

    it("AC-001 & AC-002: macOS 宿主下清除 Dock 角标字符串及角标计数", () => {
        clear_dock_badge({
            platform: "darwin",
            dock: { setBadge: mock_set_badge },
            setBadgeCount: mock_set_badge_count,
        });

        expect(mock_set_badge).toHaveBeenCalledTimes(1);
        expect(mock_set_badge).toHaveBeenCalledWith("");
        expect(mock_set_badge_count).toHaveBeenCalledTimes(1);
        expect(mock_set_badge_count).toHaveBeenCalledWith(0);
    });

    it("AC-003: Windows / Linux 宿主下静默跳过，不调用 dock.setBadge 或 setBadgeCount", () => {
        clear_dock_badge({
            platform: "win32",
            dock: { setBadge: mock_set_badge },
            setBadgeCount: mock_set_badge_count,
        });

        expect(mock_set_badge).not.toHaveBeenCalled();
        expect(mock_set_badge_count).not.toHaveBeenCalled();

        clear_dock_badge({
            platform: "linux",
            dock: { setBadge: mock_set_badge },
            setBadgeCount: mock_set_badge_count,
        });

        expect(mock_set_badge).not.toHaveBeenCalled();
        expect(mock_set_badge_count).not.toHaveBeenCalled();
    });

    it("macOS 下 dock 为 undefined 时安全静默，不抛出异常", () => {
        expect(() => {
            clear_dock_badge({
                platform: "darwin",
                dock: undefined,
                setBadgeCount: mock_set_badge_count,
            });
        }).not.toThrow();

        expect(mock_set_badge_count).toHaveBeenCalledWith(0);
    });

    it("macOS 下 setBadge 抛错时被捕获，不影响进程运行", () => {
        mock_set_badge.mockImplementation(() => {
            throw new Error("Dock service unavailable");
        });

        expect(() => {
            clear_dock_badge({
                platform: "darwin",
                dock: { setBadge: mock_set_badge },
                setBadgeCount: mock_set_badge_count,
            });
        }).not.toThrow();

        expect(mock_set_badge).toHaveBeenCalledWith("");
        expect(mock_set_badge_count).toHaveBeenCalledWith(0);
    });

    it("AC-001: main_panel_controller 打开/展示主面板时调用 on_show 回调", () => {
        const on_show = vi.fn();
        const mock_win: WindowLike = {
            isDestroyed: () => false,
            isVisible: () => false,
            show: vi.fn(),
            focus: vi.fn(),
            close: vi.fn(),
            hide: vi.fn(),
            destroy: vi.fn(),
            getBounds: () => ({ x: 100, y: 100, width: 480, height: 480 }),
            setBounds: vi.fn(),
            loadURL: vi.fn(() => Promise.resolve()),
            setAlwaysOnTop: vi.fn(),
            setSkipTaskbar: vi.fn(),
            setMinimumSize: vi.fn(),
            setResizable: vi.fn(),
            on: vi.fn(),
        };

        const controller = create_main_panel_controller({
            platform: "darwin",
            get_config: () => ({} as unknown as AppConfiguration),
            save_config: vi.fn(),
            create_window: () => mock_win,
            get_renderer_url: () => "http://localhost/#usage",
            get_preload_path: () => "/fake/preload.js",
            get_app_icon_path: () => "/fake/icon.png",
            get_tray_bounds: () => ({ x: 50, y: 0, width: 24, height: 24 }),
            get_display_for_bounds: () => ({
                workArea: { x: 0, y: 0, width: 1440, height: 900 },
            }),
            get_all_displays: () => [{ workArea: { x: 0, y: 0, width: 1440, height: 900 } }],
            get_primary_display: () => ({
                workArea: { x: 0, y: 0, width: 1440, height: 900 },
            }),
            on_show,
        });

        controller.open_or_focus();

        expect(mock_win.show).toHaveBeenCalled();
        expect(mock_win.focus).toHaveBeenCalled();
        expect(on_show).toHaveBeenCalledTimes(1);
    });
});
