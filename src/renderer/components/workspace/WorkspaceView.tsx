import { useCallback, useEffect, useRef, useState } from "react";
import type { HistoryMessageLike, SessionHistoryLoc } from "../../../shared/types/ipc";
import type { TokenStatsSession } from "../../../shared/types/token-stats";
import { HISTORY_PAGE_SIZE } from "../../lib/session-history/layout";
import { build_copy_markdown, format_date } from "../../lib/session-history/markdown";
import {
    clear_slots,
    effective_columns,
    empty_slots,
    find_slot_by_loc,
    move_slot,
    occupied_count,
    remove_slot,
    session_meta,
    try_add_slot,
    try_assign_slot,
    type LayoutCount,
    type SlotsState,
} from "../../lib/workspace/slots";
import type { PaneData } from "../../lib/workspace/pane";
import { SessionRail } from "./SessionRail";
import { WorkspaceToolbar } from "./WorkspaceToolbar";
import { SessionPickerModal } from "./SessionPickerModal";
import { RecentSessionsModal } from "./RecentSessionsModal";
import { SessionPane, type PaneView } from "./SessionPane";
import "../../styles/workspace.css";

type Loc = SessionHistoryLoc;

const FALLBACK_MS = 5000;

function loc_key(loc: Loc): string {
    return `${loc.source}|${loc.env}|${loc.session_id}`;
}

function selection_key(loc: Loc, message_id: string): string {
    return `${loc_key(loc)}|${message_id}`;
}

function merge_tail(
    existing: readonly HistoryMessageLike[],
    incoming: readonly HistoryMessageLike[],
): readonly HistoryMessageLike[] {
    const seen = new Set(existing.map((m) => m.id));
    const fresh = incoming.filter((m) => !seen.has(m.id));
    if (fresh.length === 0) return existing;
    return [...existing, ...fresh];
}

/** 从 URL query `loc` 读初始定位参数（主进程 route_query 传入，t211 逻辑）。 */
function initial_loc(): Loc | null {
    const raw = new URLSearchParams(window.location.search).get("loc");
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Partial<Loc>;
        if (
            typeof parsed.source === "string" &&
            typeof parsed.env === "string" &&
            typeof parsed.session_id === "string"
        ) {
            return { source: parsed.source, env: parsed.env, session_id: parsed.session_id };
        }
    } catch {
        // 忽略解析失败，空窗打开。
    }
    return null;
}

export function WorkspaceView() {
    const [slots_state, set_slots_state] = useState<SlotsState>(empty_slots);
    const [columns, set_columns] = useState<Record<string, PaneData>>({});
    const [selected, set_selected] = useState<ReadonlySet<string>>(() => new Set());
    const [layout, set_layout] = useState<LayoutCount>(3);
    const [container_width, set_container_width] = useState(() => window.innerWidth);
    const [picker_target, set_picker_target] = useState<number | null>(null);
    const [recent_open, set_recent_open] = useState(false);
    const [rail_collapsed, set_rail_collapsed] = useState(false);
    const [toast, set_toast] = useState<string | null>(null);
    const [focused_index, set_focused_index] = useState<number | null>(null);
    const [outline_index, set_outline_index] = useState<number | null>(null);
    const [view, set_view] = useState<PaneView>({ show_time: false, compact: false });

    // 槽位用「state + 同步 ref」双维护：open_session 等批量打开循环在 React 批处理
    // 下读 render-fresh ref 会 stale（t211 同款踩坑），此处所有槽位写操作先同步 ref
    // 再 set state，保证同批连续调用读到最新槽位。
    const slots_ref = useRef(slots_state);
    const apply_slots = useCallback((next: SlotsState): void => {
        slots_ref.current = next;
        set_slots_state(next);
    }, []);

    const columns_ref = useRef(columns);
    columns_ref.current = columns;
    const selected_ref = useRef(selected);
    selected_ref.current = selected;
    const loading_older_locks = useRef<Set<string>>(new Set());
    const toast_timer = useRef<number | null>(null);
    const container_ref = useRef<HTMLDivElement | null>(null);

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

    /** 查询该会话完整元数据（标题/model/cwd/轮数/tokens）并更新槽位 meta。
     *  基于 ref 计算走 apply_slots，保持 ref 与 state 同步（f003）。 */
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
                // 同 loc 重复装入会双槽共享订阅/列数据，关闭其一破坏另一个（f002）。
                show_toast(`该会话已在槽位 ${String(existing + 1)}`);
                set_picker_target(null);
                return;
            }
            const r = try_assign_slot(slots_ref.current, index, session_meta(sess, Date.now()));
            if (!r.accepted) {
                show_toast("该槽位已有会话");
                return;
            }
            apply_slots(r.next);
            set_picker_target(null);
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
            set_selected((prev) => {
                const next = new Set(prev);
                for (const k of prev) {
                    if (k.startsWith(`${key}|`)) next.delete(k);
                }
                return next;
            });
            // 聚焦/大纲槽位被关闭时清空索引，避免网格残留 focused 态（f002）。
            set_focused_index((prev) => (prev === index ? null : prev));
            set_outline_index((prev) => (prev === index ? null : prev));
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
        set_selected(new Set());
        set_focused_index(null);
        set_outline_index(null);
    }, [apply_slots]);

    const toggle_select = useCallback((loc: Loc, message_id: string): void => {
        const key = selection_key(loc, message_id);
        set_selected((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    }, []);

    const select_all_in_column = useCallback((loc: Loc): void => {
        const col = columns_ref.current[loc_key(loc)];
        if (!col) return;
        set_selected((prev) => {
            const next = new Set(prev);
            for (const m of col.messages) next.add(selection_key(loc, m.id));
            return next;
        });
    }, []);

    const clear_selection_in_column = useCallback((loc: Loc): void => {
        const key = loc_key(loc);
        set_selected((prev) => {
            const next = new Set(prev);
            for (const k of prev) {
                if (k.startsWith(`${key}|`)) next.delete(k);
            }
            return next;
        });
    }, []);

    const copy_selected = useCallback((): void => {
        const sections: {
            title: string;
            source: string;
            date: string;
            messages: { role: "user" | "assistant"; text: string; timestamp: number | null }[];
        }[] = [];
        for (const slot of slots_ref.current) {
            if (!slot) continue;
            const col = columns_ref.current[loc_key(slot.loc)];
            if (!col) continue;
            const sel = col.messages.filter((m) =>
                selected_ref.current.has(selection_key(col.loc, m.id)),
            );
            if (sel.length === 0) continue;
            const first_ts = col.messages.find((m) => m.timestamp !== null)?.timestamp ?? null;
            sections.push({
                title: col.title,
                source: col.loc.source,
                date: format_date(first_ts ?? col.openedAt),
                messages: sel.map((m) => ({ role: m.role, text: m.text, timestamp: m.timestamp })),
            });
        }
        if (sections.length === 0) return;
        const md = build_copy_markdown(sections);
        if (!md) return;
        void navigator.clipboard.writeText(md).catch(() => {
            // 失焦窗口剪贴板写可能被拒；不给反馈也不抛 unhandled。
        });
    }, []);

    // 订阅推送 + 5s 兜底 + 初始定位 + 容器宽度。
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

        const timer = window.setInterval(() => {
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
        }, FALLBACK_MS);

        const initial = initial_loc();
        if (initial) open_session(initial);

        const container = container_ref.current;
        if (container && typeof ResizeObserver !== "undefined") {
            const ro = new ResizeObserver((entries) => {
                const w = entries[0]?.contentRect.width;
                if (w) set_container_width(Math.round(w));
            });
            ro.observe(container);
            return () => {
                ro.disconnect();
                off_updated();
                off_focus();
                window.clearInterval(timer);
            };
        }

        return () => {
            off_updated();
            off_focus();
            window.clearInterval(timer);
        };
    }, [open_session]);

    // 卸载时注销全部订阅。
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

    // 快捷键：1-8 聚焦对应槽位、[ ] 循环切换聚焦、Esc 逐层退出（大纲 → 聚焦 → 普通）。
    useEffect(() => {
        function on_keydown(e: KeyboardEvent): void {
            const target = e.target;
            const in_editable =
                target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement ||
                (target instanceof HTMLElement && target.isContentEditable);
            if (in_editable) return;

            const occupied = slots_ref.current
                .map((s, i) => (s === null ? null : i))
                .filter((i): i is number => i !== null);

            if (e.key === "Escape") {
                if (outline_index !== null) {
                    set_outline_index(null);
                } else if (focused_index !== null) {
                    set_focused_index(null);
                }
                return;
            }

            if (/^[1-8]$/.test(e.key)) {
                const idx = Number.parseInt(e.key, 10) - 1;
                if (slots_ref.current[idx] !== null) set_focused_index(idx);
                return;
            }

            if (e.key === "[" || e.key === "]") {
                if (occupied.length === 0) return;
                if (focused_index === null || !occupied.includes(focused_index)) {
                    // 无聚焦或聚焦槽已空：首次进入循环聚焦第一个占用槽（f004）。
                    set_focused_index(occupied[0] ?? null);
                    return;
                }
                const pos = occupied.indexOf(focused_index);
                const dir = e.key === "[" ? -1 : 1;
                const next_pos = (pos + dir + occupied.length) % occupied.length;
                const next = occupied[next_pos] ?? occupied[0] ?? null;
                if (next !== null) set_focused_index(next);
            }
        }
        window.addEventListener("keydown", on_keydown);
        return () => {
            window.removeEventListener("keydown", on_keydown);
        };
    }, [focused_index, outline_index]);

    const count = occupied_count(slots_state);
    const cols = Math.max(1, Math.min(effective_columns(layout, container_width), count));
    const total_selected = selected.size;

    const open_picker = useCallback((index: number): void => {
        set_picker_target(index);
    }, []);

    const confirm_recent = useCallback(
        (sessions: TokenStatsSession[]): void => {
            set_recent_open(false);
            if (sessions.length === 0) return;
            // 替换全部槽位前退订旧槽位，避免 watcher 泄漏（f004）。
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
            set_selected(new Set());
            set_focused_index(null);
            set_outline_index(null);
            for (const sess of sessions) {
                // 直接带完整 model/cwd 建槽，避免 pane 头部缺这两项（f001）。
                open_session(
                    { source: sess.source, env: sess.env, session_id: sess.id },
                    { model: sess.model, cwd: sess.directory },
                );
            }
        },
        [apply_slots, open_session],
    );

    return (
        <div className="workspace">
            <WorkspaceToolbar
                layout={layout}
                count={count}
                total_selected={total_selected}
                view={view}
                on_view_change={set_view}
                on_layout_change={set_layout}
                on_recent={() => {
                    set_recent_open(true);
                }}
                on_clear={clear_all}
                on_copy={copy_selected}
            />
            <div className="workspace-body">
                <SessionRail
                    slots={slots_state}
                    collapsed={rail_collapsed}
                    on_toggle_collapse={() => {
                        set_rail_collapsed((v) => !v);
                    }}
                    on_pick={open_picker}
                    on_close={close_slot}
                    on_move={move_slot_ui}
                />
                <div className="workspace-main" ref={container_ref}>
                    {count === 0 ? (
                        <div className="workspace-empty">
                            <p className="workspace-empty-title">工作台为空</p>
                            <p className="workspace-empty-sub">
                                打开最近会话，或从会话库选择会话装入槽位
                            </p>
                            <div className="workspace-empty-actions">
                                <button
                                    type="button"
                                    className="workspace-empty-btn"
                                    onClick={() => {
                                        set_recent_open(true);
                                    }}
                                >
                                    打开最近会话
                                </button>
                                <button
                                    type="button"
                                    className="workspace-empty-btn"
                                    onClick={() => {
                                        open_picker(0);
                                    }}
                                >
                                    去会话库
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div
                            className={"slot-grid" + (focused_index !== null ? " focused" : "")}
                            style={{ "--cols": String(cols) } as React.CSSProperties}
                        >
                            {slots_state.map((slot, index) =>
                                slot === null ? null : (
                                    <div
                                        className="slot-pane"
                                        key={loc_key(slot.loc)}
                                        data-loc-key={loc_key(slot.loc)}
                                        data-focused={focused_index === index}
                                    >
                                        <SessionPane
                                            slot_index={index}
                                            slot_meta={slot}
                                            column={
                                                columns[loc_key(slot.loc)] ?? {
                                                    loc: slot.loc,
                                                    title: slot.title,
                                                    openedAt: slot.opened_at,
                                                    messages: [],
                                                    next_cursor: null,
                                                    loading_older: false,
                                                    status: "loading",
                                                }
                                            }
                                            focused={focused_index === index}
                                            outline_open={outline_index === index}
                                            view={view}
                                            is_selected={(id) =>
                                                selected.has(selection_key(slot.loc, id))
                                            }
                                            on_close={() => {
                                                close_slot(index);
                                            }}
                                            on_toggle={(id) => {
                                                toggle_select(slot.loc, id);
                                            }}
                                            on_select_all={() => {
                                                select_all_in_column(slot.loc);
                                            }}
                                            on_clear_select={() => {
                                                clear_selection_in_column(slot.loc);
                                            }}
                                            on_load_older={() => {
                                                load_older(slot.loc);
                                            }}
                                            on_focus={() => {
                                                set_focused_index((prev) =>
                                                    prev === index ? null : index,
                                                );
                                            }}
                                            on_toggle_outline={() => {
                                                set_outline_index((prev) =>
                                                    prev === index ? null : index,
                                                );
                                            }}
                                        />
                                    </div>
                                ),
                            )}
                        </div>
                    )}
                </div>
            </div>
            {picker_target !== null && (
                <SessionPickerModal
                    target_index={picker_target}
                    open_session_ids={
                        new Set(
                            slots_state
                                .filter((s): s is NonNullable<typeof s> => s !== null)
                                .map((s) => s.loc.session_id),
                        )
                    }
                    on_pick={add_session}
                    on_close={() => {
                        set_picker_target(null);
                    }}
                />
            )}
            {recent_open && (
                <RecentSessionsModal
                    on_confirm={confirm_recent}
                    on_close={() => {
                        set_recent_open(false);
                    }}
                />
            )}
            {toast !== null && <div className="workspace-toast">{toast}</div>}
        </div>
    );
}
