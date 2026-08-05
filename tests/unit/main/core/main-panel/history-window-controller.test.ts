import { describe, it, expect, vi } from "vitest";
import {
    create_history_window_controller,
    type HistoryWindowLike,
} from "../../../../../src/main/core/main-panel/history-window-controller";
import { IPC_CHANNELS } from "../../../../../src/shared/types/ipc";
import type { SessionLoc } from "../../../../../src/main/core/session-history/subscription-service";

/**
 * t210 历史窗口 controller 单测：OPEN singleton 语义。
 * - 未开 → create + show + focus（loc 传给 create_window 作为初始定位）；
 * - 已开 → 复用（不重复 create），show + focus + send_focus(loc)；
 * - closed 事件 → 释放引用，下次 open 重建；
 * - send_focus 窗口未开时 no-op，已开时发 SESSION_HISTORY_FOCUS。
 */

const TEST_LOC: SessionLoc = {
    source: "claude_code",
    env: "win",
    session_id: "s1",
};

function make_window(): HistoryWindowLike & {
    _handlers: Record<string, (() => void)[]>;
    _wc_handlers: Record<string, (() => void)[]>;
} {
    const handlers: Record<string, (() => void)[]> = {};
    const wc_handlers: Record<string, (() => void)[]> = {};
    return {
        show: vi.fn(),
        focus: vi.fn(),
        isDestroyed: vi.fn(() => false),
        on: vi.fn((event: string, cb: () => void) => {
            (handlers[event] ??= []).push(cb);
        }),
        destroy: vi.fn(),
        webContents: {
            send: vi.fn(),
            once: vi.fn((event: string, cb: () => void) => {
                (wc_handlers[event] ??= []).push(cb);
            }),
        },
        _handlers: handlers,
        _wc_handlers: wc_handlers,
    } as unknown as HistoryWindowLike & {
        _handlers: Record<string, (() => void)[]>;
        _wc_handlers: Record<string, (() => void)[]>;
    };
}

describe("history-window-controller (t210)", () => {
    it("open_or_focus 未开时 create + show + focus", () => {
        const created: HistoryWindowLike[] = [];
        const controller = create_history_window_controller({
            create_window: () => {
                const w = make_window();
                created.push(w);
                return w;
            },
        });

        const win = controller.open_or_focus();
        expect(created).toHaveLength(1);
        expect(win.show).toHaveBeenCalledTimes(1);
        expect(win.focus).toHaveBeenCalledTimes(1);
    });

    it("open_or_focus 已开时复用，不重复 create", () => {
        const created: HistoryWindowLike[] = [];
        const controller = create_history_window_controller({
            create_window: () => {
                const w = make_window();
                created.push(w);
                return w;
            },
        });

        const win1 = controller.open_or_focus();
        const win2 = controller.open_or_focus();
        expect(created).toHaveLength(1);
        expect(win1).toBe(win2);
        expect(win2.show).toHaveBeenCalledTimes(2);
        expect(win2.focus).toHaveBeenCalledTimes(2);
    });

    it("窗口 closed 后释放引用，下次 open 重建", () => {
        const created: HistoryWindowLike[] = [];
        const controller = create_history_window_controller({
            create_window: () => {
                const w = make_window();
                created.push(w);
                return w;
            },
        });

        const win1 = controller.open_or_focus();
        const fire_closed = (
            win1 as unknown as {
                _handlers: Record<string, (() => void)[]>;
            }
        )._handlers["closed"];
        for (const cb of fire_closed ?? []) {
            cb();
        }
        expect(controller.get_window()).toBeNull();

        const win2 = controller.open_or_focus();
        expect(created).toHaveLength(2);
        expect(win2).not.toBe(win1);
    });

    it("open_or_focus(loc) 首次创建时 loc 传给 create_window", () => {
        const create_spy = vi.fn(() => make_window());
        const controller = create_history_window_controller({
            create_window: create_spy,
        });

        controller.open_or_focus(TEST_LOC);

        expect(create_spy).toHaveBeenCalledTimes(1);
        expect(create_spy).toHaveBeenCalledWith(TEST_LOC);
    });

    it("open_or_focus(loc) 创建窗口期 did-finish-load 补发定位（f006）", () => {
        const w = make_window();
        const send_spy = vi.fn();
        w.webContents.send = send_spy as never;
        const controller = create_history_window_controller({
            create_window: () => w,
        });

        controller.open_or_focus(TEST_LOC);

        // loadURL 未完成时 send 被丢弃（不抛），注册 did-finish-load 补发。
        expect(w.webContents.once).toHaveBeenCalledWith("did-finish-load", expect.any(Function));
        const load_handler = (
            w as unknown as {
                _wc_handlers: Record<string, (() => void)[]>;
            }
        )._wc_handlers["did-finish-load"];
        for (const cb of load_handler ?? []) {
            cb();
        }
        expect(send_spy).toHaveBeenCalledWith(IPC_CHANNELS.SESSION_HISTORY_FOCUS, TEST_LOC);
    });

    it("批量打开：创建期连续 OPEN 全部缓冲，did-finish-load 统一补发（f002）", () => {
        const w = make_window();
        const send_spy = vi.fn();
        w.webContents.send = send_spy as never;
        const controller = create_history_window_controller({
            create_window: () => w,
        });

        const loc_b: SessionLoc = { source: "opencode", env: "win", session_id: "s2" };
        const loc_c: SessionLoc = { source: "kimi_code", env: "win", session_id: "s3" };
        controller.open_or_focus(TEST_LOC);
        // loadURL 途中（did-finish-load 未触发）继续 OPEN：不得丢弃，须缓冲。
        controller.open_or_focus(loc_b);
        controller.open_or_focus(loc_c);
        expect(send_spy).not.toHaveBeenCalled();

        const load_handler = (
            w as unknown as {
                _wc_handlers: Record<string, (() => void)[]>;
            }
        )._wc_handlers["did-finish-load"];
        for (const cb of load_handler ?? []) {
            cb();
        }
        expect(send_spy).toHaveBeenCalledTimes(3);
        expect(send_spy).toHaveBeenNthCalledWith(1, IPC_CHANNELS.SESSION_HISTORY_FOCUS, TEST_LOC);
        expect(send_spy).toHaveBeenNthCalledWith(2, IPC_CHANNELS.SESSION_HISTORY_FOCUS, loc_b);
        expect(send_spy).toHaveBeenNthCalledWith(3, IPC_CHANNELS.SESSION_HISTORY_FOCUS, loc_c);
    });

    it("批量打开：缓冲去重，重复定位只补发一次", () => {
        const w = make_window();
        const send_spy = vi.fn();
        w.webContents.send = send_spy as never;
        const controller = create_history_window_controller({
            create_window: () => w,
        });

        controller.open_or_focus(TEST_LOC);
        controller.open_or_focus(TEST_LOC);
        controller.open_or_focus(TEST_LOC);
        expect(send_spy).not.toHaveBeenCalled();

        const load_handler = (
            w as unknown as {
                _wc_handlers: Record<string, (() => void)[]>;
            }
        )._wc_handlers["did-finish-load"];
        for (const cb of load_handler ?? []) {
            cb();
        }
        expect(send_spy).toHaveBeenCalledTimes(1);
    });

    it("窗口加载完成后 send_focus 直接发出，不再缓冲", () => {
        const w = make_window();
        const send_spy = vi.fn();
        w.webContents.send = send_spy as never;
        const controller = create_history_window_controller({
            create_window: () => w,
        });

        controller.open_or_focus();
        const load_handler = (
            w as unknown as {
                _wc_handlers: Record<string, (() => void)[]>;
            }
        )._wc_handlers["did-finish-load"];
        for (const cb of load_handler ?? []) {
            cb();
        }

        controller.open_or_focus(TEST_LOC);
        expect(send_spy).toHaveBeenCalledWith(IPC_CHANNELS.SESSION_HISTORY_FOCUS, TEST_LOC);
    });

    it("open_or_focus(loc) 已开时发 SESSION_HISTORY_FOCUS 定位", () => {
        const send_spy = vi.fn();
        const controller = create_history_window_controller({
            create_window: () => {
                const w = make_window();
                w.webContents.send = send_spy as never;
                return w;
            },
        });
        controller.open_or_focus();
        // 加载完成后（loading 清空）后续 open 直接补发。
        const w = controller.get_window() as unknown as {
            _wc_handlers: Record<string, (() => void)[]>;
        };
        for (const cb of w._wc_handlers["did-finish-load"] ?? []) {
            cb();
        }

        controller.open_or_focus(TEST_LOC);

        expect(send_spy).toHaveBeenCalledWith(IPC_CHANNELS.SESSION_HISTORY_FOCUS, TEST_LOC);
    });

    it("send_focus 窗口未开时 no-op 不抛", () => {
        const controller = create_history_window_controller({
            create_window: () => make_window(),
        });
        expect(() => {
            controller.send_focus({
                source: "claude_code",
                env: "win",
                session_id: "s1",
            });
        }).not.toThrow();
    });

    it("send_focus 已开时发 SESSION_HISTORY_FOCUS 定位", () => {
        const send_spy = vi.fn();
        const controller = create_history_window_controller({
            create_window: () => {
                const w = make_window();
                w.webContents.send = send_spy as never;
                return w;
            },
        });
        controller.open_or_focus();
        const w = controller.get_window() as unknown as {
            _wc_handlers: Record<string, (() => void)[]>;
        };
        for (const cb of w._wc_handlers["did-finish-load"] ?? []) {
            cb();
        }

        controller.send_focus({
            source: "claude_code",
            env: "win",
            session_id: "s9",
        });
        expect(send_spy).toHaveBeenCalledWith(IPC_CHANNELS.SESSION_HISTORY_FOCUS, {
            source: "claude_code",
            env: "win",
            session_id: "s9",
        });
    });

    it("shutdown 销毁当前窗口并释放，幂等", () => {
        const destroy_spy = vi.fn();
        const controller = create_history_window_controller({
            create_window: () => {
                const w = make_window();
                w.destroy = destroy_spy as never;
                return w;
            },
        });
        controller.open_or_focus();
        controller.shutdown();
        expect(destroy_spy).toHaveBeenCalledTimes(1);
        expect(controller.get_window()).toBeNull();
        expect(() => {
            controller.shutdown();
        }).not.toThrow();
    });
});
