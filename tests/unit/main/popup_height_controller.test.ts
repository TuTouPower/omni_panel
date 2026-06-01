import { describe, expect, it, vi } from "vitest";
import {
    MAX_HEIGHT_RATIO,
    apply_locked_size,
    compute_target_height,
    create_popup_height_controller,
    should_apply_report,
    type BoundsLike,
    type DisplayLike,
    type PopupAnchorContext,
    type PopupHeightControllerOptions,
    type PopupWindowHandle,
} from "../../../src/main/core/popup/popup-height-controller";

const display_1080: DisplayLike = {
    workArea: { x: 0, y: 0, width: 1920, height: 1080 },
};
// floor(1080 * 0.85) = 918
const MAX_1080 = Math.floor(1080 * MAX_HEIGHT_RATIO);

describe("compute_target_height", () => {
    it("returns collapsed_min_height when content is smaller than min", () => {
        const out = compute_target_height(
            { content_height: 100, collapsed_min_height: 200 },
            display_1080,
        );
        expect(out).toBe(200);
    });

    it("returns the content height when within [min, max]", () => {
        const out = compute_target_height(
            { content_height: 500, collapsed_min_height: 200 },
            display_1080,
        );
        expect(out).toBe(500);
    });

    it("returns the max height when content exceeds 85% of work area", () => {
        const out = compute_target_height(
            { content_height: 2000, collapsed_min_height: 200 },
            display_1080,
        );
        expect(out).toBe(MAX_1080);
    });

    it("rounds fractional content height up so content is not clipped", () => {
        const out = compute_target_height(
            { content_height: 500.2, collapsed_min_height: 200 },
            display_1080,
        );
        expect(out).toBe(501);
    });

    it("rounds the max height down to honour the 85% constraint", () => {
        // 0.85 * 1080 = 918.0; with 0.85 * 1081 = 918.85 -> floor=918, ensures no >85%
        const display = { workArea: { x: 0, y: 0, width: 1920, height: 1081 } };
        const out = compute_target_height(
            { content_height: 5000, collapsed_min_height: 100 },
            display,
        );
        expect(out).toBe(Math.floor(1081 * MAX_HEIGHT_RATIO));
        expect(out).toBeLessThanOrEqual(Math.floor(1081 * MAX_HEIGHT_RATIO));
    });

    it("honours the max when min > max on tiny displays", () => {
        const tiny = { workArea: { x: 0, y: 0, width: 800, height: 200 } };
        // max = floor(200*0.85) = 170
        const out = compute_target_height({ content_height: 500, collapsed_min_height: 400 }, tiny);
        expect(out).toBe(170);
    });
});

describe("should_apply_report", () => {
    it("applies when no previous report exists", () => {
        expect(should_apply_report(500, null)).toBe(true);
    });

    it("suppresses changes of <= 1px", () => {
        expect(should_apply_report(500, 500)).toBe(false);
        expect(should_apply_report(500.5, 500)).toBe(false);
        expect(should_apply_report(499, 500)).toBe(false);
    });

    it("applies changes greater than 1px", () => {
        expect(should_apply_report(502, 500)).toBe(true);
        expect(should_apply_report(498, 500)).toBe(true);
    });
});

describe("apply_locked_size", () => {
    const current: BoundsLike = { x: 100, y: 100, width: 360, height: 480 };

    it("preserves width when resizing", () => {
        const out = apply_locked_size(current, 600, display_1080, "win32", {
            tray_bounds: null,
            user_moved: true,
        });
        expect(out.width).toBe(360);
        expect(out.height).toBe(600);
    });

    it("re-anchors under the tray on macOS", () => {
        const tray: BoundsLike = { x: 1700, y: 0, width: 32, height: 24 };
        const out = apply_locked_size(current, 500, display_1080, "darwin", {
            tray_bounds: tray,
        });
        // x centered on tray midpoint (1716) minus half width (180) => 1536
        expect(out.x).toBe(1536);
        expect(out.y).toBe(28);
    });

    it("preserves current top-left on Windows when user has moved the window", () => {
        const out = apply_locked_size(current, 600, display_1080, "win32", {
            tray_bounds: { x: 1700, y: 1040, width: 32, height: 24 },
            user_moved: true,
        });
        expect(out.x).toBe(100);
        expect(out.y).toBe(100);
        expect(out.height).toBe(600);
    });

    it("snaps to tray on Windows when user has not moved the window", () => {
        const tray: BoundsLike = { x: 1700, y: 1040, width: 32, height: 24 };
        const out = apply_locked_size(current, 500, display_1080, "win32", {
            tray_bounds: tray,
            user_moved: false,
        });
        // y would be 1068 but clamped so window fits: workArea bottom = 1080, height 500 → y <= 580
        expect(out.y).toBeLessThanOrEqual(1080 - 500);
        expect(out.x).toBe(1536);
    });

    it("falls back to work-area bottom-right on Linux when tray bounds are missing", () => {
        const out = apply_locked_size(current, 500, display_1080, "linux", {
            tray_bounds: null,
            user_moved: false,
        });
        expect(out.x).toBe(1920 - 360);
        expect(out.y).toBe(1080 - 500);
    });
});

function make_window(initial: BoundsLike): {
    handle: PopupWindowHandle;
    setBounds: ReturnType<typeof vi.fn>;
    bounds: { value: BoundsLike };
} {
    const bounds = { value: { ...initial } };
    const setBounds = vi.fn((next: BoundsLike) => {
        bounds.value = { ...next };
    });
    return {
        handle: {
            isDestroyed: () => false,
            getBounds: () => bounds.value,
            setBounds,
        },
        setBounds,
        bounds,
    };
}

describe("create_popup_height_controller", () => {
    function build(
        overrides: Partial<PopupHeightControllerOptions> = {},
        anchor: PopupAnchorContext = { tray_bounds: null, user_moved: true },
        initial: BoundsLike = { x: 100, y: 100, width: 360, height: 480 },
    ) {
        const win = make_window(initial);
        const controller = create_popup_height_controller({
            platform: "win32",
            get_window: () => win.handle,
            get_display_for_window: () => display_1080,
            get_anchor: () => anchor,
            ...overrides,
        });
        return { controller, win };
    }

    it("applies resize when the report differs by more than 1px", () => {
        const { controller, win } = build();
        const applied = controller.report_content_height({
            content_height: 600,
            collapsed_min_height: 200,
        });
        expect(applied).toBe(600);
        expect(win.setBounds).toHaveBeenCalledTimes(1);
        const bounds = win.setBounds.mock.calls[0]?.[0] as { width: number; height: number };
        expect(bounds.height).toBe(600);
        expect(bounds.width).toBe(360);
    });

    it("suppresses resize when the report differs by <= 1px from the last report", () => {
        const { controller, win } = build();
        controller.report_content_height({ content_height: 600, collapsed_min_height: 200 });
        win.setBounds.mockClear();
        const applied = controller.report_content_height({
            content_height: 600.4,
            collapsed_min_height: 200,
        });
        expect(applied).toBeNull();
        expect(win.setBounds).not.toHaveBeenCalled();
    });

    it("does not resize when content changes but the clamped target stays the same", () => {
        // Both reports clamp to collapsed_min_height = 300
        const { controller, win } = build();
        controller.report_content_height({ content_height: 100, collapsed_min_height: 300 });
        expect(controller.last_applied_height()).toBe(300);
        win.setBounds.mockClear();

        // 50 is >1px change from 100 -> not debounced, but still clamps to 300
        const applied = controller.report_content_height({
            content_height: 50,
            collapsed_min_height: 300,
        });
        expect(applied).toBeNull();
        expect(win.setBounds).not.toHaveBeenCalled();
    });

    it("does nothing when the window is destroyed", () => {
        const { controller, win } = build({
            get_window: () => ({
                isDestroyed: () => true,
                getBounds: () => ({ x: 0, y: 0, width: 360, height: 480 }),
                setBounds: vi.fn(),
            }),
        });
        const applied = controller.report_content_height({
            content_height: 600,
            collapsed_min_height: 200,
        });
        expect(applied).toBeNull();
        expect(win.setBounds).not.toHaveBeenCalled();
    });

    it("re-emits on first report after reset()", () => {
        const { controller, win } = build();
        controller.report_content_height({ content_height: 600, collapsed_min_height: 200 });
        controller.reset();
        win.setBounds.mockClear();
        const applied = controller.report_content_height({
            content_height: 600,
            collapsed_min_height: 200,
        });
        expect(applied).toBe(600);
        expect(win.setBounds).toHaveBeenCalledTimes(1);
    });
});
