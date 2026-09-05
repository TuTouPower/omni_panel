import { useLayoutEffect, useMemo, useState, type CSSProperties, type DragEvent } from "react";
import { use_config } from "../../hooks/use-config";
import { format_time_short } from "../../lib/session-history/markdown";
import { resume_command } from "../../lib/session-resume";
import { agent_accent, vendor_id_for_source, type SlotSession } from "../../lib/workspace/slots";
import {
    format_compact_datetime,
    is_near_bottom,
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
    readonly column: PaneData;
    readonly slot_meta: SlotSession;
    readonly outline_open: boolean;
    readonly view: PaneView;
    readonly is_selected: (messageId: string) => boolean;
    readonly on_close: () => void;
    readonly on_toggle: (messageId: string, shift: boolean) => void;
    readonly on_hover: (messageId: string | null) => void;
    readonly on_load_older: () => void;
    readonly on_toggle_outline: () => void;
    /** t324：复制续接命令成功后提示（复用 WorkspaceView 的 show_toast）。 */
    readonly show_toast?: (message: string) => void;
    /** t410：agent icon 拖拽换槽；与侧栏 move_slot_ui 同语义。 */
    readonly dragging?: boolean;
    readonly drop_active?: boolean;
    readonly on_drag_start?: (e: DragEvent) => void;
    readonly on_drag_end?: () => void;
    readonly on_drag_over?: (e: DragEvent) => void;
    readonly on_drag_leave?: (e: DragEvent) => void;
    readonly on_drop?: (e: DragEvent) => void;
}

const OLDER_THRESHOLD_PX = 120;
const BOTTOM_THRESHOLD_PX = 120;

/** 会话面板：头部、消息区与大纲抽屉。 */
export function SessionPane({
    column,
    slot_meta,
    outline_open,
    view,
    is_selected,
    on_close,
    on_toggle,
    on_hover,
    on_load_older,
    on_toggle_outline,
    show_toast,
    dragging = false,
    drop_active = false,
    on_drag_start,
    on_drag_end,
    on_drag_over,
    on_drag_leave,
    on_drop,
}: SessionPaneProps) {
    const { config } = use_config();
    const [scroll_el, set_scroll_el] = useState<HTMLDivElement | null>(null);
    const [at_bottom, set_at_bottom] = useState(true);
    const [locate_target, set_locate_target] = useState<string | null>(null);
    const drag_enabled = on_drag_start !== undefined;

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

    // t403: 第三参接 config.resumeCommandTemplates；缺省/加载中回退内置默认。
    const session_command = resume_command(
        column.loc.source,
        column.loc.session_id,
        config?.resumeCommandTemplates,
    );

    function copy_session_command(): void {
        if (session_command === null) return;
        // web 非安全上下文（HTTP）无 clipboard API，同步 TypeError 需前置守卫。
        if (typeof navigator.clipboard === "undefined") return;
        void navigator.clipboard
            .writeText(session_command)
            .then(() => {
                show_toast?.("已复制");
            })
            .catch(() => {
                // 忽略剪贴板拒绝。
            });
    }

    return (
        <section
            className={cn(
                "group relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--color-outline)] bg-[var(--color-surface-card)]",
                dragging && "opacity-45",
                drop_active && "ring-2 ring-inset ring-[var(--color-primary)]",
            )}
            data-testid="conversation-pane"
            data-dragging={dragging || undefined}
            data-drop-target={drop_active || undefined}
            style={{ "--agent-accent": agent_accent(column.loc.source) } as CSSProperties}
            data-loc-key={`${column.loc.source}|${column.loc.env}|${column.loc.session_id}`}
            aria-label={`会话 ${column.title}`}
            onDragOver={on_drag_over}
            onDragLeave={on_drag_leave}
            onDrop={on_drop}
        >
            <div
                className="h-0.5 shrink-0 bg-[var(--agent-accent)]"
                data-testid="conversation-accent"
            />
            <header className="flex shrink-0 items-center gap-2.5 border-b border-[var(--color-outline)] px-3 py-2">
                <span
                    className={cn(
                        "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-[var(--agent-accent)]",
                        drag_enabled && "cursor-grab active:cursor-grabbing",
                    )}
                    data-testid="conversation-agent-badge"
                    title={slot_meta.model}
                    draggable={drag_enabled}
                    onDragStart={drag_enabled ? on_drag_start : undefined}
                    onDragEnd={drag_enabled ? on_drag_end : undefined}
                >
                    <VendorMark id={vendor_id_for_source(column.loc.source)} size={22} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-px">
                    <div
                        className="flex min-w-0 items-center gap-1 text-[length:var(--text-label-md)] font-semibold text-[var(--color-on-surface)]"
                        data-testid="conversation-title"
                    >
                        {slot_meta.cwd ? (
                            <>
                                <span
                                    className="shrink-0"
                                    data-testid="conversation-title-cwd"
                                    title={slot_meta.cwd}
                                >
                                    {slot_meta.cwd}
                                </span>
                                <span className="shrink-0 text-[var(--color-on-surface-muted)]">
                                    ·
                                </span>
                            </>
                        ) : null}
                        <span
                            className="shrink-0 font-code-md tabular-nums text-[var(--color-on-surface-muted)]"
                            data-testid="conversation-title-time"
                        >
                            {format_compact_datetime(last_message_time(column))}
                        </span>
                        <span className="shrink-0 text-[var(--color-on-surface-muted)]">·</span>
                        <Button
                            variant="text"
                            className="min-w-0 truncate p-0 font-code-md text-[length:var(--text-label-md)] font-[450] tabular-nums text-[var(--color-on-surface-muted)] hover:bg-transparent hover:text-[var(--color-on-surface-variant)] focus-visible:ring-[var(--color-accent-ring)]"
                            data-testid="conversation-session-id"
                            title={session_command ?? undefined}
                            onClick={copy_session_command}
                        >
                            {column.loc.session_id}
                        </Button>
                    </div>
                    <div
                        className="flex min-w-0 items-center gap-1 truncate whitespace-nowrap font-code-md text-[length:var(--text-body-md)] tabular-nums text-[var(--color-on-surface-muted)]"
                        data-testid="conversation-meta"
                    >
                        {slot_meta.model ? (
                            <span className="shrink-0">{slot_meta.model}</span>
                        ) : null}
                        <span className="shrink-0">{` · ${String(slot_meta.calls)} 轮`}</span>
                        <span className="shrink-0">
                            {` · ${format_tokens(slot_meta.tokens)} tokens`}
                        </span>
                        <span className="shrink-0"> · </span>
                        <span
                            className="min-w-0 truncate"
                            data-testid="conversation-meta-title"
                            title={column.title}
                        >
                            {column.title}
                        </span>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <Button
                        variant="icon"
                        size="icon-sm"
                        className="text-[length:var(--text-body-md)] text-[var(--color-on-surface-muted)] hover:bg-[color-mix(in_srgb,var(--color-surface-raised)_88%,var(--color-on-surface))] hover:text-[var(--color-on-surface-variant)] focus-visible:ring-[var(--color-accent-ring)]"
                        data-testid="conversation-action"
                        title="大纲"
                        aria-label="大纲"
                        onClick={on_toggle_outline}
                    >
                        ≡
                    </Button>
                    <Button
                        variant="icon"
                        size="icon-sm"
                        className="text-[length:var(--text-body-md)] text-[var(--color-on-surface-muted)] hover:bg-[color-mix(in_srgb,var(--color-surface-raised)_88%,var(--color-on-surface))] hover:text-[var(--color-on-surface-variant)] focus-visible:ring-[var(--color-accent-ring)]"
                        data-testid="conversation-action"
                        title="关闭"
                        aria-label="关闭面板"
                        onClick={on_close}
                    >
                        ×
                    </Button>
                </div>
            </header>
            <div className="relative flex min-h-0 flex-1" data-testid="conversation-body">
                {column.status === "missing" ? (
                    <div className="flex flex-1 items-center justify-center px-4 py-2.5 text-center text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)]">
                        该会话的原始记录文件不存在或已删除
                    </div>
                ) : (
                    <div
                        className="scrollbar-token min-w-0 flex-1 overflow-y-auto px-3 py-2"
                        data-testid="conversation-message-scroll"
                        ref={set_scroll_el}
                        onScroll={handle_scroll}
                    >
                        {column.status === "loading" && column.messages.length === 0 && (
                            <div
                                className="flex flex-col gap-2 py-2"
                                data-testid="conversation-skeleton"
                            >
                                <Skeleton className="h-3" />
                                <Skeleton className="h-3" />
                                <Skeleton className="h-3" />
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
                                // t427: 组边界只看相邻 role（divider 不拆组）。
                                const show_role_label = prev?.role !== m.role;
                                return (
                                    <>
                                        {divider && (
                                            <div
                                                className="my-2 flex items-center gap-2.5 text-[length:var(--text-label-caps)] tabular-nums text-[var(--color-on-surface-muted)] after:h-px after:flex-1 after:bg-[var(--color-outline)]"
                                                data-testid="conversation-divider"
                                            >
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
                                            show_role_label={show_role_label}
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
                            <div
                                className="px-1 py-2.5 text-center text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)]"
                                data-testid="conversation-loading"
                            >
                                加载更早…
                            </div>
                        )}
                        {!column.next_cursor && column.messages.length > 0 && (
                            <div className="px-1 py-2.5 text-center text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)]">
                                — 已到最早消息 —
                            </div>
                        )}
                    </div>
                )}
                {!at_bottom && column.status !== "missing" && (
                    <Button
                        variant="secondary"
                        size="sm"
                        className="absolute bottom-3.5 right-[18px] z-[var(--z-sticky)] rounded-full shadow-menu"
                        data-testid="conversation-to-bottom"
                        onClick={scroll_to_bottom}
                    >
                        回到底部 ↓
                    </Button>
                )}
                {outline_open && (
                    <div
                        className="absolute bottom-0 right-0 top-0 z-[var(--z-context)] flex w-60 min-w-0 flex-col border-l border-[var(--color-outline)] bg-[var(--color-surface-window)] shadow-menu"
                        data-testid="conversation-outline"
                    >
                        <div className="shrink-0 border-b border-[var(--color-outline)] px-3.5 py-2.5 text-[length:var(--text-body-sm)] font-semibold text-[var(--color-on-surface-variant)]">
                            大纲
                        </div>
                        <div
                            className="scrollbar-token flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2"
                            data-testid="conversation-outline-list"
                        >
                            {outline_items.map((item) => (
                                <button
                                    type="button"
                                    key={item.id}
                                    className="flex items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-[color-mix(in_srgb,var(--color-surface-raised)_88%,var(--color-on-surface))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]"
                                    data-testid="conversation-outline-row"
                                    data-message-id={item.id}
                                    onClick={() => {
                                        locate_message(item.id);
                                    }}
                                >
                                    <span className="w-[30px] shrink-0 text-[length:var(--text-label-caps)] font-bold tabular-nums text-[var(--color-on-surface-muted)]">
                                        {item.role === "user" ? "U" : "A"}
                                        {String(item.index)}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-[length:var(--text-body-sm)] text-[var(--color-on-surface)]">
                                        {item.summary}
                                    </span>
                                    <span className="shrink-0 font-code-md text-[length:var(--text-label-caps)] tabular-nums text-[var(--color-on-surface-muted)]">
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
