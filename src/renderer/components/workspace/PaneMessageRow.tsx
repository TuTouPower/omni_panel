import { memo, useLayoutEffect, useRef, useState } from "react";
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

/** t257：内容元素是否超出一行（scrollHeight > clientHeight）。抽为函数便于测试注入。 */
export function content_overflows(
    el: HTMLElement | null,
    scroll_height: number,
    client_height: number,
): boolean {
    if (scroll_height <= 0 || client_height <= 0) {
        // jsdom 等无真实布局环境：退回文本启发式（含换行视为多行）。
        return el?.textContent.includes("\n") ?? false;
    }
    return scroll_height > client_height;
}

/** t237 单条消息行：memo 化，仅当 message / selected / 视图回调相关 props 变化时重渲染。
 *  t257：默认单行折叠，超行消息显示展开按钮，点击展开/恢复折叠（AC9-AC11）。 */
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
    const [expanded, set_expanded] = useState(false);
    const [overflows, set_overflows] = useState(false);
    const content_ref = useRef<HTMLDivElement | null>(null);

    // 测量内容是否超一行（仅在折叠态语义下测一次，随消息变化重测）。
    // 不依赖 expanded：展开后 scrollHeight===clientHeight 会误判不超行，
    // 导致展开按钮消失、无法恢复折叠（t257 f008）。
    useLayoutEffect(() => {
        const el = content_ref.current;
        if (!el) return;
        set_overflows(content_overflows(el, el.scrollHeight, el.clientHeight));
    }, [message.id, message.text]);

    return (
        <div
            className={
                "pane-msg-row" +
                (selected ? " selected" : "") +
                (compact ? " compact" : "") +
                (expanded ? " expanded" : "")
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
                <div
                    ref={content_ref}
                    className={"pane-msg-content" + (expanded ? "" : " single-line")}
                >
                    <MarkdownMessage text={message.text} />
                </div>
                {overflows && (
                    <button
                        type="button"
                        className="pane-msg-expand"
                        aria-label={expanded ? "折叠消息" : "展开消息"}
                        onClick={() => {
                            set_expanded((v) => !v);
                        }}
                    >
                        {expanded ? "收起" : "展开"}
                    </button>
                )}
            </div>
        </div>
    );
});
