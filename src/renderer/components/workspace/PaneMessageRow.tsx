import { memo } from "react";
import type { HistoryMessageLike } from "../../../shared/types/ipc";
import { format_time_short } from "../../lib/session-history/markdown";
import { MarkdownMessage } from "./MarkdownMessage";

export interface PaneMessageRowProps {
    readonly message: HistoryMessageLike;
    readonly selected: boolean;
    readonly show_time: boolean;
    readonly compact: boolean;
    readonly on_toggle: (id: string, shift: boolean) => void;
    readonly on_hover: (id: string | null) => void;
    /** 测试用渲染计数回调。 */
    readonly onRender?: () => void;
}

/** t237 单条消息行：memo 化，仅当 message / selected / 视图回调相关 props 变化时重渲染。 */
export const PaneMessageRow = memo(function PaneMessageRow({
    message,
    selected,
    show_time,
    compact,
    on_toggle,
    on_hover,
    onRender,
}: PaneMessageRowProps) {
    onRender?.();
    return (
        <div
            className={
                "pane-msg-row" + (selected ? " selected" : "") + (compact ? " compact" : "")
            }
            data-message-id={message.id}
            onMouseEnter={() => {
                on_hover(message.id);
            }}
            onMouseLeave={() => {
                on_hover(null);
            }}
        >
            <input
                type="checkbox"
                className="pane-msg-check"
                aria-label={`选择消息 ${message.text.slice(0, 24) || "(空)"}`}
                checked={selected}
                readOnly
                onClick={(e) => {
                    on_toggle(message.id, e.shiftKey);
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
});
