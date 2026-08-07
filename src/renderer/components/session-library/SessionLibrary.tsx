import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HistoryMessageLike } from "../../../shared/types/ipc";
import type { TokenStatsSession, TokenStatsSessionStats } from "../../../shared/types/token-stats";
import { count_stats, sort_sessions, type LibrarySort } from "../../lib/session-library/filter";
import { AgentFilterChips } from "./AgentFilterChips";
import { SelectionDock } from "./SelectionDock";
import { SessionList } from "./SessionList";
import { SessionPreview } from "./SessionPreview";
import { format_tokens, key_of } from "./session-library-utils";
import "../../styles/session-library.css";

interface SessionLibraryProps {
    readonly on_switch_workspace: () => void;
}

const PAGE_SIZE = 50;
const MAX_SELECT = 8;
const PREVIEW_MESSAGES = 5;

type SessionStatsStatus = "loading" | "ready" | "error";

export function SessionLibrary({ on_switch_workspace }: SessionLibraryProps) {
    const [all, set_all] = useState<TokenStatsSession[]>([]);
    const [search, set_search] = useState("");
    const [search_content, set_search_content] = useState(false);
    const [start_date, set_start_date] = useState("");
    const [end_date, set_end_date] = useState("");
    const [agents, set_agents] = useState<string[]>([]);
    const [sort, set_sort] = useState<LibrarySort>("recent");
    const [view_mode, set_view_mode] = useState<"grid" | "list">("grid");
    const [visible, set_visible] = useState(PAGE_SIZE);
    const [has_more, set_has_more] = useState(false);
    const [selected, set_selected] = useState<TokenStatsSession[]>([]);
    const [preview, set_preview] = useState<TokenStatsSession | null>(null);
    const [preview_msgs, set_preview_msgs] = useState<HistoryMessageLike[]>([]);
    const [content_searching, set_content_searching] = useState(false);
    const [content_search_error, set_content_search_error] = useState(false);
    const [content_sessions, set_content_sessions] = useState<TokenStatsSession[]>([]);
    const [toast, set_toast] = useState<string | null>(null);
    const [summaries, set_summaries] = useState<Record<string, string>>({});
    const [load_error, set_load_error] = useState(false);
    const [session_stats, set_session_stats] = useState<TokenStatsSessionStats | null>(null);
    const [session_stats_status, set_session_stats_status] =
        useState<SessionStatsStatus>("loading");
    const summary_inflight = useRef(new Set<string>());
    const pending_summaries_ref = useRef<Record<string, string>>({});
    const flush_scheduled_ref = useRef(false);
    const request_seq_ref = useRef(0);
    const load_more_inflight_ref = useRef(false);
    const [loading_more, set_loading_more] = useState(false);
    const flush_summaries = useCallback((): void => {
        flush_scheduled_ref.current = false;
        const pending = pending_summaries_ref.current;
        pending_summaries_ref.current = {};
        if (Object.keys(pending).length === 0) return;
        set_summaries((cur) => ({ ...cur, ...pending }));
    }, []);
    const schedule_summaries_merge = useCallback((): void => {
        if (flush_scheduled_ref.current) return;
        flush_scheduled_ref.current = true;
        window.setTimeout(flush_summaries, 0);
    }, [flush_summaries]);

    const start_at = useMemo(() => {
        if (!start_date) return undefined;
        return new Date(`${start_date}T00:00:00`).getTime();
    }, [start_date]);
    const end_at = useMemo(() => {
        if (!end_date) return undefined;
        return new Date(`${end_date}T23:59:59`).getTime();
    }, [end_date]);

    const backend_filters = useMemo(() => {
        const order_by =
            sort === "tokens"
                ? "tokens"
                : sort === "calls"
                  ? "calls"
                  : sort === "earliest"
                    ? "started_at"
                    : "ended_at";
        const direction = sort === "earliest" ? "asc" : "desc";
        return {
            ...(agents.length > 0 ? { sources: [...agents] } : {}),
            ...(!search_content && search ? { search } : {}),
            ...(start_at !== undefined ? { start_at } : {}),
            ...(end_at !== undefined ? { end_at } : {}),
            order_by,
            direction,
        } as const;
    }, [agents, search, search_content, start_at, end_at, sort]);

    const agent_counts = useMemo(() => {
        if (session_stats_status !== "ready") return [];
        const source_counts = session_stats?.source_counts;
        if (source_counts) {
            return Object.entries(source_counts).sort((a, b) => b[1] - a[1]);
        }
        // Legacy renderer mocks may omit source_counts; only use the current page
        // as a compatibility fallback after the aggregate request is ready.
        const counts = new Map<string, number>();
        for (const s of all) counts.set(s.source, (counts.get(s.source) ?? 0) + 1);
        return [...counts.entries()].sort((a, b) => b[1] - a[1]);
    }, [all, session_stats?.source_counts, session_stats_status]);

    const stats = useMemo(() => {
        if (session_stats_status !== "ready") return null;
        return session_stats ?? count_stats(all);
    }, [all, session_stats, session_stats_status]);

    useEffect(() => {
        void window.usageboard.tokenStats
            .getSessionStats()
            .then((result) => {
                set_session_stats(result);
                set_session_stats_status("ready");
            })
            .catch(() => {
                set_session_stats(null);
                set_session_stats_status("error");
            });
    }, []);

    useEffect(() => {
        let disposed = false;
        const seq = ++request_seq_ref.current;
        load_more_inflight_ref.current = false;
        set_loading_more(false);
        set_visible(PAGE_SIZE);
        set_has_more(false);
        set_all([]);
        set_load_error(false);

        const load_first_page = async (): Promise<void> => {
            try {
                const page = await window.usageboard.tokenStats.getSessions({
                    ...backend_filters,
                    limit: PAGE_SIZE,
                    offset: 0,
                });
                if (disposed || request_seq_ref.current !== seq) return;
                set_load_error(false);
                set_all(page);
                set_has_more(page.length === PAGE_SIZE);
            } catch {
                if (disposed || request_seq_ref.current !== seq) return;
                set_load_error(true);
            }
        };
        void load_first_page();
        return () => {
            disposed = true;
        };
    }, [backend_filters]);

    const load_more = useCallback((): void => {
        const content_mode = Boolean(search && search_content);
        if (content_mode) {
            if (content_sessions.length <= visible || load_more_inflight_ref.current) return;
            set_visible((current) => current + PAGE_SIZE);
            return;
        }
        if (!has_more || load_more_inflight_ref.current) return;
        load_more_inflight_ref.current = true;
        set_loading_more(true);
        const seq = request_seq_ref.current;
        const offset = all.length;
        void window.usageboard.tokenStats
            .getSessions({ ...backend_filters, limit: PAGE_SIZE, offset })
            .then((page) => {
                if (request_seq_ref.current !== seq) return;
                set_all((current) => [...current, ...page]);
                set_visible((current) => current + page.length);
                set_has_more(page.length === PAGE_SIZE);
            })
            .catch(() => {
                if (request_seq_ref.current === seq) set_load_error(true);
            })
            .finally(() => {
                if (request_seq_ref.current !== seq) return;
                load_more_inflight_ref.current = false;
                set_loading_more(false);
            });
    }, [
        all.length,
        backend_filters,
        content_sessions.length,
        has_more,
        search,
        search_content,
        visible,
    ]);

    const show_toast = useCallback((message: string): void => {
        set_toast(message);
        window.setTimeout(() => {
            set_toast(null);
        }, 2500);
    }, []);

    const [, set_content_hits] = useState<Set<string>>(new Set());
    const filtered = all;
    const content_filtered = useMemo(
        () => (search && search_content ? sort_sessions(content_sessions, sort) : filtered),
        [content_sessions, filtered, search, search_content, sort],
    );

    // 内容搜索 effect：防抖 300ms + AbortController 作废旧查询（t239/t248）。
    const content_debounce_ref = useRef<number | null>(null);
    const content_abort_ref = useRef<AbortController | null>(null);

    useEffect(() => {
        if (content_debounce_ref.current !== null) {
            window.clearTimeout(content_debounce_ref.current);
            content_debounce_ref.current = null;
        }
        if (!search || !search_content) {
            set_content_hits(new Set());
            set_content_sessions([]);
            set_content_searching(false);
            set_content_search_error(false);
            return;
        }
        set_content_hits(new Set());
        set_content_sessions([]);
        set_content_search_error(false);
        set_content_searching(true);
        content_debounce_ref.current = window.setTimeout(() => {
            content_debounce_ref.current = null;
            content_abort_ref.current?.abort();
            const controller = new AbortController();
            content_abort_ref.current = controller;
            window.usageboard.sessionHistory
                .searchContent({
                    filters: {
                        ...(agents.length > 0 ? { sources: [...agents] } : {}),
                        ...(search ? { search } : {}),
                        ...(start_at !== undefined ? { start_at } : {}),
                        ...(end_at !== undefined ? { end_at } : {}),
                    },
                    keyword: search,
                })
                .then((result) => {
                    if (controller.signal.aborted) return;
                    const response = Array.isArray(result)
                        ? {
                              hits: result as readonly string[],
                              sessions: [],
                          }
                        : result;
                    set_content_hits(new Set(response.hits));
                    set_content_sessions([...response.sessions]);
                    set_content_search_error(false);
                    set_content_searching(false);
                })
                .catch((err: unknown) => {
                    if (controller.signal.aborted) return;
                    if (err instanceof Error && err.name === "AbortError") return;
                    set_content_sessions([]);
                    set_content_search_error(true);
                    set_content_searching(false);
                });
        }, 300);

        return () => {
            if (content_debounce_ref.current !== null) {
                window.clearTimeout(content_debounce_ref.current);
                content_debounce_ref.current = null;
            }
            content_abort_ref.current?.abort();
        };
    }, [search, search_content, agents, start_at, end_at]);

    const visible_sessions = content_filtered.slice(0, visible);
    const can_load_more = search && search_content ? content_filtered.length > visible : has_more;

    // 批量加载可见会话的首条用户消息摘要（t239）。
    useEffect(() => {
        const needed: TokenStatsSession[] = [];
        for (const s of visible_sessions) {
            const k = key_of(s);
            if (summaries[k] === undefined && !summary_inflight.current.has(k)) {
                needed.push(s);
                summary_inflight.current.add(k);
            }
        }
        if (needed.length === 0) return;

        const locs = needed.map((s) => ({ source: s.source, env: s.env, session_id: s.id }));
        const keys = needed.map((s) => key_of(s));
        void window.usageboard.sessionHistory
            .summaries(locs)
            .then((result) => {
                for (const s of needed) {
                    const k = key_of(s);
                    pending_summaries_ref.current[k] = result[k] ?? "";
                }
                schedule_summaries_merge();
            })
            .catch(() => {
                for (const s of needed) {
                    pending_summaries_ref.current[key_of(s)] = "";
                }
                schedule_summaries_merge();
            })
            .finally(() => {
                for (const k of keys) {
                    summary_inflight.current.delete(k);
                }
            });
    }, [visible_sessions, summaries, schedule_summaries_merge]);

    function toggle_select(s: TokenStatsSession): void {
        if (selected.some((x) => key_of(x) === key_of(s))) {
            set_selected((prev) => prev.filter((x) => key_of(x) !== key_of(s)));
            return;
        }
        if (selected.length >= MAX_SELECT) {
            show_toast(`最多选择 ${String(MAX_SELECT)} 个会话`);
            return;
        }
        set_selected((prev) => [...prev, s]);
    }

    const preview_seq_ref = useRef(0);

    function open_preview(s: TokenStatsSession): void {
        const seq = ++preview_seq_ref.current;
        set_preview(s);
        set_preview_msgs([]);
        void window.usageboard.sessionHistory
            .query(s.source, s.env, s.id, { limit: PREVIEW_MESSAGES })
            .then((res) => {
                if (preview_seq_ref.current !== seq) return; // 已切换预览目标，丢弃旧消息。
                set_preview_msgs(res.messages.slice(0, PREVIEW_MESSAGES));
            })
            .catch(() => {
                if (preview_seq_ref.current !== seq) return;
                set_preview_msgs([]);
            });
    }

    function open_session(s: TokenStatsSession): void {
        void window.usageboard.sessionHistory.open(s.source, s.env, s.id);
        on_switch_workspace();
    }

    useEffect(() => {
        function on_key(e: KeyboardEvent): void {
            if (e.key === "Escape") set_preview(null);
        }
        window.addEventListener("keydown", on_key);
        return () => {
            window.removeEventListener("keydown", on_key);
        };
    }, []);

    const selected_ids = useMemo(() => new Set(selected.map((s) => key_of(s))), [selected]);
    const has_filters = search || search_content || start_date || end_date || agents.length > 0;
    const show_clear = has_filters || all.length > 0;
    const empty_text = load_error ? "会话列表加载失败" : "没有匹配的会话";
    const stats_text =
        session_stats_status === "ready" && stats !== null
            ? `${String(stats.sessions)} 个会话 · ${String(stats.agents)} 个 Agent · ${format_tokens(stats.tokens)} tokens`
            : session_stats_status === "loading"
              ? "统计加载中…"
              : "统计不可用";
    return (
        <div className="session-library">
            <header className="lib-head">
                <span className="lib-title">会话库</span>
                <span className="lib-stats">{stats_text}</span>
            </header>

            <div className="lib-toolbar">
                <input
                    className="lib-search"
                    placeholder="搜索标题 / 路径 / 会话 ID"
                    value={search}
                    onChange={(e) => {
                        set_search(e.target.value);
                    }}
                />
                <label className="lib-content-search">
                    <input
                        type="checkbox"
                        checked={search_content}
                        onChange={(e) => {
                            set_search_content(e.target.checked);
                        }}
                    />
                    包含消息内容
                </label>
                <div className="lib-date-range">
                    <input
                        type="date"
                        aria-label="起始日期"
                        value={start_date}
                        onChange={(e) => {
                            set_start_date(e.target.value);
                        }}
                    />
                    <span>—</span>
                    <input
                        type="date"
                        aria-label="结束日期"
                        value={end_date}
                        onChange={(e) => {
                            set_end_date(e.target.value);
                        }}
                    />
                </div>
                <select
                    className="lib-sort"
                    aria-label="排序方式"
                    value={sort}
                    onChange={(e) => {
                        set_sort(e.target.value as LibrarySort);
                    }}
                >
                    <option value="recent">最近活跃</option>
                    <option value="tokens">Token 最多</option>
                    <option value="calls">轮次最多</option>
                    <option value="earliest">最早创建</option>
                </select>
                <div className="lib-view-switch">
                    <button
                        type="button"
                        className={view_mode === "grid" ? "on" : ""}
                        aria-label="网格视图"
                        onClick={() => {
                            set_view_mode("grid");
                        }}
                    >
                        网格
                    </button>
                    <button
                        type="button"
                        className={view_mode === "list" ? "on" : ""}
                        aria-label="列表视图"
                        onClick={() => {
                            set_view_mode("list");
                        }}
                    >
                        列表
                    </button>
                </div>
            </div>

            <AgentFilterChips
                agents={agents}
                counts={agent_counts}
                on_change={(next) => {
                    set_agents(next);
                }}
            />

            {content_searching && <div className="lib-content-searching">搜索消息内容中…</div>}
            {content_search_error && <div className="lib-load-interrupted">消息内容搜索失败</div>}

            {load_error && visible_sessions.length > 0 && (
                <div className="lib-load-interrupted">会话列表加载中断，已显示部分数据</div>
            )}

            {visible_sessions.length === 0 ? (
                <div className="lib-empty">
                    <p>{empty_text}</p>
                    {show_clear && (
                        <button
                            type="button"
                            onClick={() => {
                                set_search("");
                                set_search_content(false);
                                set_start_date("");
                                set_end_date("");
                                set_agents([]);
                            }}
                        >
                            清除筛选
                        </button>
                    )}
                </div>
            ) : (
                <SessionList
                    view_mode={view_mode}
                    sessions={visible_sessions}
                    summaries={summaries}
                    selected_ids={selected_ids}
                    on_toggle={toggle_select}
                    on_preview={open_preview}
                    on_open={open_session}
                />
            )}

            {can_load_more && (
                <button
                    type="button"
                    className="lib-load-more"
                    disabled={loading_more}
                    onClick={load_more}
                >
                    加载更多
                </button>
            )}

            {preview && (
                <SessionPreview
                    preview={preview}
                    preview_msgs={preview_msgs}
                    on_close={() => {
                        set_preview(null);
                    }}
                    on_open={open_session}
                    on_toggle_select={toggle_select}
                />
            )}

            <SelectionDock
                selected={selected}
                max_select={MAX_SELECT}
                on_remove={toggle_select}
                on_clear={() => {
                    set_selected([]);
                }}
                on_open_all={(sessions) => {
                    for (const s of sessions) {
                        void window.usageboard.sessionHistory.open(s.source, s.env, s.id);
                    }
                    on_switch_workspace();
                }}
            />
            {toast !== null && <div className="lib-toast">{toast}</div>}
        </div>
    );
}
