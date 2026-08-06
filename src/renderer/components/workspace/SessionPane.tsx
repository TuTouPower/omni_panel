import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { HistoryMessageLike } from "../../../shared/types/ipc";
import { format_time_short } from "../../lib/session-history/markdown";
import type { SlotSession } from "../../lib/workspace/slots";
import {
    is_near_bottom,
    message_counts,
    should_insert_divider,
    summarize,
    type PaneData,
} from "../../lib/workspace/pane";
import { MarkdownMessage } from "./MarkdownMessage";

export interface PaneView {
    readonly show_time: boolean;
    readonly compact: boolean;
}

export interface SessionPaneProps {
    readonly slot_index: number;
    readonly column: PaneData;
    readonly slot_meta: SlotSession;
    readonly focused: boolean;
    readonly outline_open: boolean;
    readonly view: PaneView;
    readonly is_selected: (messageId: string) => boolean;
    readonly on_close: () => void;
    readonly on_toggle: (messageId: string) => void;
    readonly on_select_all: () => void;
    readonly on_clear_select: () => void;
    readonly on_load_older: () => void;
    readonly on_focus: () => void;
    readonly on_toggle_outline: () => void;
}

const OLDER_THRESHOLD_PX = 120;
const BOTTOM_THRESHOLD_PX = 120;

function agent_initial(source: string): string {
    if (source === "claude_code") return "C";
    if (source === "opencode") return "OC";
    if (source === "kimi_code") return "K";
    if (source === "grok") return "G";
    return source.slice(0, 2).toUpperCase();
}

/** t225 会话面板：头部 + 消息区 + 大纲抽屉 + 脚部。滚动分页/前置补偿沿用 t211 决策 17。 */
export function SessionPane({
    slot_index,
    column,
    slot_meta,
    focused,
    outline_open,
    view,
    is_selected,
    on_close,
    on_toggle,
    on_select_all,
    on_clear_select,
    on_load_older,
    on_focus,
    on_toggle_outline,
}: SessionPaneProps) {
    const scroll_ref = useRef<HTMLDivElement | null>(null);
    const prev_first_id_ref = useRef<string | null>(null);
    const prev_height_ref = useRef<number | null>(null);
    const [at_bottom, set_at_bottom] = useState(true);
    const first_id = column.messages[0]?.id ?? null;

    const counts = useMemo(() => message_counts(column.messages), [column.messages]);

    const outline_items = useMemo(
        () =>
            column.messages.map((m, i) => ({
                id: m.id,
                index: i + 1,
                role: m.role,
                summary: summarize(m.text),
                timestamp: m.timestamp,
            })),
        [column.messages],
    );

    // 前置（load older）后补偿 scrollTop；新消息在底部时保持跟随。
    useLayoutEffect(() => {
        const el = scroll_ref.current;
        const prev_height = prev_height_ref.current;
        const is_prepend =
            first_id !== null &&
            prev_first_id_ref.current !== null &&
            first_id !== prev_first_id_ref.current;
        prev_first_id_ref.current = first_id;
        if (el) {
            const was_at_bottom = at_bottom;
            const prev_scroll_height = prev_height;
            prev_height_ref.current = el.scrollHeight;
            if (is_prepend && prev_scroll_height !== null && el.scrollHeight > prev_scroll_height) {
                el.scrollTop += el.scrollHeight - prev_scroll_height;
            } else if (was_at_bottom) {
                el.scrollTop = el.scrollHeight;
            }
        }
    }, [column.messages, first_id, at_bottom]);

    function handle_scroll(): void {
        const el = scroll_ref.current;
        if (!el) return;
        set_at_bottom(
            is_near_bottom(el.scrollTop, el.scrollHeight, el.clientHeight, BOTTOM_THRESHOLD_PX),
        );
        if (el.scrollTop <= OLDER_THRESHOLD_PX && column.next_cursor && !column.loading_older) {
            on_load_older();
        }
    }

    function scroll_to_bottom(): void {
        const el = scroll_ref.current;
        if (el) el.scrollTop = el.scrollHeight;
        set_at_bottom(true);
    }

    function locate_message(id: string): void {
        const row = scroll_ref.current?.querySelector<HTMLElement>(
            `[data-message-id="${CSS.escape(id)}"]`,
        );
        row?.scrollIntoView({ block: "nearest" });
    }

    return (
        <section
            className={"session-pane" + (focused ? " focused" : "")}
            data-loc-key={`${column.loc.source}|${column.loc.env}|${column.loc.session_id}`}
            aria-label={`会话 ${column.title}`}
        >
            <div className="pane-accent" />
            <header className="pane-head">
                <span className="pane-agent-badge" title={slot_meta.model}>
                    {agent_initial(column.loc.source)}
                </span>
                <div className="pane-head-text">
                    <span className="pane-title" title={column.title}>
                        {column.title}
                    </span>
                    <span className="pane-meta">
                        {column.loc.source}
                        {slot_meta.model ? ` · ${slot_meta.model}` : ""}
                        {slot_meta.cwd ? ` · ${slot_meta.cwd}` : ""} · {String(slot_meta.calls)} 轮
                        · {format_tokens(slot_meta.tokens)} tokens · {format_date(column.openedAt)}
                    </span>
                </div>
                <div className="pane-head-actions">
                    <button
                        type="button"
                        className="pane-hover-btn"
                        title="大纲"
                        aria-label="大纲"
                        onClick={on_toggle_outline}
                    >
                        ≡
                    </button>
                    <button
                        type="button"
                        className="pane-hover-btn"
                        title="全选可见"
                        aria-label="全选可见"
                        onClick={on_select_all}
                    >
                        ☑
                    </button>
                    <button
                        type="button"
                        className="pane-hover-btn"
                        title="清空选择"
                        aria-label="清空选择"
                        onClick={on_clear_select}
                    >
                        ⊘
                    </button>
                    <button
                        type="button"
                        className="pane-hover-btn"
                        title="聚焦此面板"
                        aria-label="聚焦此面板"
                        onClick={on_focus}
                    >
                        ⛶
                    </button>
                    <button
                        type="button"
                        className="pane-hover-btn"
                        title="关闭"
                        aria-label="关闭面板"
                        onClick={on_close}
                    >
                        ×
                    </button>
                </div>
            </header>
            <div className="pane-body">
                {column.status === "missing" ? (
                    <div className="pane-empty">该会话的原始记录文件不存在或已删除</div>
                ) : (
                    <div className="pane-msgs" ref={scroll_ref} onScroll={handle_scroll}>
                        {column.status === "loading" && column.messages.length === 0 && (
                            <div className="pane-skeleton">
                                <div className="pane-skel-row" />
                                <div className="pane-skel-row" />
                                <div className="pane-skel-row" />
                            </div>
                        )}
                        {column.messages.map((m, i) => {
                            const prev = column.messages[i - 1] ?? null;
                            const divider = should_insert_divider(
                                prev?.timestamp ?? null,
                                m.timestamp,
                            );
                            return (
                                <div key={m.id}>
                                    {divider && (
                                        <div className="pane-divider">
                                            <span>
                                                {m.timestamp !== null
                                                    ? format_time_short(m.timestamp)
                                                    : ""}
                                            </span>
                                        </div>
                                    )}
                                    <PaneMessageRow
                                        message={m}
                                        selected={is_selected(m.id)}
                                        show_time={view.show_time}
                                        compact={view.compact}
                                        on_toggle={on_toggle}
                                    />
                                </div>
                            );
                        })}
                        {column.loading_older && <div className="pane-loading">加载更早…</div>}
                        {!column.next_cursor && column.messages.length > 0 && (
                            <div className="pane-end">— 已到最早消息 —</div>
                        )}
                    </div>
                )}
                {!at_bottom && column.status !== "missing" && (
                    <button type="button" className="pane-to-bottom" onClick={scroll_to_bottom}>
                        回到底部 ↓
                    </button>
                )}
                {outline_open && (
                    <div className="pane-outline">
                        <div className="pane-outline-head">大纲</div>
                        <div className="pane-outline-list">
                            {outline_items.map((item) => (
                                <button
                                    type="button"
                                    key={item.id}
                                    className="pane-outline-row"
                                    data-message-id={item.id}
                                    onClick={() => {
                                        locate_message(item.id);
                                    }}
                                >
                                    <span className="pane-outline-index">
                                        {item.role === "user" ? "U" : "A"}
                                        {String(item.index)}
                                    </span>
                                    <span className="pane-outline-summary">{item.summary}</span>
                                    <span className="pane-outline-time">
                                        {item.timestamp !== null
                                            ? format_time_short(item.timestamp)
                                            : ""}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            <footer className="pane-foot">
                <span className="pane-foot-slot">槽位 {slot_index + 1}</span>
                <span className="pane-foot-count">
                    用户 {String(counts.user)} · Agent {String(counts.assistant)}
                </span>
            </footer>
        </section>
    );
}

interface PaneMessageRowProps {
    readonly message: HistoryMessageLike;
    readonly selected: boolean;
    readonly show_time: boolean;
    readonly compact: boolean;
    readonly on_toggle: (id: string) => void;
}

function PaneMessageRow({ message, selected, show_time, compact, on_toggle }: PaneMessageRowProps) {
    return (
        <div className={"pane-msg-row" + (compact ? " compact" : "")} data-message-id={message.id}>
            <input
                type="checkbox"
                className="pane-msg-check"
                aria-label={`选择消息 ${message.text.slice(0, 24) || "(空)"}`}
                checked={selected}
                onChange={() => {
                    on_toggle(message.id);
                }}
            />
            <div className="pane-msg-body">
                <div className="pane-msg-meta">
                    <span className="pane-msg-role">
                        {message.role === "user" ? "用户" : "Agent"}
                    </span>
                    {show_time && message.timestamp !== null && (
                        <span className="pane-msg-time">
                            {format_time_short(message.timestamp)}
                        </span>
                    )}
                </div>
                <MarkdownMessage text={message.text} />
            </div>
        </div>
    );
}

function format_tokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 10_000) return `${String(Math.round(n / 1000))}k`;
    return n.toLocaleString("en-US");
}

function format_date(ts: number): string {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${String(y)}-${m}-${day}`;
}
