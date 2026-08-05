import { useCallback, useEffect, useRef, useState } from "react";
import type { HistoryMessageLike, SessionHistoryLoc } from "../../shared/types/ipc";
import { HistoryColumn, type HistoryColumnData } from "../components/session-history/HistoryColumn";
import { HistoryOverflowModal } from "../components/session-history/HistoryOverflowModal";
import { HISTORY_PAGE_SIZE, grid_class } from "../lib/session-history/layout";
import { build_copy_markdown, format_date } from "../lib/session-history/markdown";
import "../styles/session-history.css";

const MAX_COLUMNS = 6;
const FALLBACK_MS = 5000;

type Loc = SessionHistoryLoc;

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

/** 从 URL query `loc` 读初始定位参数（主进程 route_query 传入）。 */
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

export function SessionHistoryView() {
    const [columns, set_columns] = useState<readonly HistoryColumnData[]>([]);
    const [selected, set_selected] = useState<ReadonlySet<string>>(() => new Set());
    const [pending, set_pending] = useState<readonly Loc[]>([]);
    const [copied, set_copied] = useState(false);

    const columns_ref = useRef(columns);
    columns_ref.current = columns;
    const selected_ref = useRef(selected);
    selected_ref.current = selected;
    // load_older 并发锁：滚动到顶事件可能在 loading_older 状态落盘前重复触发。
    const loading_older_locks = useRef<Set<string>>(new Set());
    // 同步栏计数：capacity 检查用此值而非 columns_ref（批量 open 循环内 ref 不刷新，
    // 用 stale length 会把第 7+ 个也直接挂载，违反 AC3 弹模态框腾位）。
    const opened_count_ref = useRef(0);

    const update_column = useCallback((loc: Loc, patch: Partial<HistoryColumnData>): void => {
        const key = loc_key(loc);
        set_columns((prev) => prev.map((c) => (loc_key(c.loc) === key ? { ...c, ...patch } : c)));
    }, []);

    const load_older = useCallback(
        (loc: Loc): void => {
            const key = loc_key(loc);
            if (loading_older_locks.current.has(key)) return;
            const col = columns_ref.current.find((c) => loc_key(c.loc) === key);
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
                    // 用函数式 setState 合并，避免与在途推送竞态（读 freshest 状态）。
                    set_columns((prev) =>
                        prev.map((c) =>
                            loc_key(c.loc) === key
                                ? {
                                      ...c,
                                      messages: [...q.messages, ...c.messages],
                                      next_cursor: q.next_cursor,
                                      loading_older: false,
                                  }
                                : c,
                        ),
                    );
                })
                .catch(() => {
                    loading_older_locks.current.delete(key);
                    update_column(loc, { loading_older: false });
                });
        },
        [update_column],
    );

    const mount_column = useCallback(
        (loc: Loc): void => {
            const now = Date.now();
            const empty: HistoryColumnData = {
                loc,
                title: loc.session_id,
                openedAt: now,
                messages: [],
                next_cursor: null,
                loading_older: false,
                status: "loading",
            };
            // 同步占位：capacity 检查用 opened_count_ref 而不是 columns_ref（后者仅
            // render 时刷新，批量 open 循环内读 stale 值会超 6 上限）。
            opened_count_ref.current += 1;
            set_columns((prev) => [...prev, empty]);
            void window.usageboard.sessionHistory
                .subscribe(loc.source, loc.env, loc.session_id)
                .catch(() => {
                    // 源文件缺失（决策 12 空态）：订阅拒绝不抛 unhandled rejection，
                    // 空态由下方 query 拒绝置 status=missing 展示。
                });
            void (async () => {
                // 解析标题（token-stats session 行）；失败回退 session_id。
                try {
                    const sessions = await window.usageboard.tokenStats.getSessions({
                        source: loc.source,
                        env: loc.env,
                        search: loc.session_id,
                        limit: 5,
                    });
                    const row = sessions.find((s) => s.id === loc.session_id);
                    if (row?.title) {
                        update_column(loc, { title: row.title });
                    }
                } catch {
                    // 标题可选，忽略。
                }
                if (!columns_ref.current.some((c) => loc_key(c.loc) === loc_key(loc))) return;
                try {
                    const q = await window.usageboard.sessionHistory.query(
                        loc.source,
                        loc.env,
                        loc.session_id,
                        { limit: HISTORY_PAGE_SIZE },
                    );
                    update_column(loc, {
                        messages: q.messages,
                        next_cursor: q.next_cursor,
                        status: "ready",
                    });
                } catch {
                    update_column(loc, { status: "missing" });
                }
            })();
        },
        [update_column],
    );

    const open_session = useCallback(
        (loc: Loc): void => {
            const key = loc_key(loc);
            const open = columns_ref.current.some((c) => loc_key(c.loc) === key);
            if (open) {
                // 已开：滚动到该栏。
                document
                    .querySelector<HTMLElement>(
                        `.history-column[data-loc-key="${CSS.escape(key)}"]`,
                    )
                    ?.scrollIntoView({ block: "nearest" });
                return;
            }
            if (opened_count_ref.current >= MAX_COLUMNS) {
                set_pending((prev) =>
                    prev.some((p) => loc_key(p) === key) ? prev : [...prev, loc],
                );
                return;
            }
            mount_column(loc);
        },
        [mount_column],
    );

    const close_column = useCallback((loc: Loc): void => {
        const key = loc_key(loc);
        void window.usageboard.sessionHistory
            .unsubscribe(loc.source, loc.env, loc.session_id)
            .catch(() => {
                // 窗口/进程关闭时 IPC 可能拒绝，忽略。
            });
        opened_count_ref.current = Math.max(0, opened_count_ref.current - 1);
        set_columns((prev) => prev.filter((c) => loc_key(c.loc) !== key));
        set_selected((prev) => {
            const next = new Set(prev);
            for (const k of prev) {
                if (k.startsWith(`${key}|`)) next.delete(k);
            }
            return next;
        });
    }, []);

    const clear_all = useCallback((): void => {
        for (const c of columns_ref.current) {
            void window.usageboard.sessionHistory
                .unsubscribe(c.loc.source, c.loc.env, c.loc.session_id)
                .catch(() => {
                    // 忽略 IPC 拒绝。
                });
        }
        opened_count_ref.current = 0;
        set_columns([]);
        set_selected(new Set());
    }, []);

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
        const col = columns_ref.current.find((c) => loc_key(c.loc) === loc_key(loc));
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
        for (const col of columns_ref.current) {
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
        void navigator.clipboard
            .writeText(md)
            .then(() => {
                set_copied(true);
                setTimeout(() => {
                    set_copied(false);
                }, 1500);
            })
            .catch(() => {
                // 失焦窗口剪贴板写可能被拒；不给反馈也不抛 unhandled rejection。
            });
    }, []);

    const recent_six = useCallback((): void => {
        void window.usageboard.tokenStats
            .getSessions({ limit: 6 })
            .then((sessions) => {
                for (const s of sessions) {
                    open_session({ source: s.source, env: s.env, session_id: s.id });
                }
            })
            .catch(() => {
                // 拉取失败忽略；按钮下次点击重试。
            });
    }, [open_session]);

    // 订阅推送 + 5s 兜底 + 初始定位。
    useEffect(() => {
        const off_updated = window.usageboard.sessionHistory.onMessagesUpdated((payload) => {
            const key = loc_key(payload);
            set_columns((prev) =>
                prev.map((c) =>
                    loc_key(c.loc) === key
                        ? { ...c, messages: merge_tail(c.messages, payload.messages) }
                        : c,
                ),
            );
        });
        const off_focus = window.usageboard.sessionHistory.onFocus((loc) => {
            open_session(loc);
        });

        const timer = setInterval(() => {
            const cols = columns_ref.current.filter((c) => c.status === "ready");
            if (cols.length === 0) return;
            for (const col of cols) {
                void window.usageboard.sessionHistory
                    .query(col.loc.source, col.loc.env, col.loc.session_id, {
                        limit: HISTORY_PAGE_SIZE,
                    })
                    .then((q) => {
                        // 函数式合并：避免读 render-fresh 的 columns_ref 快照后整体替换，
                        // 与在途推送交错时新推送尾部消息短暂消失（f010）。
                        set_columns((prev) =>
                            prev.map((c) =>
                                loc_key(c.loc) === loc_key(col.loc)
                                    ? { ...c, messages: merge_tail(c.messages, q.messages) }
                                    : c,
                            ),
                        );
                    })
                    .catch(() => {
                        // 兜底失败忽略；下个周期或推送会接管。
                    });
            }
        }, FALLBACK_MS);

        const initial = initial_loc();
        if (initial) open_session(initial);

        return () => {
            off_updated();
            off_focus();
            clearInterval(timer);
        };
    }, [open_session, update_column]);

    // 卸载时注销全部订阅。
    useEffect(() => {
        return () => {
            for (const c of columns_ref.current) {
                void window.usageboard.sessionHistory
                    .unsubscribe(c.loc.source, c.loc.env, c.loc.session_id)
                    .catch(() => {
                        // 窗口关闭 IPC 拒绝忽略。
                    });
            }
        };
    }, []);

    const total_selected = selected.size;
    const show_modal = pending.length > 0;

    const modal_confirm = useCallback(
        (close_indices: number[]): void => {
            const to_close = close_indices
                .map((i) => columns_ref.current[i])
                .filter((c): c is HistoryColumnData => Boolean(c));
            for (const c of to_close) {
                close_column(c.loc);
            }
            const queued = pending;
            set_pending([]);
            // 用户已腾出 ≥ pending 个空位，直接逐个挂载（不再过 6 上限检查，
            // 否则 close 尚未 flush 时 ref 仍满会再次排队）。
            for (const loc of queued) {
                mount_column(loc);
            }
        },
        [close_column, mount_column, pending],
    );

    const grid = grid_class(columns.length);

    return (
        <div className="session-history">
            <header className="history-toolbar">
                <button type="button" className="history-tb-btn" onClick={clear_all}>
                    清空全部
                </button>
                <button
                    type="button"
                    className="history-tb-btn history-copy"
                    disabled={total_selected === 0}
                    onClick={copy_selected}
                >
                    {copied ? "已复制 ✓" : `复制 ${String(total_selected)} 条`}
                </button>
                <span className="history-count">
                    {String(columns.length)}/{String(MAX_COLUMNS)}
                </span>
                <button type="button" className="history-tb-btn" onClick={recent_six}>
                    最近 6 条
                </button>
            </header>
            {columns.length === 0 ? (
                <div className="history-no-columns">
                    未打开会话。从会话明细表打开，或点击「最近 6 条」。
                </div>
            ) : (
                <div className={grid}>
                    {columns.map((col) => (
                        <HistoryColumn
                            key={loc_key(col.loc)}
                            column={col}
                            selected_count={
                                [...selected].filter((k) => k.startsWith(`${loc_key(col.loc)}|`))
                                    .length
                            }
                            is_selected={(id) => selected.has(selection_key(col.loc, id))}
                            on_close={() => {
                                close_column(col.loc);
                            }}
                            on_toggle={(id) => {
                                toggle_select(col.loc, id);
                            }}
                            on_select_all={() => {
                                select_all_in_column(col.loc);
                            }}
                            on_clear_select={() => {
                                clear_selection_in_column(col.loc);
                            }}
                            on_load_older={() => {
                                load_older(col.loc);
                            }}
                        />
                    ))}
                </div>
            )}
            {show_modal && (
                <HistoryOverflowModal
                    columns={columns}
                    pending_count={pending.length}
                    on_confirm={modal_confirm}
                    on_cancel={() => {
                        set_pending([]);
                    }}
                />
            )}
        </div>
    );
}
