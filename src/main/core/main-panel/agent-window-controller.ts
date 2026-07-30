import type { BrowserWindow } from "electron";
import { createLogger } from "../../../shared/lib/logger";

const log = createLogger("agent-window");

/**
 * Minimal window surface the agent-window singleton needs. Picked from
 * BrowserWindow so tests can inject a fake without importing Electron.
 */
export type AgentWindowLike = Pick<
    BrowserWindow,
    "show" | "focus" | "isDestroyed" | "on" | "destroy"
>;

export interface AgentWindowController {
    /** Focus an existing window or create one. Returns the active window. */
    open_or_focus(): AgentWindowLike;
    /** Currently held window (may be null after close). */
    get_window(): AgentWindowLike | null;
    /** Destroy + release on shutdown. Idempotent. */
    shutdown(): void;
}

export interface AgentWindowControllerDeps {
    /** Creates a fresh agent BrowserWindow. */
    readonly create_window: () => AgentWindowLike;
}

/**
 * Singleton agent (token-stats) window controller.
 *
 * `tokenStats.open()` used to call `windowManager.createWindowFor("agent")`
 * unconditionally, stacking multiple agent BrowserWindows — each independently
 * loads the full records dataset, multiplying memory cost. This controller
 * reuses an existing window (focus) or creates one, releasing the reference on
 * close so a subsequent open recreates it.
 */
export function create_agent_window_controller(
    deps: AgentWindowControllerDeps,
): AgentWindowController {
    let win: AgentWindowLike | null = null;

    function open_or_focus(): AgentWindowLike {
        if (win && !win.isDestroyed()) {
            win.show();
            win.focus();
            return win;
        }
        const target = deps.create_window();
        target.on("closed", () => {
            if (win === target) {
                win = null;
                log.debug("agent window closed, reference released");
            }
        });
        win = target;
        target.show();
        target.focus();
        return target;
    }

    function shutdown(): void {
        if (win && !win.isDestroyed()) {
            win.destroy();
        }
        win = null;
    }

    return {
        open_or_focus,
        get_window: () => win,
        shutdown,
    };
}
