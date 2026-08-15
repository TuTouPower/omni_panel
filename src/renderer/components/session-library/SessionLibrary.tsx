import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HistoryMessageLike } from "../../../shared/types/ipc";
import type { TokenStatsSession, TokenStatsSessionStats } from "../../../shared/types/token-stats";
import { count_stats, sort_sessions, type LibrarySort } from "../../lib/session-library/filter";
import { cn } from "../../lib/utils";
import { AgentFilterChips } from "./AgentFilterChips";
import { SelectionDock } from "./SelectionDock";
import { SessionList } from "./SessionList";
import { SessionPreview } from "./SessionPreview";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { format_tokens, key_of } from "./session-library-utils";

interface SessionLibraryProps {
    readonly on_switch_workspace: () => void;
}

const PAGE_SIZE = 50;
const MAX_SELECT = 8;
const PREVIEW_MESSAGES = 5;
/** t404: 内容搜索每批扫描候选数；首批结果可先展示，后续批次合并。 */
const CONTENT_SCAN_BATCH_SIZE = 64;

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
    const [content_truncated, set_content_truncated] = useState(false);
    const [content_search_progress, set_content_search_progress] = useState<{
        scanned: number;
        total: number;
    } | null>(null);
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
        if (load_more_inflight_ref.current) return;
        if (content_mode) {
            if (content_sessions.length <= visible) return;
            load_more_inflight_ref.current = true;
            set_visible((current) => current + PAGE_SIZE);
            // 展示分页同步完成，无需异步请求；下个 tick 释放锁避免滚动突发叠加。
            queueMicrotask(() => {
                load_more_inflight_ref.current = false;
            });
            return;
        }
        if (!has_more) return;
        load_more_inflight_ref.current = true;
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
            set_content_sessions([]);
            set_content_searching(false);
            set_content_search_error(false);
            set_content_truncated(false);
            set_content_search_progress(null);
            return;
        }
        set_content_sessions([]);
        set_content_search_error(false);
        set_content_truncated(false);
        set_content_search_progress(null);
        set_content_searching(true);
        content_debounce_ref.current = window.setTimeout(() => {
            content_debounce_ref.current = null;
            content_abort_ref.current?.abort();
            const controller = new AbortController();
            content_abort_ref.current = controller;
            // t404: 分块多次 searchContent，合并 sessions 并展示已扫描 N/M。
            // ref 装箱：跨 await 的取消标志；裸 boolean 会被 no-unnecessary-condition 误判恒真。
            const live_ref = { current: !controller.signal.aborted };
            const on_abort = (): void => {
                live_ref.current = false;
            };
            controller.signal.addEventListener("abort", on_abort, { once: true });
            void (async () => {
                let offset = 0;
                const merged = new Map<string, TokenStatsSession>();
                let truncated = false;
                try {
                    for (;;) {
                        if (!live_ref.current) {
                            return;
                        }
                        const result = await window.usageboard.sessionHistory.searchContent(
                            {
                                filters: {
                                    ...(agents.length > 0 ? { sources: [...agents] } : {}),
                                    ...(search ? { search } : {}),
                                    ...(start_at !== undefined ? { start_at } : {}),
                                    ...(end_at !== undefined ? { end_at } : {}),
                                },
                                keyword: search,
                                offset,
                                limit: CONTENT_SCAN_BATCH_SIZE,
                            },
                            // t263: 取消信号传入搜索调用，web shim 透传 fetch、服务端随断连中止。
                            controller.signal,
                        );
                        // await 后必须再读 ref：取消可发生在请求途中；CF 分析看不到跨 await 的
                        // 外部突变，故 no-unnecessary-condition 误报，抑制单行。
                        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- abort during await
                        if (!live_ref.current) {
                            return;
                        }
                        // 兼容测试/旧契约可能返回 string[] hits。
                        const raw: unknown = result;
                        const response = Array.isArray(raw)
                            ? {
                                  hits: raw as readonly string[],
                                  sessions: [] as readonly TokenStatsSession[],
                                  truncated: false,
                                  progress: undefined as
                                      | {
                                            scanned: number;
                                            total: number;
                                            done: boolean;
                                            next_offset: number;
                                        }
                                      | undefined,
                              }
                            : (raw as {
                                  hits: readonly string[];
                                  sessions: readonly TokenStatsSession[];
                                  truncated: boolean;
                                  progress?: {
                                      scanned: number;
                                      total: number;
                                      done: boolean;
                                      next_offset: number;
                                  };
                              });
                        truncated = truncated || response.truncated;
                        for (const session of response.sessions) {
                            merged.set(key_of(session), session);
                        }
                        // AC-002/004: 每批到达即展示累计命中，不等全量结束。
                        set_content_sessions([...merged.values()]);
                        const progress = response.progress;
                        if (progress) {
                            set_content_search_progress({
                                scanned: progress.scanned,
                                total: progress.total,
                            });
                        }
                        // 无 progress（旧 mock/契约）或 done → 结束循环。
                        if (!progress || progress.done) break;
                        offset = progress.next_offset;
                    }
                    // 末批后、写终态前再确认未取消，避免覆盖新一轮搜索的 searching/结果。
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- abort after last batch
                    if (!live_ref.current) return;
                    // t388 AC-003: 枚举超限截断时展示降级提示。
                    set_content_truncated(truncated);
                    set_content_search_error(false);
                    set_content_searching(false);
                    set_content_search_progress(null);
                } catch (err: unknown) {
                    if (!live_ref.current) return;
                    if (err instanceof Error && err.name === "AbortError") return;
                    set_content_sessions([]);
                    set_content_truncated(false);
                    set_content_search_error(true);
                    set_content_searching(false);
                    set_content_search_progress(null);
                } finally {
                    controller.signal.removeEventListener("abort", on_abort);
                }
            })();
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
        <div className="library-view flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--color-surface-window)] text-[var(--color-on-surface)]">
            <header className="library-header flex shrink-0 items-baseline gap-3 px-[18px] pb-2 pt-3.5">
                <span className="library-title text-[length:var(--text-title-lg)] font-bold tracking-tight">
                    会话库
                </span>
                <span className="library-stats font-code-md text-[length:var(--text-label-md)] tabular-nums text-[var(--color-on-surface-muted)]">
                    {stats_text}
                </span>
            </header>

            <div className="library-toolbar flex shrink-0 flex-wrap items-center gap-2.5 border-b border-[var(--color-hairline)] px-[18px] py-2">
                <Input
                    className="library-search min-w-[200px] flex-1"
                    placeholder="搜索标题 / 路径 / 会话 ID"
                    value={search}
                    onChange={(e) => {
                        set_search(e.target.value);
                    }}
                />
                <label className="library-content-search inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[length:var(--text-body-sm)] text-[var(--color-on-surface-variant)]">
                    <Checkbox
                        checked={search_content}
                        aria-label="包含消息内容"
                        onChange={(e) => {
                            set_search_content(e.target.checked);
                        }}
                    />
                    包含消息内容
                </label>
                <div className="library-date-range flex items-center gap-1.5">
                    <Input
                        type="date"
                        className="w-auto min-w-[130px]"
                        aria-label="起始日期"
                        value={start_date}
                        onChange={(e) => {
                            set_start_date(e.target.value);
                        }}
                    />
                    <span className="text-[var(--color-on-surface-muted)]">—</span>
                    <Input
                        type="date"
                        className="w-auto min-w-[130px]"
                        aria-label="结束日期"
                        value={end_date}
                        onChange={(e) => {
                            set_end_date(e.target.value);
                        }}
                    />
                </div>
                <Select
                    className="library-sort w-auto min-w-[120px]"
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
                </Select>
                <div className="library-view-switch inline-flex items-center gap-0.5 rounded-md bg-[var(--color-surface-raised)] p-0.5">
                    <button
                        type="button"
                        className={cn(
                            "rounded px-2.5 py-1 text-[length:var(--text-label-md)] text-[var(--color-on-surface-variant)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]",
                            view_mode === "grid" &&
                                "bg-[var(--color-surface-window)] text-[var(--color-on-surface)] shadow-card",
                        )}
                        aria-label="网格视图"
                        aria-pressed={view_mode === "grid"}
                        onClick={() => {
                            set_view_mode("grid");
                        }}
                    >
                        网格
                    </button>
                    <button
                        type="button"
                        className={cn(
                            "rounded px-2.5 py-1 text-[length:var(--text-label-md)] text-[var(--color-on-surface-variant)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]",
                            view_mode === "list" &&
                                "bg-[var(--color-surface-window)] text-[var(--color-on-surface)] shadow-card",
                        )}
                        aria-label="列表视图"
                        aria-pressed={view_mode === "list"}
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

            {content_searching && (
                <div
                    className="library-content-searching px-[18px] py-2 text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)]"
                    data-testid="content-search-progress"
                >
                    {content_search_progress
                        ? `搜索消息内容中…（已扫描 ${String(content_search_progress.scanned)}/${String(content_search_progress.total)} 个会话）`
                        : "搜索消息内容中…"}
                </div>
            )}
            {content_search_error && (
                <div className="library-load-interrupted mx-[18px] mb-2.5 rounded-md bg-[color-mix(in_srgb,var(--color-error)_12%,transparent)] px-3 py-2 text-[length:var(--text-body-sm)] text-[var(--color-error)]">
                    消息内容搜索失败
                </div>
            )}

            {load_error && visible_sessions.length > 0 && (
                <div className="library-load-interrupted mx-[18px] mb-2.5 rounded-md bg-[color-mix(in_srgb,var(--color-error)_12%,transparent)] px-3 py-2 text-[length:var(--text-body-sm)] text-[var(--color-error)]">
                    会话列表加载中断，已显示部分数据
                </div>
            )}

            {content_truncated && (
                <div
                    className="library-search-truncated mx-[18px] mb-2.5 rounded-md bg-[color-mix(in_srgb,var(--color-warning)_12%,transparent)] px-3 py-2 text-[length:var(--text-body-sm)] text-[var(--color-warning)]"
                    data-testid="search-truncated-hint"
                >
                    结果已截断，仅显示部分匹配项
                </div>
            )}

            {visible_sessions.length === 0 ? (
                <div className="library-empty flex flex-1 flex-col items-center justify-center gap-3 text-[length:var(--text-body-md)] text-[var(--color-on-surface-muted)]">
                    <p>{empty_text}</p>
                    {show_clear && (
                        <Button
                            variant="secondary"
                            onClick={() => {
                                set_search("");
                                set_search_content(false);
                                set_start_date("");
                                set_end_date("");
                                set_agents([]);
                            }}
                        >
                            清除筛选
                        </Button>
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
                    on_show_toast={show_toast}
                    on_scroll_to_bottom={load_more}
                />
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
            {toast !== null && (
                <div className="library-toast fixed bottom-7 left-1/2 z-[var(--z-context)] -translate-x-1/2 rounded-lg border border-[var(--color-outline)] bg-[color-mix(in_srgb,var(--color-surface-window)_92%,transparent)] px-[18px] py-2 text-[length:var(--text-body-md)] font-medium text-[var(--color-on-surface)] shadow-menu">
                    {toast}
                </div>
            )}
        </div>
    );
}
