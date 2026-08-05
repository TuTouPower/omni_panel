/**
 * 历史窗口 singleton controller（t210 对接层）。
 *
 * 模式对齐 create_agent_window_controller：open_or_focus 复用已开窗口，
 * 关闭后释放引用，下次 open 重建。windowManager 通过 create_window 注入，
 * 使此模块不直接 import Electron BrowserWindow。
 */
import type { BrowserWindow } from "electron";
import { createLogger } from "../../../shared/lib/logger";
import { IPC_CHANNELS } from "../../../shared/types/ipc";
import type { SessionLoc } from "../session-history/subscription-service";

const log = createLogger("history-window");

export type HistoryWindowLike = Pick<
    BrowserWindow,
    "show" | "focus" | "isDestroyed" | "on" | "destroy" | "webContents"
> & {
    webContents: { send: (channel: string, payload: unknown) => void } & {
        /** t210_code_f006：创建窗口期补发初始定位（loadURL 未完成时 send 会被丢弃）。 */
        once: (event: "did-finish-load", listener: () => void) => void;
    };
};

export interface HistoryWindowController {
    /**
     * 已开则 show+focus 并（若提供 loc）发 SESSION_HISTORY_FOCUS 定位；
     * 未开则 create+show+focus，loc 经 create_window 传给 renderer 作为初始定位。
     * 返回当前窗口。
     */
    open_or_focus(loc?: SessionLoc): HistoryWindowLike;
    /** 当前持有的窗口（关闭后为 null）。 */
    get_window(): HistoryWindowLike | null;
    /**
     * 向已开历史窗口发 SESSION_HISTORY_FOCUS 事件，让 renderer 定位到目标会话。
     * 窗口未开时 no-op。
     */
    send_focus(loc: SessionLoc): void;
    /** 销毁并释放。幂等。 */
    shutdown(): void;
}

export interface HistoryWindowControllerDeps {
    /** loc 仅在首次创建时传入（renderer 启动读初始定位参数，见 spec 上下文区已核实契约）。 */
    readonly create_window: (loc?: SessionLoc) => HistoryWindowLike;
}

export function create_history_window_controller(
    deps: HistoryWindowControllerDeps,
): HistoryWindowController {
    let win: HistoryWindowLike | null = null;
    // 创建期（loadURL 未完成）为 true：webContents.send 会被丢弃，需缓冲定位。
    let loading = false;
    // 创建期累积的定位：did-finish-load 后统一补发（f006 单条 + t212 批量）。
    let pending_locs: SessionLoc[] = [];

    function open_or_focus(loc?: SessionLoc): HistoryWindowLike {
        if (win && !win.isDestroyed()) {
            win.show();
            win.focus();
            if (loc) {
                send_focus(loc);
            }
            return win;
        }
        const target = deps.create_window(loc);
        target.on("closed", () => {
            if (win === target) {
                win = null;
                loading = false;
                pending_locs = [];
                log.debug("history window closed, reference released");
            }
        });
        // 创建窗口期（loadURL 未完成）连续 OPEN 的 send_focus 会被丢弃：
        // 缓冲全部定位，did-finish-load 后统一补发，保证批量打开不丢会话。
        loading = true;
        pending_locs = loc ? [loc] : [];
        target.webContents.once("did-finish-load", () => {
            loading = false;
            if (win === target && !target.isDestroyed()) {
                const batch = pending_locs;
                pending_locs = [];
                for (const l of batch) {
                    send_focus_loc(target, l);
                }
            }
        });
        win = target;
        target.show();
        target.focus();
        return target;
    }

    function send_focus_loc(target: HistoryWindowLike, loc: SessionLoc): void {
        target.webContents.send(IPC_CHANNELS.SESSION_HISTORY_FOCUS, {
            source: loc.source,
            env: loc.env,
            session_id: loc.session_id,
        });
    }

    function send_focus(loc: SessionLoc): void {
        if (!win || win.isDestroyed()) return;
        if (loading) {
            // loadURL 途中 send 被丢弃：缓冲，did-finish-load 后补发。按 key 去重防累积。
            const dup = pending_locs.some(
                (l) =>
                    l.source === loc.source && l.env === loc.env && l.session_id === loc.session_id,
            );
            if (!dup) {
                pending_locs.push(loc);
            }
            return;
        }
        send_focus_loc(win, loc);
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
        send_focus,
        shutdown,
    };
}
