import { describe, expect, it, vi } from "vitest";
import {
    create_popup_height_controller,
    type BoundsLike,
    type DisplayLike,
} from "../../../src/main/core/popup/popup-height-controller";

/**
 * Integration-flavored unit test that mirrors the suppress-move wiring used
 * in src/main/index.ts. The controller-driven setBounds must set a
 * `suppress_move` flag so the BrowserWindow's `move` listener can ignore
 * the synchronous move event, while real user drags (no flag) still set
 * `user_moved=true`.
 */
describe("popup setBounds suppress-move wiring", () => {
    const display: DisplayLike = { workArea: { x: 0, y: 0, width: 1920, height: 1080 } };
    const initial: BoundsLike = { x: 100, y: 100, width: 460, height: 480 };

    function build_wired_window() {
        const state = {
            user_moved: false,
            suppress_move: false,
            bounds: { ...initial },
        };

        const fire_move = () => {
            // Simulate BrowserWindow's "move" listener wiring from index.ts.
            if (state.suppress_move) return;
            state.user_moved = true;
        };

        const set_bounds_spy = vi.fn((next: BoundsLike) => {
            state.suppress_move = true;
            try {
                state.bounds = { ...next };
                // BrowserWindow emits "move" synchronously when bounds change.
                fire_move();
            } finally {
                // Match the setImmediate release in index.ts; for the test
                // we release on a microtask so subsequent user drags can
                // still flip user_moved.
                // LIMITATION: queueMicrotask executes earlier than setImmediate
                // on Windows. In production index.ts, setImmediate defers the
                // flag release to the next event loop tick (after the BrowserWindow
                // "move" event). queueMicrotask runs within the same tick, which
                // is acceptable here because the synchronous fire_move() has
                // already been captured in the try block. Tests relying on
                // flag timing beyond "synchronous move is suppressed" should
                // use setImmediate + fake timers for exact fidelity.
                queueMicrotask(() => {
                    state.suppress_move = false;
                });
            }
        });

        const controller = create_popup_height_controller({
            platform: "win32",
            get_window: () => ({
                isDestroyed: () => false,
                getBounds: () => state.bounds,
                setBounds: set_bounds_spy,
            }),
            get_display_for_window: () => display,
            get_anchor: () => ({
                tray_bounds: { x: 1700, y: 1040, width: 32, height: 24 },
                user_moved: state.user_moved,
            }),
        });

        return { controller, state, set_bounds_spy, fire_move };
    }

    it("does not set user_moved when controller drives setBounds", async () => {
        const { controller, state, set_bounds_spy } = build_wired_window();

        const applied = controller.report_content_height({
            content_height: 600,
            collapsed_min_height: 200,
        });

        expect(applied).toBe(600);
        expect(set_bounds_spy).toHaveBeenCalledTimes(1);
        // The move event fired synchronously during setBounds must have
        // been suppressed.
        expect(state.user_moved).toBe(false);

        // Release the flag.
        await Promise.resolve();
        expect(state.suppress_move).toBe(false);
    });

    it("still sets user_moved on a real user drag (no suppress flag)", async () => {
        const { controller, state, fire_move } = build_wired_window();

        // Initial controller-driven resize.
        controller.report_content_height({ content_height: 600, collapsed_min_height: 200 });
        await Promise.resolve();
        expect(state.user_moved).toBe(false);

        // User drags the window: a move event fires with no suppress flag.
        fire_move();
        expect(state.user_moved).toBe(true);
    });
});
