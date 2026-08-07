import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { HistoryMessageLike } from "../../../shared/types/ipc";
import type { TokenStatsSession } from "../../../shared/types/token-stats";
import {
    effective_columns,
    layout_choices_for_count,
    occupied_count,
    type LayoutCount,
} from "../../lib/workspace/slots";
import type { PaneData } from "../../lib/workspace/pane";
import { selection_store, type SelectedItem } from "../../lib/workspace/selection-store";
import { format_entries } from "../../lib/workspace/copy-format";
import { SessionRail } from "./SessionRail";
import { WorkspaceToolbar } from "./WorkspaceToolbar";
import { SessionPickerModal } from "./SessionPickerModal";
import { RecentSessionsModal } from "./RecentSessionsModal";
import { SessionPane, type PaneView as PaneViewState } from "./SessionPane";
import { SelectionTray } from "./SelectionTray";
import { useWorkspaceColumns } from "./use-workspace-columns";
import { loc_key, selection_key, type Loc } from "./workspace-view-helpers";
import "../../styles/workspace.css";

export function WorkspaceView() {
    const {
        slots_state,
        columns,
        toast,
        open_session,
        add_session: hook_add_session,
        close_slot: hook_close_slot,
        move_slot_ui,
        clear_all: hook_clear_all,
        load_older,
    } = useWorkspaceColumns();

    const [layout, set_layout] = useState<LayoutCount>(3);
    const [container_width, set_container_width] = useState(() => window.innerWidth);
    const [picker_target, set_picker_target] = useState<number | null>(null);
    const [recent_open, set_recent_open] = useState(false);
    const [rail_collapsed, set_rail_collapsed] = useState(false);
    const [focused_index, set_focused_index] = useState<number | null>(null);
    const [outline_index, set_outline_index] = useState<number | null>(null);
    const [view, set_view] = useState<PaneViewState>({ show_time: false, compact: false });

    const container_ref = useRef<HTMLDivElement | null>(null);
    const anchors_ref = useRef<Record<string, string>>({});
    const hovered_ref = useRef<{ loc: Loc; id: string } | null>(null);

    const add_session = useCallback(
        (sess: Parameters<typeof hook_add_session>[0], index: number): void => {
            hook_add_session(sess, index);
            set_picker_target(null);
        },
        [hook_add_session],
    );

    const close_slot = useCallback(
        (index: number): void => {
            hook_close_slot(index);
            set_focused_index((prev) => (prev === index ? null : prev));
            set_outline_index((prev) => (prev === index ? null : prev));
        },
        [hook_close_slot],
    );

    const clear_all = useCallback((): void => {
        hook_clear_all();
        set_focused_index(null);
        set_outline_index(null);
    }, [hook_clear_all]);

    const confirm_recent = useCallback(
        (sessions: TokenStatsSession[]): void => {
            set_recent_open(false);
            if (sessions.length === 0) return;
            hook_clear_all();
            set_focused_index(null);
            set_outline_index(null);
            for (const sess of sessions) {
                open_session(
                    { source: sess.source, env: sess.env, session_id: sess.id },
                    { model: sess.model, cwd: sess.directory },
                );
            }
        },
        [hook_clear_all, open_session],
    );

    const make_item = useCallback(
        (loc: Loc, message: HistoryMessageLike, col: PaneData): SelectedItem => {
            let role_count = 0;
            for (const m of col.messages) {
                if (m.id === message.id) break;
                if (m.role === message.role) role_count += 1;
            }
            const slot = slots_state.find((s) => s !== null && loc_key(s.loc) === loc_key(loc));
            return {
                key: selection_key(loc, message.id),
                loc,
                message,
                role_index: role_count + 1,
                session_title: slot?.title ?? col.title,
            };
        },
        [slots_state],
    );

    const shift_select = useCallback(
        (loc: Loc, message_id: string): void => {
            const col = columns[loc_key(loc)];
            if (!col) return;
            const anchor_id = anchors_ref.current[loc_key(loc)] ?? message_id;
            const anchor_idx = col.messages.findIndex((m) => m.id === anchor_id);
            const cur_idx = col.messages.findIndex((m) => m.id === message_id);
            const lo = Math.min(anchor_idx, cur_idx);
            const hi = Math.max(anchor_idx, cur_idx);
            if (lo < 0 || hi < 0) return;
            const range = col.messages.slice(lo, hi + 1).map((m) => make_item(loc, m, col));
            selection_store.set_session(loc, range);
        },
        [columns, make_item],
    );

    const toggle_select = useCallback(
        (loc: Loc, message_id: string, shift: boolean): void => {
            const col = columns[loc_key(loc)];
            if (!col) return;
            const m = col.messages.find((x) => x.id === message_id);
            if (!m) return;
            if (shift) {
                shift_select(loc, message_id);
                return;
            }
            anchors_ref.current[loc_key(loc)] = message_id;
            selection_store.toggle(make_item(loc, m, col));
        },
        [columns, make_item, shift_select],
    );

    const select_all_in_column = useCallback(
        (loc: Loc): void => {
            const col = columns[loc_key(loc)];
            if (!col) return;
            selection_store.set_session(
                loc,
                col.messages.map((m) => make_item(loc, m, col)),
            );
        },
        [columns, make_item],
    );

    const clear_selection_in_column = useCallback((loc: Loc): void => {
        selection_store.clear_session(loc);
    }, []);

    const is_selected = useCallback(
        (loc: Loc, id: string): boolean => selection_store.has(loc, id),
        [],
    );

    useSyncExternalStore(selection_store.subscribe, () => selection_store.all());

    useEffect(() => {
        function on_keydown(e: KeyboardEvent): void {
            if (e.ctrlKey && e.shiftKey && e.key.toUpperCase() === "C") {
                const text = format_entries(selection_store.all(), "markdown");
                if (text) {
                    void navigator.clipboard.writeText(text).catch(() => {
                        // 忽略剪贴板拒绝。
                    });
                }
                return;
            }
            if (e.code === "Space" && hovered_ref.current) {
                e.preventDefault();
                toggle_select(hovered_ref.current.loc, hovered_ref.current.id, false);
            }
        }
        window.addEventListener("keydown", on_keydown);
        return () => {
            window.removeEventListener("keydown", on_keydown);
        };
    }, [toggle_select]);

    const set_hovered = useCallback((loc: Loc | null, id: string | null): void => {
        hovered_ref.current = loc && id ? { loc, id } : null;
    }, []);

    useEffect(() => {
        const container = container_ref.current;
        if (!container || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver((entries) => {
            const w = entries[0]?.contentRect.width;
            if (w) set_container_width(Math.round(w));
        });
        ro.observe(container);
        return () => {
            ro.disconnect();
        };
    }, []);

    useEffect(() => {
        function on_keydown(e: KeyboardEvent): void {
            const target = e.target;
            const in_editable =
                target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement ||
                (target instanceof HTMLElement && target.isContentEditable);
            if (in_editable) return;

            const occupied = slots_state
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
                if (slots_state[idx] !== null) set_focused_index(idx);
                return;
            }

            if (e.key === "[" || e.key === "]") {
                if (occupied.length === 0) return;
                if (focused_index === null || !occupied.includes(focused_index)) {
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
    }, [slots_state, focused_index, outline_index]);

    const count = occupied_count(slots_state);

    useEffect(() => {
        const choices = layout_choices_for_count(count);
        if (choices.length === 0) return;
        set_layout((current) =>
            choices.some((choice) => choice.columns === current)
                ? current
                : (choices[0]?.columns ?? current),
        );
    }, [count]);

    const cols = Math.max(1, Math.min(effective_columns(layout, container_width), count));

    const open_picker = useCallback((index: number): void => {
        set_picker_target(index);
    }, []);

    return (
        <div className="workspace">
            <WorkspaceToolbar
                layout={layout}
                count={count}
                view={view}
                on_view_change={set_view}
                on_layout_change={set_layout}
                on_recent={() => {
                    set_recent_open(true);
                }}
                on_clear={clear_all}
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
                                            is_selected={(id) => is_selected(slot.loc, id)}
                                            on_close={() => {
                                                close_slot(index);
                                            }}
                                            on_toggle={(id, shift) => {
                                                toggle_select(slot.loc, id, shift);
                                            }}
                                            on_hover={(id) => {
                                                set_hovered(slot.loc, id);
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
            <SelectionTray />
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
