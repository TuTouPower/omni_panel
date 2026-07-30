import { describe, expect, it, vi } from "vitest";
import { create_agent_window_controller } from "../../../src/main/core/main-panel/agent-window-controller";
import type { AgentWindowLike } from "../../../src/main/core/main-panel/agent-window-controller";

interface FakeWindow {
    destroyed: boolean;
    closed_handlers: (() => void)[];
    show: ReturnType<typeof vi.fn>;
    focus: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    isDestroyed: () => boolean;
}

function make_window(): FakeWindow {
    const win: FakeWindow = {
        destroyed: false,
        closed_handlers: [],
        show: vi.fn(),
        focus: vi.fn(),
        destroy: vi.fn(() => {
            win.destroyed = true;
        }),
        on: vi.fn((event: string, handler: () => void) => {
            if (event === "closed") {
                win.closed_handlers.push(handler);
            }
        }),
        isDestroyed: () => win.destroyed,
    };
    return win;
}

/** Tracker + factory: pushes each created window, returning it as the
 * controller's expected window surface. FakeWindow satisfies AgentWindowLike
 * structurally for the methods exercised; the cast sidesteps BrowserWindow's
 * complex `on` overload signatures. */
function make_factory(): { created: FakeWindow[]; create_window: () => AgentWindowLike } {
    const created: FakeWindow[] = [];
    const create_window = (): AgentWindowLike => {
        const w = make_window();
        created.push(w);
        return w;
    };
    return { created, create_window };
}

/** Get created window at index, asserting it exists (replaces non-null assertion). */
function created_at(created: FakeWindow[], index: number): FakeWindow {
    const w = created[index];
    if (!w) throw new Error(`expected created[${String(index)}] to exist`);
    return w;
}

function emit_closed(win: FakeWindow): void {
    for (const handler of win.closed_handlers) {
        handler();
    }
}

describe("agent-window-controller", () => {
    it("creates a window on first open and shows+focuses it", () => {
        const { created, create_window } = make_factory();
        const controller = create_agent_window_controller({ create_window });

        controller.open_or_focus();

        expect(created).toHaveLength(1);
        expect(created_at(created, 0).show).toHaveBeenCalledTimes(1);
        expect(created_at(created, 0).focus).toHaveBeenCalledTimes(1);
    });

    it("reuses the existing window on second open (no new create)", () => {
        const { created, create_window } = make_factory();
        const controller = create_agent_window_controller({ create_window });

        controller.open_or_focus();
        controller.open_or_focus();

        expect(created).toHaveLength(1);
        expect(created_at(created, 0).show).toHaveBeenCalledTimes(2);
        expect(created_at(created, 0).focus).toHaveBeenCalledTimes(2);
    });

    it("releases the reference on close and recreates on next open", () => {
        const { created, create_window } = make_factory();
        const controller = create_agent_window_controller({ create_window });

        controller.open_or_focus();
        const first = created_at(created, 0);
        emit_closed(first);

        expect(controller.get_window()).toBeNull();

        controller.open_or_focus();
        expect(created).toHaveLength(2);
        expect(controller.get_window()).toBe(created_at(created, 1));
    });

    it("does not reuse a destroyed window", () => {
        const { created, create_window } = make_factory();
        const controller = create_agent_window_controller({ create_window });

        controller.open_or_focus();
        const first = created_at(created, 0);
        // Simulate external destroy without the closed event firing first.
        first.destroy();
        expect(first.isDestroyed()).toBe(true);

        controller.open_or_focus();
        expect(created).toHaveLength(2);
    });

    it("shutdown destroys the window and releases the reference", () => {
        const { created, create_window } = make_factory();
        const controller = create_agent_window_controller({ create_window });

        controller.open_or_focus();
        const win = created_at(created, 0);
        controller.shutdown();

        expect(win.destroy).toHaveBeenCalledTimes(1);
        expect(controller.get_window()).toBeNull();
    });

    it("shutdown is idempotent when no window exists", () => {
        const { create_window } = make_factory();
        const controller = create_agent_window_controller({ create_window });
        expect(() => {
            controller.shutdown();
        }).not.toThrow();
    });
});
