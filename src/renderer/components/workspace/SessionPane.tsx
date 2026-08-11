import { useLayoutEffect, useMemo, useState, type CSSProperties } from "react";
import { format_time_short } from "../../lib/session-history/markdown";
import { agent_accent, vendor_id_for_source, type SlotSession } from "../../lib/workspace/slots";
import {
    format_precise_datetime,
    is_near_bottom,
    last_dir_segment,
    message_counts,
    should_insert_divider,
    summarize,
    type PaneData,
} from "../../lib/workspace/pane";
import { cn } from "../../lib/utils";
import { VendorMark } from "../Icon";
import { Button } from "../ui/Button";
import { Skeleton } from "../ui/Skeleton";
import { PaneMessageRow } from "./PaneMessageRow";
import { VirtualMessageList } from "./VirtualMessageList";

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
    readonly on_toggle: (messageId: string, shift: boolean) => void;
    readonly on_hover: (messageId: string | null) => void;
    readonly on_select_all: () => void;
    readonly on_clear_select: () => void;
    readonly on_load_older: () => void;
    readonly on_focus: () => void;
    readonly on_toggle_outline: () => void;
}

const OLDER_THRESHOLD_PX = 120;
const BOTTOM_THRESHOLD_PX = 120;

/** 会话面板：头部、消息区、大纲抽屉与脚部。 */
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
    on_hover,
    on_select_all,
    on_clear_select,
    on_load_older,
    on_focus,
    on_toggle_outline,
}: SessionPaneProps) {
    const [scroll_el, set_scroll_el] = useState<HTMLDivElement | null>(null);
    const [at_bottom, set_at_bottom] = useState(true);
    const [locate_target, set_locate_target] = useState<string | null>(null);

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

    useLayoutEffect(() => {
        const el = scroll_el;
        if (el && at_bottom) {
            el.scrollTop = el.scrollHeight;
        }
    }, [column.messages, at_bottom, scroll_el]);

    function handle_scroll(): void {
        const el = scroll_el;
        if (!el) return;
        set_at_bottom(
            is_near_bottom(el.scrollTop, el.scrollHeight, el.clientHeight, BOTTOM_THRESHOLD_PX),
        );
        if (el.scrollTop <= OLDER_THRESHOLD_PX && column.next_cursor && !column.loading_older) {
            on_load_older();
        }
    }

    function scroll_to_bottom(): void {
        const el = scroll_el;
        if (el) el.scrollTop = el.scrollHeight;
        set_at_bottom(true);
    }

    function locate_message(id: string): void {
        set_locate_target(id);
    }

    return (
        <section
            className={cn(
                "conversation-pane group relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--color-outline)] bg-[var(--color-surface-window)]",
                focused && "focused absolute inset-0 z-10 rounded-none",
            )}
            style={{ "--agent-accent": agent_accent(column.loc.source) } as CSSProperties}
            data-loc-key={`${column.loc.source}|${column.loc.env}|${column.loc.session_id}`}
            aria-label={`会话 ${column.title}`}
        >
            <div className="conversation-accent h-0.5 shrink-0 bg-[var(--agent-accent)]" />
            <header className="conversation-head flex shrink-0 items-center gap-2.5 border-b border-[var(--color-outline)] px-3 py-2">
                <span
                    className="conversation-agent-badge flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-[var(--agent-accent)]"
                    title={slot_meta.model}
                >
                    <VendorMark id={vendor_id_for_source(column.loc.source)} size={22} />
                </span>
                <div className="conversation-head-text flex min-w-0 flex-1 flex-col gap-px">
                    <span
                        className="conversation-title truncate text-[11px] font-semibold text-[var(--color-on-surface)]"
                        title={column.title}
                    >
                        {column.title}
                    </span>
                    <span
                        className="conversation-meta truncate whitespace-nowrap font-code-md text-[13px] tabular-nums text-[var(--color-on-surface-muted)]"
                        title={slot_meta.cwd ?? undefined}
                    >
                        {slot_meta.model ? slot_meta.model : ""}
                        {slot_meta.cwd ? ` · ${last_dir_segment(slot_meta.cwd)}` : ""}
                        {` · ${String(slot_meta.calls)} 轮`}
                        {` · ${format_tokens(slot_meta.tokens)} tokens`}
                        {` · ${format_precise_datetime(last_message_time(column))}`}
                    </span>
                </div>
                <div className="conversation-head-actions flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <button
                        type="button"
                        className="conversation-action flex h-[26px] w-[26px] items-center justify-center rounded-md text-[length:var(--text-body-md)] text-[var(--color-on-surface-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-on-surface-variant)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]"
                        title="大纲"
                        aria-label="大纲"
                        onClick={on_toggle_outline}
                    >
                        ≡
                    </button>
                    <button
                        type="button"
                        className="conversation-action flex h-[26px] w-[26px] items-center justify-center rounded-md text-[length:var(--text-body-md)] text-[var(--color-on-surface-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-on-surface-variant)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]"
                        title="全选可见"
                        aria-label="全选可见"
                        onClick={on_select_all}
                    >
                        ☑
                    </button>
                    <button
                        type="button"
                        className="conversation-action flex h-[26px] w-[26px] items-center justify-center rounded-md text-[length:var(--text-body-md)] text-[var(--color-on-surface-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-on-surface-variant)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]"
                        title="清空选择"
                        aria-label="清空选择"
                        onClick={on_clear_select}
                    >
                        ⊘
                    </button>
                    <button
                        type="button"
                        className="conversation-action flex h-[26px] w-[26px] items-center justify-center rounded-md text-[length:var(--text-body-md)] text-[var(--color-on-surface-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-on-surface-variant)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]"
                        title="聚焦此面板"
                        aria-label="聚焦此面板"
                        onClick={on_focus}
                    >
                        ⛶
                    </button>
                    <button
                        type="button"
                        className="conversation-action flex h-[26px] w-[26px] items-center justify-center rounded-md text-[length:var(--text-body-md)] text-[var(--color-on-surface-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-on-surface-variant)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]"
                        title="关闭"
                        aria-label="关闭面板"
                        onClick={on_close}
                    >
                        ×
                    </button>
                </div>
            </header>
            <div className="conversation-body relative flex min-h-0 flex-1">
                {column.status === "missing" ? (
                    <div className="conversation-empty flex flex-1 items-center justify-center px-4 py-2.5 text-center text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)]">
                        该会话的原始记录文件不存在或已删除
                    </div>
                ) : (
                    <div
                        className="conversation-message-scroll min-w-0 flex-1 overflow-y-auto px-3 py-2"
                        ref={set_scroll_el}
                        onScroll={handle_scroll}
                    >
                        {column.status === "loading" && column.messages.length === 0 && (
                            <div className="conversation-skeleton flex flex-col gap-2 py-1.5">
                                <Skeleton className="conversation-skeleton-row h-3" />
                                <Skeleton className="conversation-skeleton-row h-3" />
                                <Skeleton className="conversation-skeleton-row h-3" />
                            </div>
                        )}
                        <VirtualMessageList
                            messages={column.messages}
                            scrollElement={scroll_el}
                            estimateHeight={80}
                            overscan={400}
                            renderItem={(m, i) => {
                                const prev = column.messages[i - 1] ?? null;
                                const divider = should_insert_divider(
                                    prev?.timestamp ?? null,
                                    m.timestamp,
                                );
                                return (
                                    <>
                                        {divider && (
                                            <div className="conversation-divider my-2 flex items-center gap-2.5 text-[length:var(--text-label-caps)] tabular-nums text-[var(--color-on-surface-muted)] after:h-px after:flex-1 after:bg-[var(--color-outline)]">
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
                                            on_hover={on_hover}
                                        />
                                    </>
                                );
                            }}
                            scrollToId={locate_target}
                        />
                        {column.loading_older && (
                            <div className="conversation-loading px-1 py-2.5 text-center text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)]">
                                加载更早…
                            </div>
                        )}
                        {!column.next_cursor && column.messages.length > 0 && (
                            <div className="conversation-end px-1 py-2.5 text-center text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)]">
                                — 已到最早消息 —
                            </div>
                        )}
                    </div>
                )}
                {!at_bottom && column.status !== "missing" && (
                    <Button
                        variant="secondary"
                        size="sm"
                        className="conversation-to-bottom absolute bottom-3.5 right-[18px] z-10 rounded-full shadow-[var(--shadow-menu)]"
                        onClick={scroll_to_bottom}
                    >
                        回到底部 ↓
                    </Button>
                )}
                {outline_open && (
                    <div className="conversation-outline absolute bottom-0 right-0 top-0 z-20 flex w-60 min-w-0 flex-col border-l border-[var(--color-outline)] bg-[var(--color-surface-window)] shadow-[-10px_0_30px_-14px_rgba(0,0,0,0.35)]">
                        <div className="conversation-outline-head shrink-0 border-b border-[var(--color-outline)] px-3.5 py-2.5 text-[length:var(--text-body-sm)] font-semibold text-[var(--color-on-surface-variant)]">
                            大纲
                        </div>
                        <div className="conversation-outline-list flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-1.5">
                            {outline_items.map((item) => (
                                <button
                                    type="button"
                                    key={item.id}
                                    className="conversation-outline-row flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-[var(--color-surface-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]"
                                    data-message-id={item.id}
                                    onClick={() => {
                                        locate_message(item.id);
                                    }}
                                >
                                    <span className="conversation-outline-index w-[30px] shrink-0 text-[length:var(--text-label-caps)] font-bold tabular-nums text-[var(--color-on-surface-muted)]">
                                        {item.role === "user" ? "U" : "A"}
                                        {String(item.index)}
                                    </span>
                                    <span className="conversation-outline-summary min-w-0 flex-1 truncate text-[length:var(--text-body-sm)] text-[var(--color-on-surface)]">
                                        {item.summary}
                                    </span>
                                    <span className="conversation-outline-time shrink-0 font-code-md text-[length:var(--text-label-caps)] tabular-nums text-[var(--color-on-surface-muted)]">
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
            <footer className="conversation-foot flex shrink-0 items-center gap-3 border-t border-[var(--color-outline)] px-3 py-1.5 font-code-md text-[length:var(--text-label-md)] tabular-nums text-[var(--color-on-surface-muted)]">
                <span className="conversation-foot-slot font-semibold">槽位 {slot_index + 1}</span>
                <span className="conversation-foot-count">
                    用户 {String(counts.user)} · Agent {String(counts.assistant)}
                </span>
            </footer>
        </section>
    );
}

function format_tokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 10_000) return `${String(Math.round(n / 1000))}k`;
    return n.toLocaleString("en-US");
}

function last_message_time(column: PaneData): number {
    const last = column.messages[column.messages.length - 1];
    return last?.timestamp ?? column.openedAt;
}
