import { useCallback, useEffect, useRef, useState } from "react";
import type { HistoryMessageLike } from "../../../shared/types/ipc";
import type { TokenStatsSession } from "../../../shared/types/token-stats";
import { HISTORY_PAGE_SIZE } from "../../lib/session-history/layout";
import { format_compact_datetime } from "../../lib/workspace/pane";
import { merge_tail } from "../workspace/workspace-view-helpers";
import type { CSSProperties } from "react";
import { agent_accent, vendor_id_for_source } from "../../lib/workspace/slots";
import { cn } from "../../lib/utils";
import { Icon, VendorMark } from "../Icon";
import { Button } from "../ui/Button";
import { IdChip } from "../session-library/SessionCard";
import { format_session_tokens, key_of } from "../session-library/session-library-utils";
import { MarkdownMessage } from "../workspace/MarkdownMessage";
import { Skeleton } from "../ui/Skeleton";

const RECENT_OPTIONS = [2, 4, 6, 8] as const;

interface CompareViewProps {
    readonly sessions: readonly TokenStatsSession[];
    readonly on_back: () => void;
    readonly on_remove: (session: TokenStatsSession) => void;
    readonly on_open_recent: (n: number) => void;
    readonly on_show_toast?: ((message: string) => void) | undefined;
    /** 顶栏刷新 token：递增时重拉各面板消息。 */
    readonly refresh_token?: number | undefined;
}

type PanelStatus = "loading" | "ready" | "missing";

interface PanelState {
    readonly messages: readonly HistoryMessageLike[];
    readonly next_cursor: unknown;
    readonly loading_older: boolean;
    readonly status: PanelStatus;
}

const EMPTY_PANEL: PanelState = {
    messages: [],
    next_cursor: null,
    loading_older: false,
    status: "loading",
};

/**
 * 同屏查看页（对齐 demo CompareView）：
 * ← 返回会话库、同屏最近 2/4/6/8、独立会话列（demo 卡片头 + 消息区）。
 */
export function CompareView({
    sessions,
    on_back,
    on_remove,
    on_open_recent,
    on_show_toast,
    refresh_token,
}: CompareViewProps) {
    return (
        <div className="flex h-full min-h-0 flex-col" data-testid="compare-view">
            <div
                className="flex h-11 shrink-0 items-center gap-3 border-b border-[var(--color-hairline)] bg-[var(--color-surface-window)] px-3.5"
                data-testid="compare-titlebar"
            >
                <Button variant="ghost" size="sm" onClick={on_back} aria-label="返回会话库">
                    <Icon name="back" size={14} />
                    返回会话库
                </Button>

                <div className="flex items-center gap-2">
                    <span className="mr-1 flex items-center gap-2 text-[length:var(--text-label-md)] text-[var(--color-on-surface-muted)]">
                        <Icon name="columns2" size={14} />
                        同屏最近
                    </span>
                    {RECENT_OPTIONS.map((n) => (
                        <button
                            key={n}
                            type="button"
                            title={`同屏打开最近 ${String(n)} 条会话`}
                            data-testid={`compare-open-recent-${String(n)}`}
                            className="w-7 cursor-pointer rounded-md border border-[var(--color-outline)] py-1 text-[length:var(--text-label-md)] text-[var(--color-on-surface-variant)] transition-feedback hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-container)] hover:text-[var(--color-primary)]"
                            onClick={() => {
                                on_open_recent(n);
                            }}
                        >
                            {n}
                        </button>
                    ))}
                </div>

                <div className="flex-1" />

                <span className="text-[length:var(--text-label-md)] uppercase tracking-wide tabular-nums text-[var(--color-on-surface-muted)]">
                    {sessions.length} 条会话
                </span>
            </div>

            {sessions.length === 0 ? (
                <div className="grid flex-1 place-items-center">
                    <div className="text-center">
                        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-xl border border-dashed border-[var(--color-outline)] text-[var(--color-on-surface-muted)]">
                            <Icon name="columns2" size={22} />
                        </div>
                        <p className="text-[length:var(--text-body-md)] text-[var(--color-on-surface-variant)]">
                            没有选中的会话
                        </p>
                        <p className="mt-1 text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)]">
                            返回会话库勾选，或直接用「同屏最近」打开
                        </p>
                    </div>
                </div>
            ) : (
                <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-3">
                    <div
                        className="grid h-full grid-flow-col gap-3"
                        style={{
                            gridTemplateColumns: `repeat(${String(sessions.length)}, minmax(360px, 1fr))`,
                        }}
                    >
                        {sessions.map((s) => (
                            <ComparePanel
                                key={key_of(s)}
                                session={s}
                                on_remove={() => {
                                    on_remove(s);
                                }}
                                on_show_toast={on_show_toast}
                                refresh_token={refresh_token}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function ComparePanel({
    session,
    on_remove,
    on_show_toast,
    refresh_token,
}: {
    readonly session: TokenStatsSession;
    readonly on_remove: () => void;
    readonly on_show_toast?: ((message: string) => void) | undefined;
    readonly refresh_token?: number | undefined;
}) {
    const [panel, set_panel] = useState<PanelState>(EMPTY_PANEL);
    const loading_older_lock = useRef(false);
    const load_messages = useCallback((): void => {
        set_panel(EMPTY_PANEL);
        void window.usageboard.sessionHistory
            .subscribe(session.source, session.env, session.id)
            .catch(() => {
                // 源缺失：订阅拒绝不抛；query 置 missing。
            });
        void window.usageboard.sessionHistory
            .query(session.source, session.env, session.id, { limit: HISTORY_PAGE_SIZE })
            .then((q) => {
                set_panel({
                    messages: q.messages,
                    next_cursor: q.next_cursor,
                    loading_older: false,
                    status: "ready",
                });
            })
            .catch(() => {
                set_panel({
                    messages: [],
                    next_cursor: null,
                    loading_older: false,
                    status: "missing",
                });
            });
    }, [session.source, session.env, session.id]);

    useEffect(() => {
        load_messages();
        return () => {
            void window.usageboard.sessionHistory
                .unsubscribe(session.source, session.env, session.id)
                .catch(() => undefined);
        };
    }, [load_messages, session.source, session.env, session.id]);

    useEffect(() => {
        if (refresh_token === undefined) return;
        load_messages();
    }, [refresh_token, load_messages]);

    useEffect(() => {
        const off = window.usageboard.sessionHistory.onMessagesUpdated((payload) => {
            if (
                payload.source !== session.source ||
                payload.env !== session.env ||
                payload.session_id !== session.id
            ) {
                return;
            }
            set_panel((prev) => ({
                ...prev,
                messages: merge_tail(prev.messages, payload.messages),
                status: "ready",
            }));
        });
        return off;
    }, [session.source, session.env, session.id]);

    function load_older(): void {
        if (loading_older_lock.current) return;
        if (panel.loading_older || !panel.next_cursor || panel.status !== "ready") return;
        loading_older_lock.current = true;
        set_panel((prev) => ({ ...prev, loading_older: true }));
        void window.usageboard.sessionHistory
            .query(session.source, session.env, session.id, {
                limit: HISTORY_PAGE_SIZE,
                before_cursor: panel.next_cursor,
            })
            .then((q) => {
                loading_older_lock.current = false;
                set_panel((prev) => ({
                    ...prev,
                    messages: [...q.messages, ...prev.messages],
                    next_cursor: q.next_cursor,
                    loading_older: false,
                }));
            })
            .catch(() => {
                loading_older_lock.current = false;
                set_panel((prev) => ({ ...prev, loading_older: false }));
            });
    }

    const tokens_label = format_session_tokens(session);
    const time_range = `${format_compact_datetime(session.started_at)} → ${format_compact_datetime(session.ended_at)}`;

    return (
        <div
            className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-[var(--color-hairline)] bg-[var(--color-surface-card)] shadow-card"
            data-testid="compare-panel"
            data-session-id={session.id}
            style={{ "--agent-accent": agent_accent(session.source) } as CSSProperties}
        >
            <div className="shrink-0 border-b border-[var(--color-hairline)] px-4 py-4">
                <div className="flex items-center gap-2.5">
                    <span className="shrink-0" data-testid="compare-panel-badge">
                        <VendorMark id={vendor_id_for_source(session.source)} size={22} />
                    </span>
                    <span className="truncate text-[length:var(--text-label-md)] tabular-nums text-[var(--color-on-surface-muted)]">
                        {time_range}
                    </span>
                    <Button
                        variant="icon"
                        size="icon-sm"
                        className="ml-auto shrink-0 text-[var(--color-on-surface-muted)] hover:text-[var(--color-error)]"
                        aria-label="从对比中移除"
                        title="从对比中移除"
                        onClick={on_remove}
                    >
                        <Icon name="close" size={13} />
                    </Button>
                </div>

                <p
                    className="mt-2 truncate text-[length:var(--text-body-md)] text-[var(--color-on-surface)]"
                    title={session.title ?? session.id}
                >
                    {session.title ?? session.id}
                </p>

                <p
                    className="mt-1 truncate font-code-md text-[length:var(--text-label-md)] text-[var(--color-on-surface-muted)]"
                    title={session.directory ?? undefined}
                >
                    {session.directory ?? "—"}
                </p>

                <div className="mt-2 flex min-w-0 items-center gap-2 text-[length:var(--text-label-md)]">
                    <span className="shrink-0 font-semibold tabular-nums text-[var(--color-on-surface)]">
                        {tokens_label}
                    </span>
                    <span className="shrink-0 tabular-nums text-[var(--color-on-surface-variant)]">
                        {session.calls} 轮
                    </span>
                    <IdChip id={session.id} on_copied={on_show_toast} />
                </div>
            </div>

            <div
                className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5"
                data-testid="compare-panel-messages"
                onScroll={(e) => {
                    const el = e.currentTarget;
                    if (el.scrollTop < 120) load_older();
                }}
            >
                {panel.status === "loading" && (
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-4 w-[75%]" />
                        <Skeleton className="h-4 w-[50%]" />
                        <Skeleton className="h-4 w-[66%]" />
                    </div>
                )}
                {panel.status === "missing" && (
                    <p className="text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)]">
                        会话源文件不可用
                    </p>
                )}
                {panel.status === "ready" && panel.messages.length === 0 && (
                    <p className="text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)]">
                        无消息
                    </p>
                )}
                {panel.status === "ready" &&
                    panel.messages.map((m) => (
                        <div key={m.id} className="mb-3" data-testid="compare-message">
                            <span
                                className={cn(
                                    "mb-1 block text-[length:var(--text-label-md)] font-semibold",
                                    m.role === "user"
                                        ? "text-[var(--color-on-surface-variant)]"
                                        : "text-[var(--agent-accent)]",
                                )}
                            >
                                {m.role === "user" ? "用户" : "Agent"}
                            </span>
                            <MarkdownMessage text={m.text} />
                        </div>
                    ))}
                {panel.loading_older && (
                    <p className="mb-2 text-[length:var(--text-label-md)] text-[var(--color-on-surface-muted)]">
                        加载更早消息…
                    </p>
                )}
            </div>
        </div>
    );
}
