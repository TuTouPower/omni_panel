import { useState, type CSSProperties, type DragEvent } from "react";
import { VendorMark } from "../Icon";
import {
    agent_accent,
    format_tokens,
    MAX_SLOTS,
    occupied_count,
    vendor_id_for_source,
    type SlotsState,
} from "../../lib/workspace/slots";
import { cn } from "../../lib/utils";

interface SessionRailProps {
    readonly slots: SlotsState;
    readonly collapsed: boolean;
    readonly on_toggle_collapse: () => void;
    readonly on_pick: (index: number) => void;
    readonly on_close: (index: number) => void;
    readonly on_move: (from: number, to: number) => void;
}

/** 左侧会话槽位栏：头部折叠钮、占用槽位元数据、底部固定添加入口。 */
export function SessionRail({
    slots,
    collapsed,
    on_toggle_collapse,
    on_pick,
    on_close,
    on_move,
}: SessionRailProps) {
    const [drag_from, set_drag_from] = useState<number | null>(null);
    const first_empty = slots.findIndex((s) => s === null);
    const count = occupied_count(slots);

    function handle_drop(e: DragEvent, to: number): void {
        e.preventDefault();
        if (drag_from !== null) on_move(drag_from, to);
        set_drag_from(null);
    }

    return (
        <div
            className={cn(
                "flex w-[220px] shrink-0 flex-col border-r border-[var(--color-outline)] bg-[var(--color-surface-window)] transition-[width] duration-200",
                collapsed && "collapsed w-11",
            )}
            data-testid="session-rail"
            data-collapsed={collapsed}
        >
            <div
                className={cn(
                    "flex h-8 shrink-0 items-center gap-1.5 border-b border-[var(--color-hairline)] px-2",
                    collapsed && "justify-center px-0",
                )}
                data-testid="session-rail-header"
            >
                {!collapsed && (
                    <>
                        <span className="text-[length:var(--text-label-md)] font-semibold text-[var(--color-on-surface-variant)]">
                            会话槽位
                        </span>
                        <span className="font-code-md text-[length:var(--text-label-md)] tabular-nums text-[var(--color-on-surface-muted)]">
                            {String(count)}/{String(MAX_SLOTS)}
                        </span>
                    </>
                )}
                <button
                    type="button"
                    className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[length:var(--text-body-md)] text-[var(--color-on-surface-muted)] transition-colors hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-on-surface-variant)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]",
                        !collapsed && "ml-auto",
                    )}
                    data-testid="session-rail-toggle"
                    title={collapsed ? "展开槽位栏" : "折叠槽位栏"}
                    aria-label={collapsed ? "展开槽位栏" : "折叠槽位栏"}
                    onClick={on_toggle_collapse}
                >
                    {collapsed ? "»" : "«"}
                </button>
            </div>
            <div
                className={cn(
                    "scrollbar-token flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2",
                    collapsed && "px-1.5",
                )}
                data-testid="session-rail-scroll"
            >
                {slots.map((slot, index) =>
                    slot === null ? (
                        <button
                            type="button"
                            key={`empty-${String(index)}`}
                            className={cn(
                                "flex min-h-12 items-center justify-center rounded-lg border border-dashed border-[var(--color-on-surface-variant)] bg-transparent px-2 text-[length:var(--text-body-sm)] font-medium text-[var(--color-on-surface-muted)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-container)] hover:text-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]",
                                collapsed && "mx-auto min-h-9 w-9 rounded-lg p-0",
                            )}
                            data-testid="session-slot-empty"
                            aria-label={`槽位 ${String(index + 1)}（空）`}
                            onClick={() => {
                                on_pick(index);
                            }}
                        >
                            {collapsed ? "+" : "+ 添加会话"}
                        </button>
                    ) : (
                        <div
                            key={`${slot.loc.source}|${slot.loc.env}|${slot.loc.session_id}`}
                            className={cn(
                                "group flex min-h-12 cursor-grab items-center gap-2 overflow-hidden rounded-lg border border-[var(--color-outline)] bg-[var(--color-surface-card)] px-2 py-1.5 text-left hover:border-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-raised)] active:cursor-grabbing",
                                collapsed && "mx-auto min-h-9 w-9 justify-center rounded-lg p-0",
                            )}
                            data-testid="session-slot"
                            style={
                                { "--agent-accent": agent_accent(slot.loc.source) } as CSSProperties
                            }
                            draggable
                            data-index={String(index)}
                            onDragStart={() => {
                                set_drag_from(index);
                            }}
                            onDragOver={(e) => {
                                e.preventDefault();
                            }}
                            onDrop={(e) => {
                                handle_drop(e, index);
                            }}
                        >
                            <span
                                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[var(--agent-accent)]"
                                data-testid="session-badge"
                            >
                                <VendorMark id={vendor_id_for_source(slot.loc.source)} size={20} />
                            </span>
                            {!collapsed && (
                                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                    <div
                                        className="truncate text-[length:var(--text-body-sm)] font-semibold text-[var(--color-on-surface)]"
                                        data-testid="session-slot-title"
                                        title={slot.title}
                                    >
                                        {slot.title}
                                    </div>
                                    <div
                                        className="whitespace-nowrap font-code-md text-[length:var(--text-label-md)] tabular-nums text-[var(--color-on-surface-muted)]"
                                        data-testid="session-slot-meta"
                                    >
                                        {String(slot.calls)} 轮 · {format_tokens(slot.tokens)}{" "}
                                        tokens
                                    </div>
                                </div>
                            )}
                            {!collapsed && (
                                <button
                                    type="button"
                                    className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-[length:var(--text-body-md)] text-[var(--color-on-surface-muted)] opacity-0 hover:bg-[color-mix(in_srgb,var(--color-error)_12%,transparent)] hover:text-[var(--color-error)] group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]"
                                    aria-label="关闭会话"
                                    onClick={() => {
                                        on_close(index);
                                    }}
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    ),
                )}
            </div>
            <div
                className={cn(
                    "shrink-0 border-t border-[var(--color-hairline)] p-2",
                    collapsed && "px-1.5",
                )}
                data-testid="session-rail-footer"
            >
                <button
                    type="button"
                    className={cn(
                        "flex w-full items-center justify-center rounded-lg border border-[var(--color-outline)] bg-transparent text-[length:var(--text-body-sm)] font-medium text-[var(--color-on-surface-muted)] transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-container)] hover:text-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--color-outline)] disabled:hover:bg-transparent disabled:hover:text-[var(--color-on-surface-muted)]",
                        collapsed ? "mx-auto h-9 w-9 p-0" : "h-8 px-2",
                    )}
                    data-testid="session-slot-add"
                    disabled={first_empty === -1}
                    title={first_empty === -1 ? "槽位已满" : "添加会话"}
                    aria-label="添加会话"
                    onClick={() => {
                        if (first_empty === -1) return;
                        on_pick(first_empty);
                    }}
                >
                    {collapsed ? "+" : "+ 添加会话"}
                </button>
            </div>
        </div>
    );
}
