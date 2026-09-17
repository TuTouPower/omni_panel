import { describe, it, expect, vi, beforeEach } from "vitest";
import { apply_dock_visibility } from "../../../../src/main/core/dock-visibility";

describe("dock-visibility (p254)", () => {
    let mock_hide: ReturnType<typeof vi.fn>;
    let mock_show: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mock_hide = vi.fn();
        mock_show = vi.fn();
    });

    it("macOS 下 hide=true 隐藏 Dock，hide=false 恢复显示", () => {
        apply_dock_visibility(true, {
            platform: "darwin",
            dock: { hide: mock_hide, show: mock_show },
        });
        expect(mock_hide).toHaveBeenCalledTimes(1);
        expect(mock_show).not.toHaveBeenCalled();

        apply_dock_visibility(false, {
            platform: "darwin",
            dock: { hide: mock_hide, show: mock_show },
        });
        expect(mock_show).toHaveBeenCalledTimes(1);
    });

    it("Windows / Linux 下静默跳过，不调 dock.hide/show", () => {
        apply_dock_visibility(true, {
            platform: "win32",
            dock: { hide: mock_hide, show: mock_show },
        });
        apply_dock_visibility(true, {
            platform: "linux",
            dock: { hide: mock_hide, show: mock_show },
        });
        expect(mock_hide).not.toHaveBeenCalled();
        expect(mock_show).not.toHaveBeenCalled();
    });

    it("macOS 下 dock 不可用时不抛错", () => {
        expect(() => {
            apply_dock_visibility(true, { platform: "darwin", dock: undefined });
        }).not.toThrow();
    });
});
