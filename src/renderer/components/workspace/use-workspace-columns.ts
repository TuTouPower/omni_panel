import { useCallback, useEffect, useRef, useState } from "react";
import type { TokenStatsSession } from "../../../shared/types/token-stats";
import { HISTORY_PAGE_SIZE } from "../../lib/session-history/layout";
import {
    clear_slots,
    empty_slots,
    find_slot_by_loc,
    move_slot,
    remove_slot,
    session_meta,
    try_add_slot,
    try_assign_slot,
    type SlotsState,
} from "../../lib/workspace/slots";
import type { PaneData } from "../../lib/workspace/pane";
import { selection_store } from "../../lib/workspace/selection-store";
import { FALLBACK_MS, initial_loc, loc_key, merge_tail, type Loc } from "./workspace-view-helpers";

export interface UseWorkspaceColumnsReturn {
    readonly slots_state: SlotsState;
    readonly columns: Record<string, PaneData>;
    readonly toast: string | null;
    readonly show_toast: (message: string) => void;
    readonly open_session: (loc: Loc, meta?: { model?: string; cwd?: string | null }) => void;
    readonly add_session: (sess: TokenStatsSession, index: number) => void;
    readonly close_slot: (index: number) => void;
    readonly move_slot_ui: (from: number, to: number) => void;
    readonly clear_all: () => void;
    readonly load_older: (loc: Loc) => void;
    /** t252: 手动刷新——对全部 ready 槽位立即重拉消息（标题栏刷新按钮）。 */
    readonly refresh_all: () => void;
}

export function useWorkspaceColumns(): UseWorkspaceColumnsReturn {
    const [slots_state, set_slots_state] = useState<SlotsState>(empty_slots);
    const [columns, set_columns] = useState<Record<string, PaneData>>({});
    const [toast, set_toast] = useState<string | null>(null);

    const slots_ref = useRef(slots_state);
    const apply_slots = useCallback((next: SlotsState): void => {
        slots_ref.current = next;
        set_slots_state(next);
    }, []);

    const columns_ref = useRef(columns);
    columns_ref.current = columns;
    const loading_older_locks = useRef<Set<string>>(new Set());
    const toast_timer = useRef<number | null>(null);

    const show_toast = useCallback((message: string): void => {
        set_toast(message);
        if (toast_timer.current !== null) window.clearTimeout(toast_timer.current);
        toast_timer.current = window.setTimeout(() => {
            set_toast(null);
        }, 2500);
    }, []);

    const update_column = useCallback((loc: Loc, patch: Partial<PaneData>): void => {
        const key = loc_key(loc);
        set_columns((prev) =>
            prev[key] === undefined ? prev : { ...prev, [key]: { ...prev[key], ...patch } },
        );
    }, []);

    const load_older = useCallback(
        (loc: Loc): void => {
            const key = loc_key(loc);
            if (loading_older_locks.current.has(key)) return;
            const col = columns_ref.current[key];
            if (!col || col.loading_older || !col.next_cursor || col.status !== "ready") return;
            loading_older_locks.current.add(key);
            update_column(loc, { loading_older: true });
            void window.usageboard.sessionHistory
                .query(loc.source, loc.env, loc.session_id, {
                    limit: HISTORY_PAGE_SIZE,
                    before_cursor: col.next_cursor,
                })
                .then((q) => {
                    loading_older_locks.current.delete(key);
                    set_columns((prev) => {
                        const cur = prev[key];
                        if (!cur) return prev;
                        return {
                            ...prev,
                            [key]: {
                                ...cur,
                                messages: [...q.messages, ...cur.messages],
                                next_cursor: q.next_cursor,
                                loading_older: false,
                            },
                        };
                    });
                })
                .catch(() => {
                    loading_older_locks.current.delete(key);
                    update_column(loc, { loading_older: false });
                });
        },
        [update_column],
    );

    const refresh_slot_meta = useCallback(
        (loc: Loc): void => {
            void window.usageboard.tokenStats
                .getSessions({ source: loc.source, env: loc.env, search: loc.session_id, limit: 5 })
                .then((sessions) => {
                    const row = sessions.find((s) => s.id === loc.session_id);
                    if (!row) return;
                    const key = loc_key(loc);
                    apply_slots(
                        slots_ref.current.map((slot) =>
                            slot !== null && loc_key(slot.loc) === key
                                ? {
                                      ...slot,
                                      title: row.title ?? slot.title,
                                      model: row.model || slot.model,
                                      cwd: row.directory ?? slot.cwd,
                                      calls: row.calls,
                                      tokens:
                                          row.input_tokens +
                                          row.output_tokens +
                                          row.cache_read_tokens +
                                          row.cache_write_tokens,
                                  }
                                : slot,
                        ),
                    );
                    if (row.title) update_column(loc, { title: row.title });
                })
                .catch(() => {
                    // 元数据可选，忽略。
                });
        },
        [apply_slots, update_column],
    );

    const mount_column = useCallback(
        (loc: Loc): void => {
            const now = Date.now();
            const key = loc_key(loc);
            const empty: PaneData = {
                loc,
                title: loc.session_id,
                openedAt: now,
                messages: [],
                next_cursor: null,
                loading_older: false,
                status: "loading",
            };
            set_columns((prev) => ({ ...prev, [key]: empty }));
            void window.usageboard.sessionHistory
                .subscribe(loc.source, loc.env, loc.session_id)
                .catch(() => {
                    // 源文件缺失：订阅拒绝不抛 unhandled，query 拒绝置 missing。
                });
            void (async () => {
                refresh_slot_meta(loc);
                try {
                    const q = await window.usageboard.sessionHistory.query(
                        loc.source,
                        loc.env,
                        loc.session_id,
                        { limit: HISTORY_PAGE_SIZE },
                    );
                    set_columns((prev) => {
                        const cur = prev[key];
                        if (!cur) return prev;
                        return {
                            ...prev,
                            [key]: {
                                ...cur,
                                messages: q.messages,
                                next_cursor: q.next_cursor,
                                status: "ready",
                            },
                        };
                    });
                } catch {
                    set_columns((prev) => {
                        const cur = prev[key];
                        if (!cur) return prev;
                        return { ...prev, [key]: { ...cur, status: "missing" } };
                    });
                }
            })();
        },
        [refresh_slot_meta],
    );

    const open_session = useCallback(
        (loc: Loc, meta?: { model?: string; cwd?: string | null }): void => {
            const existing = find_slot_by_loc(slots_ref.current, loc);
            if (existing !== null) {
                const el = document.querySelector<HTMLElement>(
                    `.slot-pane[data-loc-key="${CSS.escape(loc_key(loc))}"]`,
                );
                el?.scrollIntoView({ block: "nearest" });
                return;
            }
            const r = try_add_slot(
                slots_ref.current,
                session_meta(
                    {
                        id: loc.session_id,
                        source: loc.source as TokenStatsSession["source"],
                        env: loc.env as TokenStatsSession["env"],
                        model: meta?.model ?? "",
                        title: null,
                        directory: meta?.cwd ?? null,
                        input_tokens: 0,
                        output_tokens: 0,
                        cache_read_tokens: 0,
                        cache_write_tokens: 0,
                        calls: 0,
                        started_at: Date.now(),
                        ended_at: Date.now(),
                    },
                    Date.now(),
                ),
            );
            if (!r.accepted || r.index === null) {
                show_toast("槽位已满（最多 8 个）");
                return;
            }
            apply_slots(r.next);
            mount_column(loc);
        },
        [apply_slots, mount_column, show_toast],
    );

    const add_session = useCallback(
        (sess: TokenStatsSession, index: number): void => {
            const loc: Loc = { source: sess.source, env: sess.env, session_id: sess.id };
            const existing = find_slot_by_loc(slots_ref.current, loc);
            if (existing !== null) {
                show_toast(`该会话已在槽位 ${String(existing + 1)}`);
                return;
            }
            const r = try_assign_slot(slots_ref.current, index, session_meta(sess, Date.now()));
            if (!r.accepted) {
                show_toast("该槽位已有会话");
                return;
            }
            apply_slots(r.next);
            mount_column(loc);
        },
        [apply_slots, mount_column, show_toast],
    );

    const close_slot = useCallback(
        (index: number): void => {
            const slot = slots_ref.current[index];
            if (!slot) return;
            const key = loc_key(slot.loc);
            void window.usageboard.sessionHistory
                .unsubscribe(slot.loc.source, slot.loc.env, slot.loc.session_id)
                .catch(() => {
                    // 窗口/进程关闭 IPC 拒绝忽略。
                });
            apply_slots(remove_slot(slots_ref.current, index));
            set_columns((prev) =>
                Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key)),
            );
            selection_store.clear_session(slot.loc);
        },
        [apply_slots],
    );

    const move_slot_ui = useCallback(
        (from: number, to: number): void => {
            apply_slots(move_slot(slots_ref.current, from, to));
        },
        [apply_slots],
    );

    const clear_all = useCallback((): void => {
        for (const slot of slots_ref.current) {
            if (!slot) continue;
            void window.usageboard.sessionHistory
                .unsubscribe(slot.loc.source, slot.loc.env, slot.loc.session_id)
                .catch(() => {
                    // 忽略 IPC 拒绝。
                });
        }
        apply_slots(clear_slots());
        set_columns({});
        selection_store.clear_all();
    }, [apply_slots]);

    const refresh_all = useCallback((): void => {
        const cols = columns_ref.current;
        for (const col of Object.values(cols)) {
            if (col.status !== "ready") continue;
            void window.usageboard.sessionHistory
                .query(col.loc.source, col.loc.env, col.loc.session_id, {
                    limit: HISTORY_PAGE_SIZE,
                })
                .then((q) => {
                    set_columns((prev) => {
                        const cur = prev[loc_key(col.loc)];
                        if (!cur) return prev;
                        return {
                            ...prev,
                            [loc_key(col.loc)]: {
                                ...cur,
                                messages: merge_tail(cur.messages, q.messages),
                            },
                        };
                    });
                })
                .catch(() => {
                    // 兜底失败忽略；下个周期或推送接管。
                });
        }
    }, []);

    useEffect(() => {
        const off_updated = window.usageboard.sessionHistory.onMessagesUpdated((payload) => {
            const key = loc_key(payload);
            set_columns((prev) => {
                const cur = prev[key];
                if (!cur) return prev;
                return {
                    ...prev,
                    [key]: { ...cur, messages: merge_tail(cur.messages, payload.messages) },
                };
            });
        });
        const off_focus = window.usageboard.sessionHistory.onFocus((loc) => {
            open_session(loc);
        });

        const timer = window.setInterval(refresh_all, FALLBACK_MS);

        const initial = initial_loc();
        if (initial) open_session(initial);

        return () => {
            off_updated();
            off_focus();
            window.clearInterval(timer);
        };
    }, [open_session, refresh_all]);

    useEffect(() => {
        return () => {
            for (const slot of slots_ref.current) {
                if (!slot) continue;
                void window.usageboard.sessionHistory
                    .unsubscribe(slot.loc.source, slot.loc.env, slot.loc.session_id)
                    .catch(() => {
                        // 窗口关闭 IPC 拒绝忽略。
                    });
            }
        };
    }, []);

    return {
        slots_state,
        columns,
        toast,
        show_toast,
        open_session,
        add_session,
        close_slot,
        move_slot_ui,
        clear_all,
        load_older,
        refresh_all,
    };
}
