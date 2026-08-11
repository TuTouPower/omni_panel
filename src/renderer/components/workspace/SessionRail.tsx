import { useState, type CSSProperties, type DragEvent } from "react";
import { VendorMark } from "../Icon";
import {
    agent_accent,
    format_tokens,
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

/** 左侧会话槽位栏：占用槽位显示 provider 标识与元数据，空槽提供装入入口。 */
export function SessionRail({
    slots,
    collapsed,
    on_toggle_collapse,
    on_pick,
    on_close,
    on_move,
}: SessionRailProps) {
    const [drag_from, set_drag_from] = useState<number | null>(null);

    function handle_drop(e: DragEvent, to: number): void {
        e.preventDefault();
        if (drag_from !== null) on_move(drag_from, to);
        set_drag_from(null);
    }

    return (
        <div
            className={cn(
                "session-rail flex w-[220px] shrink-0 flex-col border-r border-[var(--color-outline)] bg-[var(--color-surface)] transition-[width] duration-200",
                collapsed && "collapsed w-11",
            )}
            data-collapsed={collapsed}
        >
            <button
                type="button"
                className="session-rail-toggle h-[34px] shrink-0 border-b border-[var(--color-outline)] bg-transparent text-[length:var(--text-body-md)] text-[var(--color-on-surface-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-on-surface-variant)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]"
                title={collapsed ? "展开槽位栏" : "折叠槽位栏"}
                aria-label={collapsed ? "展开槽位栏" : "折叠槽位栏"}
                onClick={on_toggle_collapse}
            >
                {collapsed ? "»" : "«"}
            </button>
            <div
                className={cn(
                    "session-rail-scroll flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2",
                    collapsed && "px-1.5",
                )}
            >
                {slots.map((slot, index) =>
                    slot === null ? (
                        <button
                            type="button"
                            key={`empty-${String(index)}`}
                            className={cn(
                                "session-slot session-slot-empty flex min-h-12 items-center justify-center rounded-lg border border-dashed border-[var(--color-on-surface-variant)] bg-transparent px-2 text-[length:var(--text-body-sm)] font-medium text-[var(--color-on-surface-muted)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-container)] hover:text-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]",
                                collapsed && "mx-auto min-h-9 w-9 rounded-lg p-0",
                            )}
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
                                "session-slot group flex min-h-12 cursor-grab items-center gap-2 overflow-hidden rounded-lg border border-[var(--color-outline)] bg-[var(--color-surface-window)] px-2 py-1.5 text-left hover:border-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-raised)] active:cursor-grabbing",
                                collapsed && "mx-auto min-h-9 w-9 justify-center rounded-lg p-0",
                            )}
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
                            <span className="session-badge flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[var(--agent-accent)]">
                                <VendorMark id={vendor_id_for_source(slot.loc.source)} size={20} />
                            </span>
                            {!collapsed && (
                                <div className="session-slot-body flex min-w-0 flex-1 flex-col gap-0.5">
                                    <div
                                        className="session-slot-title truncate text-[length:var(--text-body-sm)] font-semibold text-[var(--color-on-surface)]"
                                        title={slot.title}
                                    >
                                        {slot.title}
                                    </div>
                                    <div className="session-slot-meta whitespace-nowrap font-code-md text-[length:var(--text-label-md)] tabular-nums text-[var(--color-on-surface-muted)]">
                                        {String(slot.calls)} 轮 · {format_tokens(slot.tokens)}{" "}
                                        tokens
                                    </div>
                                </div>
                            )}
                            {!collapsed && (
                                <button
                                    type="button"
                                    className="session-slot-close flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-[length:var(--text-body-md)] text-[var(--color-on-surface-muted)] opacity-0 hover:bg-[color-mix(in_srgb,var(--color-error)_12%,transparent)] hover:text-[var(--color-error)] group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]"
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
        </div>
    );
}
