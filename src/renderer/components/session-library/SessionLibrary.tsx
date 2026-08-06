import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HistoryMessageLike } from "../../../shared/types/ipc";
import type { TokenStatsSession } from "../../../shared/types/token-stats";
import { agent_friendly, agent_slug, format_date } from "../../lib/session-history/markdown";
import {
    count_stats,
    filter_sessions,
    match_content,
    session_tokens,
    sort_sessions,
    type LibrarySort,
} from "../../lib/session-library/filter";
import { MarkdownMessage } from "../workspace/MarkdownMessage";
import "../../styles/session-library.css";

interface SessionLibraryProps {
    readonly on_switch_workspace: () => void;
}

const PAGE_SIZE = 50;
const MAX_SELECT = 8;
const PREVIEW_MESSAGES = 5;

function relative_date(ts: number): string {
    const now = Date.now();
    const day_ms = 24 * 3600 * 1000;
    const days = Math.floor((now - ts) / day_ms);
    if (days < 1) return "今天";
    if (days < 7) return `${String(days)} 天前`;
    return format_date(ts);
}

function agent_abbrev(source: string): string {
    if (source === "claude_code") return "C";
    if (source === "opencode") return "OC";
    if (source === "kimi_code") return "K";
    if (source === "grok") return "G";
    return source.slice(0, 2).toUpperCase();
}

/** 会话主键（f008：跨 source/env 同 id 须区分）。 */
function key_of(s: TokenStatsSession): string {
    return `${s.source}|${s.env}|${s.id}`;
}

/** t227 会话库：搜索/筛选/排序/卡片列表/预览抽屉/SelectionDock。 */
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
    const [selected, set_selected] = useState<TokenStatsSession[]>([]);
    const [preview, set_preview] = useState<TokenStatsSession | null>(null);
    const [preview_msgs, set_preview_msgs] = useState<HistoryMessageLike[]>([]);
    const [content_searching, set_content_searching] = useState(false);
    const [toast, set_toast] = useState<string | null>(null);
    const [summaries, set_summaries] = useState<Record<string, string>>({});
    const [load_error, set_load_error] = useState(false);

    // 卡片/行首条用户消息摘要（f002）：懒加载，按 key 缓存；ref 防重复请求（f010，异步查询移出 updater）。
    const summary_inflight = useRef(new Set<string>());
    const ensure_summary = useCallback((s: TokenStatsSession): void => {
        const k = key_of(s);
        if (summary_inflight.current.has(k)) return;
        summary_inflight.current.add(k);
        void window.usageboard.sessionHistory
            .query(s.source, s.env, s.id, { limit: 5 })
            .then((res) => {
                const first_user = res.messages.find((m) => m.role === "user");
                set_summaries((cur) => ({
                    ...cur,
                    [k]: first_user ? first_user.text.slice(0, 80) : "",
                }));
            })
            .catch(() => {
                set_summaries((cur) => ({ ...cur, [k]: "" }));
            });
    }, []);

    useEffect(() => {
        void (async () => {
            const list: TokenStatsSession[] = [];
            const PAGE = 500;
            for (let offset = 0; ; offset += PAGE) {
                try {
                    const page = await window.usageboard.tokenStats.getSessions({
                        limit: PAGE,
                        offset,
                    });
                    list.push(...page);
                    if (page.length < PAGE) break;
                } catch {
                    set_load_error(true); // f012：加载中断不再静默（空态/统计按实际数据展示）。
                    break;
                }
            }
            set_all(list);
        })();
    }, []);

    const show_toast = useCallback((message: string): void => {
        set_toast(message);
        window.setTimeout(() => {
            set_toast(null);
        }, 2500);
    }, []);

    const start_at = useMemo(() => {
        if (!start_date) return undefined;
        return new Date(`${start_date}T00:00:00`).getTime();
    }, [start_date]);
    const end_at = useMemo(() => {
        if (!end_date) return undefined;
        return new Date(`${end_date}T23:59:59`).getTime();
    }, [end_date]);

    const agent_counts = useMemo(() => {
        const counts = new Map<string, number>();
        for (const s of all) counts.set(s.source, (counts.get(s.source) ?? 0) + 1);
        return [...counts.entries()].sort((a, b) => b[1] - a[1]);
    }, [all]);

    const stats = useMemo(() => count_stats(all), [all]);

    const library_filters = useMemo(() => {
        const f: {
            agents?: string[];
            search?: string;
            start_at?: number;
            end_at?: number;
        } = {};
        if (agents.length > 0) f.agents = agents;
        if (search) f.search = search;
        if (start_at !== undefined) f.start_at = start_at;
        if (end_at !== undefined) f.end_at = end_at;
        return f;
    }, [agents, search, start_at, end_at]);

    const filtered = useMemo(() => {
        const base = filter_sessions(all, library_filters);
        return sort_sessions(base, sort);
    }, [all, library_filters, sort]);

    const [content_hits, set_content_hits] = useState<Set<string>>(new Set());

    // 「包含消息内容」搜索：结果 = 元信息命中 ∪ 正文命中（f001 并集语义）。
    const content_filtered = useMemo(() => {
        if (!search || !search_content) return filtered;
        const hits = content_hits;
        const extra = all.filter(
            (s) => hits.has(key_of(s)) && !filtered.some((f) => key_of(f) === key_of(s)),
        );
        return sort_sessions([...filtered, ...extra], sort);
    }, [filtered, all, search, search_content, sort, content_hits]);

    // 内容搜索 effect：序号守卫防旧查询迟到覆盖（f004）；清空/取消搜索时复位状态（f011）。
    const content_seq_ref = useRef(0);

    useEffect(() => {
        const seq = ++content_seq_ref.current;
        if (!search || !search_content) {
            set_content_searching(false);
            return;
        }
        set_content_searching(true);
        void (async () => {
            const hits = new Set<string>();
            const cand_filters: { agents?: string[]; start_at?: number; end_at?: number } = {};
            if (agents.length > 0) cand_filters.agents = agents;
            if (start_at !== undefined) cand_filters.start_at = start_at;
            if (end_at !== undefined) cand_filters.end_at = end_at;
            const candidates = filter_sessions(all, cand_filters);
            const q = search.toLowerCase();
            for (const s of candidates) {
                try {
                    const res = await window.usageboard.sessionHistory.query(
                        s.source,
                        s.env,
                        s.id,
                        { limit: 200 },
                    );
                    if (res.messages.some((m) => match_content(m.text, q))) hits.add(key_of(s));
                } catch {
                    // 源文件缺失忽略。
                }
            }
            if (content_seq_ref.current !== seq) return; // 已有更新查询，丢弃旧结果。
            set_content_hits(hits);
            set_content_searching(false);
        })();
    }, [search, search_content, all, agents, start_at, end_at]);

    const visible_sessions = content_filtered.slice(0, visible);

    // 懒加载可见会话的首条用户消息摘要（f002）。
    useEffect(() => {
        for (const s of visible_sessions) ensure_summary(s);
    }, [visible_sessions, ensure_summary]);

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

    // Esc 关闭预览。
    useEffect(() => {
        function on_key(e: KeyboardEvent): void {
            if (e.key === "Escape") set_preview(null);
        }
        window.addEventListener("keydown", on_key);
        return () => {
            window.removeEventListener("keydown", on_key);
        };
    }, []);

    const selected_ids = new Set(selected.map((s) => key_of(s)));

    return (
        <div className="session-library">
            <header className="lib-head">
                <span className="lib-title">会话库</span>
                <span className="lib-stats">
                    {String(stats.sessions)} 个会话 · {String(stats.agents)} 个 Agent ·{" "}
                    {format_tokens(stats.tokens)} tokens
                </span>
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

            <div className="lib-agents">
                <button
                    type="button"
                    className={"lib-agent-chip" + (agents.length === 0 ? " on" : "")}
                    onClick={() => {
                        set_agents([]);
                    }}
                >
                    全部
                </button>
                {agent_counts.map(([source, count]) => (
                    <button
                        type="button"
                        key={source}
                        className={"lib-agent-chip" + (agents.includes(source) ? " on" : "")}
                        onClick={() => {
                            set_agents((prev) =>
                                prev.includes(source)
                                    ? prev.filter((a) => a !== source)
                                    : [...prev, source],
                            );
                        }}
                    >
                        <span className="lib-agent-dot" />
                        {agent_friendly(source)} {String(count)}
                    </button>
                ))}
            </div>

            {content_searching && <div className="lib-content-searching">搜索消息内容中…</div>}

            {visible_sessions.length === 0 ? (
                <div className="lib-empty">
                    <p>{load_error ? "会话列表加载失败" : "没有匹配的会话"}</p>
                    {!load_error && (
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
            ) : view_mode === "grid" ? (
                <div className="lib-grid">
                    {visible_sessions.map((s) => (
                        <SessionCard
                            key={`${s.source}|${s.env}|${s.id}`}
                            s={s}
                            summary={summaries[key_of(s)] ?? ""}
                            selected={selected_ids.has(key_of(s))}
                            on_toggle={() => {
                                toggle_select(s);
                            }}
                            on_preview={() => {
                                open_preview(s);
                            }}
                            on_open={() => {
                                open_session(s);
                            }}
                        />
                    ))}
                </div>
            ) : (
                <div className="lib-list">
                    {visible_sessions.map((s) => (
                        <SessionRow
                            key={`${s.source}|${s.env}|${s.id}`}
                            s={s}
                            summary={summaries[key_of(s)] ?? ""}
                            selected={selected_ids.has(key_of(s))}
                            on_toggle={() => {
                                toggle_select(s);
                            }}
                            on_preview={() => {
                                open_preview(s);
                            }}
                            on_open={() => {
                                open_session(s);
                            }}
                        />
                    ))}
                </div>
            )}

            {visible < content_filtered.length && (
                <button
                    type="button"
                    className="lib-load-more"
                    onClick={() => {
                        set_visible((v) => v + PAGE_SIZE);
                    }}
                >
                    加载更多
                </button>
            )}

            {preview && (
                <div
                    className="lib-preview-scrim"
                    onClick={() => {
                        set_preview(null);
                    }}
                >
                    <div
                        className="lib-preview"
                        onClick={(e) => {
                            e.stopPropagation();
                        }}
                    >
                        <div className="lib-preview-head">
                            <span className="lib-preview-agent">
                                {agent_abbrev(preview.source)}
                            </span>
                            <div className="lib-preview-text">
                                <span className="lib-preview-title">
                                    {preview.title ?? preview.id}
                                </span>
                                <span className="lib-preview-meta">
                                    {agent_slug(preview.source)} · {String(preview.calls)} 轮 ·{" "}
                                    {format_tokens(session_tokens(preview))} tokens ·{" "}
                                    {relative_date(preview.ended_at)}
                                </span>
                            </div>
                            <button
                                type="button"
                                className="lib-preview-close"
                                aria-label="关闭预览"
                                onClick={() => {
                                    set_preview(null);
                                }}
                            >
                                ×
                            </button>
                        </div>
                        <div className="lib-preview-path">{preview.directory ?? "—"}</div>
                        <div className="lib-preview-msgs">
                            {preview_msgs.length === 0 ? (
                                <div className="lib-preview-empty">无消息预览</div>
                            ) : (
                                preview_msgs.map((m) => (
                                    <div className="lib-preview-msg" key={m.id}>
                                        <span className="lib-preview-role">
                                            {m.role === "user" ? "用户" : "Agent"}
                                        </span>
                                        <MarkdownMessage text={m.text} />
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="lib-preview-foot">
                            <button
                                type="button"
                                className="lib-preview-btn"
                                onClick={() => {
                                    open_session(preview);
                                }}
                            >
                                单独打开
                            </button>
                            <button
                                type="button"
                                className="lib-preview-btn"
                                onClick={() => {
                                    toggle_select(preview);
                                }}
                            >
                                加入选择
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {selected.length > 0 && (
                <div className="lib-dock">
                    <div className="lib-dock-slots">
                        {selected.map((s) => (
                            <span className="lib-dock-slot" key={key_of(s)} title={s.title ?? s.id}>
                                {agent_abbrev(s.source)} · {s.title ?? s.id}
                                <button
                                    type="button"
                                    className="lib-dock-remove"
                                    aria-label={`移除 ${key_of(s)}`}
                                    onClick={() => {
                                        toggle_select(s);
                                    }}
                                >
                                    ×
                                </button>
                            </span>
                        ))}
                    </div>
                    <span className="lib-dock-count">
                        {String(selected.length)}/{String(MAX_SELECT)}
                    </span>
                    <button
                        type="button"
                        className="lib-dock-clear"
                        onClick={() => {
                            set_selected([]);
                        }}
                    >
                        清空
                    </button>
                    <button
                        type="button"
                        className="lib-dock-open"
                        onClick={() => {
                            for (const s of selected) {
                                void window.usageboard.sessionHistory.open(s.source, s.env, s.id);
                            }
                            on_switch_workspace();
                        }}
                    >
                        并排打开 ({String(selected.length)})
                    </button>
                </div>
            )}

            {toast !== null && <div className="lib-toast">{toast}</div>}
        </div>
    );
}

interface CardProps {
    readonly s: TokenStatsSession;
    readonly summary: string;
    readonly selected: boolean;
    readonly on_toggle: () => void;
    readonly on_preview: () => void;
    readonly on_open: () => void;
}

function SessionCard({ s, summary, selected, on_toggle, on_preview, on_open }: CardProps) {
    return (
        <div className={"lib-card" + (selected ? " selected" : "")}>
            <div className="lib-card-accent" />
            <div className="lib-card-body">
                <div className="lib-card-head">
                    <span className="lib-card-badge">{agent_abbrev(s.source)}</span>
                    <span className="lib-card-title">{s.title ?? s.id}</span>
                </div>
                <div className="lib-card-summary">{summary}</div>
                <div className="lib-card-meta mono">
                    {String(s.calls)} 轮 · {format_tokens(session_tokens(s))} tokens ·{" "}
                    {relative_date(s.ended_at)}
                </div>
                <div className="lib-card-dir">{s.directory ?? "—"}</div>
            </div>
            <div className="lib-card-actions">
                <button type="button" onClick={on_open}>
                    单独打开
                </button>
                <button type="button" aria-label="预览" onClick={on_preview}>
                    预览
                </button>
            </div>
            <button
                type="button"
                className="lib-card-select"
                aria-label={`会话 ${s.id}`}
                onClick={on_toggle}
            >
                {selected ? "✓" : ""}
            </button>
        </div>
    );
}

function SessionRow({ s, summary, selected, on_toggle, on_preview, on_open }: CardProps) {
    return (
        <div className={"lib-row" + (selected ? " selected" : "")}>
            <button
                type="button"
                className="lib-row-select"
                aria-label={`会话 ${s.id}`}
                onClick={on_toggle}
            >
                {selected ? "✓" : ""}
            </button>
            <span className="lib-row-badge">{agent_abbrev(s.source)}</span>
            <span className="lib-row-title">{s.title ?? s.id}</span>
            <span className="lib-row-summary">{summary}</span>
            <span className="lib-row-meta mono">
                {String(s.calls)} 轮 · {format_tokens(session_tokens(s))} tokens ·{" "}
                {relative_date(s.ended_at)}
            </span>
            <span className="lib-row-dir">{s.directory ?? "—"}</span>
            <button type="button" onClick={on_open}>
                单独打开
            </button>
            <button type="button" aria-label="预览" onClick={on_preview}>
                预览
            </button>
        </div>
    );
}

function format_tokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 10_000) return `${String(Math.round(n / 1000))}k`;
    return n.toLocaleString("en-US");
}
