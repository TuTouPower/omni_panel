import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HistoryMessageLike } from "../../../shared/types/ipc";
import type { TokenStatsSession, TokenStatsSessionStats } from "../../../shared/types/token-stats";
import {
    filter_sessions,
    sort_sessions,
    type LibrarySortDirection,
    type LibrarySortField,
    type TimePreset,
} from "../../lib/session-library/filter";
import { AgentLogoRow } from "./AgentLogoRow";
import { RangeFilterCard, type RangeValue } from "./RangeFilterCard";
import { SelectionDock } from "./SelectionDock";
import { SessionList } from "./SessionList";
import { SessionPreview } from "./SessionPreview";
import { TimeRangeFilter } from "./TimeRangeFilter";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Input } from "../ui/Input";
import { Segmented } from "../ui/Segmented";
import { Toast } from "../ui/Toast";
import { format_tokens, key_of } from "./session-library-utils";
import { Icon } from "../Icon";

interface SessionLibraryProps {
    readonly on_switch_workspace: () => void;
    /** t439: 并排打开 = 替换语义——先清空工作台全部槽位再装入所选。
     *  回调由 SessionShell 接线到 WorkspaceView 注册的 clear_all。 */
    readonly on_clear_workspace: () => void;
    /** t434: 顶栏刷新递增 token，触发按当前筛选/排序重拉列表。 */
    readonly refresh_token?: number | undefined;
}

const PAGE_SIZE = 50;
const MAX_SELECT = 8;
/** 同屏最近并排打开的档位数。 */
const RECENT_CO_OPEN_OPTIONS = [2, 4, 6, 8] as const;
const PREVIEW_MESSAGES = 5;
/** t404: 内容搜索每批扫描候选数；首批结果可先展示，后续批次合并。 */
const CONTENT_SCAN_BATCH_SIZE = 64;

type SessionStatsStatus = "loading" | "ready" | "error";

export function SessionLibrary({
    on_switch_workspace,
    on_clear_workspace,
    refresh_token,
}: SessionLibraryProps) {
    const [all, set_all] = useState<TokenStatsSession[]>([]);
    const [search, set_search] = useState("");

    const [search_content, set_search_content] = useState(false);
    // 时间筛选：预设分段 + 自定义弹层；区间为点击时刻冻结的快照（time_range）。
    const [time_preset, set_time_preset] = useState<TimePreset>("all");
    const [time_range, set_time_range] = useState<{ start_at?: number; end_at?: number }>({});
    const [agents, set_agents] = useState<string[]>([]);
    // 排序（对齐 demo）：字段 + 独立方向；点同字段切换升降，默认 ended_at desc。
    const [sort_field, set_sort_field] = useState<LibrarySortField>("ended_at");
    const [sort_dir, set_sort_dir] = useState<LibrarySortDirection>("desc");
    // 数轴筛选：滑杆即时值（tokens_range/calls_range）→ 300ms 防抖后提交 applied_ranges。
    const [tokens_range, set_tokens_range] = useState<RangeValue>({});
    const [calls_range, set_calls_range] = useState<RangeValue>({});
    const [applied_ranges, set_applied_ranges] = useState<{
        min_tokens?: number;
        max_tokens?: number;
        min_calls?: number;
        max_calls?: number;
    }>({});
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

    const start_at = time_range.start_at;
    const end_at = time_range.end_at;

    const backend_filters = useMemo(() => {
        return {
            ...(agents.length > 0 ? { sources: [...agents] } : {}),
            ...(!search_content && search ? { search } : {}),
            ...(start_at !== undefined ? { start_at } : {}),
            ...(end_at !== undefined ? { end_at } : {}),
            ...(applied_ranges.min_tokens !== undefined
                ? { min_tokens: applied_ranges.min_tokens }
                : {}),
            ...(applied_ranges.max_tokens !== undefined
                ? { max_tokens: applied_ranges.max_tokens }
                : {}),
            ...(applied_ranges.min_calls !== undefined
                ? { min_calls: applied_ranges.min_calls }
                : {}),
            ...(applied_ranges.max_calls !== undefined
                ? { max_calls: applied_ranges.max_calls }
                : {}),
            order_by: sort_field,
            direction: sort_dir,
        } as const;
    }, [agents, search, search_content, start_at, end_at, applied_ranges, sort_field, sort_dir]);

    // 滑杆 300ms 防抖提交；值未变时返回 prev，避免新 {} 身份触发多余重拉。
    useEffect(() => {
        const timer = window.setTimeout(() => {
            set_applied_ranges((prev) => {
                const next = {
                    ...(tokens_range.min !== undefined ? { min_tokens: tokens_range.min } : {}),
                    ...(tokens_range.max !== undefined ? { max_tokens: tokens_range.max } : {}),
                    ...(calls_range.min !== undefined ? { min_calls: calls_range.min } : {}),
                    ...(calls_range.max !== undefined ? { max_calls: calls_range.max } : {}),
                };
                if (
                    prev.min_tokens === next.min_tokens &&
                    prev.max_tokens === next.max_tokens &&
                    prev.min_calls === next.min_calls &&
                    prev.max_calls === next.max_calls
                ) {
                    return prev;
                }
                return next;
            });
        }, 300);
        return () => {
            window.clearTimeout(timer);
        };
    }, [tokens_range, calls_range]);

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
        // t434: refresh_token 递增（顶栏刷新）触发重拉；backend_filters 变化亦重拉。
    }, [backend_filters, refresh_token]);

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
    // 内容搜索命中集不走后端分页查询，数轴区间在客户端补过滤（口径同 filter_sessions）。
    const content_filtered = useMemo(
        () =>
            search && search_content
                ? sort_sessions(
                      filter_sessions(content_sessions, applied_ranges),
                      sort_field,
                      sort_dir,
                  )
                : filtered,
        [content_sessions, filtered, applied_ranges, search, search_content, sort_field, sort_dir],
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

    /** 同屏最近：按当前筛选取最近 N 条，清空工作台后并排打开（替换语义，同 SelectionDock）。 */
    async function open_recent(count: number): Promise<void> {
        try {
            const recent =
                search && search_content
                    ? sort_sessions(content_filtered, "ended_at", "desc").slice(0, count)
                    : await window.usageboard.tokenStats.getSessions({
                          ...backend_filters,
                          order_by: "ended_at",
                          direction: "desc",
                          limit: count,
                          offset: 0,
                      });
            if (recent.length === 0) {
                show_toast("没有可同屏打开的会话");
                return;
            }
            on_clear_workspace();
            for (const s of recent) {
                void window.usageboard.sessionHistory.open(s.source, s.env, s.id);
            }
            on_switch_workspace();
        } catch {
            show_toast("会话列表加载失败");
        }
    }

    /** 重置全部筛选与排序回默认（数轴滑杆立即清零，applied 同步清）。 */
    function reset_filters(): void {
        set_search("");
        set_search_content(false);
        set_time_preset("all");
        set_time_range({});
        set_agents([]);
        set_sort_field("ended_at");
        set_sort_dir("desc");
        set_tokens_range({});
        set_calls_range({});
        set_applied_ranges({});
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
    const has_ranges =
        applied_ranges.min_tokens !== undefined ||
        applied_ranges.max_tokens !== undefined ||
        applied_ranges.min_calls !== undefined ||
        applied_ranges.max_calls !== undefined;
    const has_filters = Boolean(
        search || search_content || time_preset !== "all" || agents.length > 0 || has_ranges,
    );
    // 数轴上限来自全量统计；旧 mock/加载中缺省为 0 → 滑杆禁用。
    const max_tokens_limit = session_stats?.max_tokens ?? 0;
    const max_calls_limit = session_stats?.max_calls ?? 0;
    const show_clear = has_filters || all.length > 0;
    const empty_text = load_error ? "会话列表加载失败" : "没有匹配的会话";

    /** 排序字段标签：当前字段追加方向箭头（↓ 降序 / ↑ 升序）。 */
    function sort_label(field: LibrarySortField, text: string): string {
        if (sort_field !== field) return text;
        return `${text} ${sort_dir === "desc" ? "↓" : "↑"}`;
    }

    /** 点同字段切换升降；换新字段时数值类默认降序、标题默认升序。 */
    function on_sort_change(field: LibrarySortField): void {
        if (field === sort_field) {
            set_sort_dir((d) => (d === "desc" ? "asc" : "desc"));
            return;
        }
        set_sort_field(field);
        set_sort_dir(field === "title" ? "asc" : "desc");
    }

    // 生效条件计数（对齐 demo 底部「N 个条件生效」）：搜索/时间/Agent/Token 数轴/轮次数轴。
    const active_filter_count =
        (search ? 1 : 0) +
        (time_preset !== "all" ? 1 : 0) +
        (agents.length > 0 ? 1 : 0) +
        (applied_ranges.min_tokens !== undefined || applied_ranges.max_tokens !== undefined
            ? 1
            : 0) +
        (applied_ranges.min_calls !== undefined || applied_ranges.max_calls !== undefined ? 1 : 0);
    return (
        <div
            className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--color-surface-window)] text-[var(--color-on-surface)]"
            data-testid="library-view"
        >
            <div className="flex min-h-0 flex-1">
                <aside
                    className="flex w-[248px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-[var(--color-hairline)] px-3 py-3"
                    data-testid="library-sidebar"
                >
                    {/* 对齐 demo：顶部统计（当前 / 总量 条会话）+ 网格/列表切换。 */}
                    <div className="flex items-center justify-between gap-2">
                        <span
                            className="font-code-md text-[length:var(--text-label-md)] tabular-nums text-[var(--color-on-surface-muted)]"
                            data-testid="library-count"
                        >
                            {visible_sessions.length} / {session_stats?.sessions ?? 0} 条会话
                        </span>
                        <Segmented
                            size="sm"
                            value={view_mode}
                            aria-label="视图模式"
                            options={[
                                { value: "grid", label: "网格", "aria-label": "网格视图" },
                                { value: "list", label: "列表", "aria-label": "列表视图" },
                            ]}
                            onChange={set_view_mode}
                        />
                    </div>
                    {/* 排序：字段分段；点同字段切换升降（↓ 降序 / ↑ 升序）。 */}
                    <Segmented
                        size="sm"
                        aria-label="排序方式"
                        value={sort_field}
                        options={[
                            {
                                value: "ended_at",
                                label: sort_label("ended_at", "时间"),
                                "aria-label": "按时间排序",
                            },
                            {
                                value: "tokens",
                                label: sort_label("tokens", "Token"),
                                "aria-label": "按Token排序",
                            },
                            {
                                value: "calls",
                                label: sort_label("calls", "轮次"),
                                "aria-label": "按轮次排序",
                            },
                            {
                                value: "title",
                                label: sort_label("title", "标题"),
                                "aria-label": "按标题排序",
                            },
                        ]}
                        onChange={on_sort_change}
                    />
                    {/* 搜索：图标输入 + 清除 X；勾选后同时搜消息内容。 */}
                    <div className="flex flex-col gap-2">
                        <div className="relative">
                            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-on-surface-muted)]">
                                <Icon name="search" size={14} />
                            </span>
                            <Input
                                className="pl-8 pr-7"
                                placeholder="标题 / 消息内容 / 会话 ID"
                                value={search}
                                onChange={(e) => {
                                    set_search(e.target.value);
                                }}
                            />
                            {search && (
                                <button
                                    type="button"
                                    aria-label="清除搜索"
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-on-surface-muted)] hover:text-[var(--color-on-surface)]"
                                    onClick={() => {
                                        set_search("");
                                    }}
                                >
                                    <Icon name="close" size={12} />
                                </button>
                            )}
                        </div>
                        <label className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-[length:var(--text-body-sm)] text-[var(--color-on-surface-variant)]">
                            <Checkbox
                                checked={search_content}
                                aria-label="包含消息内容"
                                onChange={(e) => {
                                    set_search_content(e.target.checked);
                                }}
                            />
                            包含消息内容
                        </label>
                    </div>
                    <TimeRangeFilter
                        preset={time_preset}
                        applied_range={time_range}
                        on_change={(preset, range) => {
                            set_time_preset(preset);
                            set_time_range(range);
                        }}
                    />
                    <AgentLogoRow
                        agents={agents}
                        counts={agent_counts}
                        on_change={(next) => {
                            set_agents(next);
                        }}
                    />
                    <RangeFilterCard
                        label="Token 数"
                        testid="range-filter-tokens"
                        max_limit={max_tokens_limit}
                        value={tokens_range}
                        format_value={format_tokens}
                        on_change={set_tokens_range}
                    />
                    <RangeFilterCard
                        label="轮次"
                        testid="range-filter-calls"
                        max_limit={max_calls_limit}
                        value={calls_range}
                        on_change={set_calls_range}
                    />
                    {/* 同屏最近：图标 + 文案 + 档位同排一行（对齐 demo）。 */}
                    <div className="flex items-center gap-2">
                        <span className="text-[var(--color-on-surface-muted)]">
                            <Icon name="columns2" size={14} strokeWidth={1.8} />
                        </span>
                        <span className="text-[length:var(--text-body-sm)] text-[var(--color-on-surface-variant)]">
                            同屏最近
                        </span>
                        <div className="ml-auto flex gap-1">
                            {RECENT_CO_OPEN_OPTIONS.map((n) => (
                                <Button
                                    key={n}
                                    variant="secondary"
                                    size="sm"
                                    data-testid={`open-recent-${String(n)}`}
                                    onClick={() => {
                                        void open_recent(n);
                                    }}
                                >
                                    {n}
                                </Button>
                            ))}
                        </div>
                    </div>
                    {/* 底部：生效条件数 + 重置（无条件时禁用）。 */}
                    <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--color-hairline)] pt-3">
                        <span
                            className="text-[length:var(--text-label-md)] text-[var(--color-on-surface-muted)]"
                            data-testid="library-active-filters"
                        >
                            {active_filter_count > 0
                                ? `${String(active_filter_count)} 个条件生效`
                                : "无筛选条件"}
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={active_filter_count === 0}
                            onClick={reset_filters}
                        >
                            重置
                        </Button>
                    </div>
                </aside>
                <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                    {content_searching && (
                        <div
                            className="px-[18px] py-2 text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)]"
                            data-testid="content-search-progress"
                        >
                            {content_search_progress
                                ? `搜索消息内容中…（已扫描 ${String(content_search_progress.scanned)}/${String(content_search_progress.total)} 个会话）`
                                : "搜索消息内容中…"}
                        </div>
                    )}
                    {content_search_error && (
                        <Alert tone="error" className="mx-[18px] mb-2.5">
                            消息内容搜索失败
                        </Alert>
                    )}

                    {load_error && visible_sessions.length > 0 && (
                        <Alert tone="error" className="mx-[18px] mb-2.5">
                            会话列表加载中断，已显示部分数据
                        </Alert>
                    )}

                    {content_truncated && (
                        <Alert
                            tone="warning"
                            className="mx-[18px] mb-2.5"
                            data-testid="search-truncated-hint"
                        >
                            结果已截断，仅显示部分匹配项
                        </Alert>
                    )}

                    {visible_sessions.length === 0 ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[length:var(--text-body-md)] text-[var(--color-on-surface-muted)]">
                            <p>{empty_text}</p>
                            {show_clear && (
                                <Button variant="secondary" onClick={reset_filters}>
                                    清空全部条件
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
                </div>
            </div>

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
                    // t439: 替换语义——先同步清空工作台（clear_all 退订+清槽），
                    // 再逐个 open；顺序与 WorkspaceView.confirm_recent 一致。
                    on_clear_workspace();
                    for (const s of sessions) {
                        void window.usageboard.sessionHistory.open(s.source, s.env, s.id);
                    }
                    on_switch_workspace();
                }}
            />
            {toast !== null && <Toast>{toast}</Toast>}
        </div>
    );
}
