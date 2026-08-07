import { useState, type DragEvent } from "react";
import { VendorMark } from "../Icon";
import { format_tokens, vendor_id_for_source, type SlotsState } from "../../lib/workspace/slots";

interface SessionRailProps {
    readonly slots: SlotsState;
    readonly collapsed: boolean;
    readonly on_toggle_collapse: () => void;
    readonly on_pick: (index: number) => void;
    readonly on_close: (index: number) => void;
    readonly on_move: (from: number, to: number) => void;
}

/** t224 左侧会话槽位 rail：占用槽位显示 agent 色左条 + 标题 + 轮数·tokens；空槽虚线占位。 */
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
        <div className={"session-rail" + (collapsed ? " collapsed" : "")}>
            <button
                type="button"
                className="rail-collapse"
                title={collapsed ? "展开槽位栏" : "折叠槽位栏"}
                aria-label={collapsed ? "展开槽位栏" : "折叠槽位栏"}
                onClick={on_toggle_collapse}
            >
                {collapsed ? "»" : "«"}
            </button>
            <div className="rail-scroll">
                {slots.map((slot, index) =>
                    slot === null ? (
                        <button
                            type="button"
                            key={`empty-${String(index)}`}
                            className="rail-slot rail-slot-empty"
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
                            className="rail-slot"
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
                            <span className="rail-badge">
                                <VendorMark id={vendor_id_for_source(slot.loc.source)} size={20} />
                            </span>
                            <div className="rail-body">
                                <div className="rail-title" title={slot.title}>
                                    {slot.title}
                                </div>
                                <div className="rail-sub">
                                    {String(slot.calls)} 轮 · {format_tokens(slot.tokens)} tokens
                                </div>
                            </div>
                            <button
                                type="button"
                                className="rail-close"
                                aria-label="关闭会话"
                                onClick={() => {
                                    on_close(index);
                                }}
                            >
                                ×
                            </button>
                        </div>
                    ),
                )}
            </div>
        </div>
    );
}
