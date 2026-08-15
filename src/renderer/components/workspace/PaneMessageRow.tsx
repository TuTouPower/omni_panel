import { memo, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import type { HistoryMessageLike } from "../../../shared/types/ipc";
import { format_time_short } from "../../lib/session-history/markdown";
import { cn } from "../../lib/utils";
import { Checkbox } from "../ui/Checkbox";
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

/** 内容元素是否超出一行。 */
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

/** 当前是否存在非空文本选区（拖选后不触发折叠切换）。 */
function has_text_selection(): boolean {
    const sel = window.getSelection();
    return Boolean(sel && !sel.isCollapsed);
}

/** 点击目标是否为应保留原生行为的交互子元素。 */
function is_interactive_target(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest("a, button, input, textarea, select, [role='checkbox']"));
}

/** 单条消息行：memo 化；默认单行折叠，点击本体切换展开。 */
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

    useLayoutEffect(() => {
        const el = content_ref.current;
        if (!el) return;
        set_overflows(content_overflows(el, el.scrollHeight, el.clientHeight));
    }, [message.id, message.text]);

    const on_body_click = (e: MouseEvent<HTMLDivElement>) => {
        if (is_interactive_target(e.target)) return;
        if (has_text_selection()) return;
        if (!overflows) return;
        set_expanded((v) => !v);
    };

    return (
        <div
            className={cn(
                "conversation-message-row group flex gap-2 py-1",
                message.role === "user" && "rounded-md bg-[var(--color-primary-container)]",
                selected && "selected",
                compact && "compact",
                expanded && "expanded",
            )}
            data-message-id={message.id}
            data-selected={selected}
            onMouseEnter={() => {
                on_hover(message.id);
            }}
            onMouseLeave={() => {
                on_hover(null);
            }}
        >
            <Checkbox
                className="conversation-message-check mt-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`选择消息 ${message.text.slice(0, 24) || "(空)"}`}
                checked={selected}
                readOnly
                onClick={(e) => {
                    on_toggle(message.id, e.shiftKey);
                }}
            />
            <div className="conversation-message-body min-w-0 flex-1" onClick={on_body_click}>
                <div
                    className={cn(
                        "conversation-message-meta items-center gap-2",
                        compact ? "inline-flex" : "mb-0.5 flex",
                    )}
                >
                    <span className="conversation-message-role text-[length:var(--text-label-md)] font-semibold text-[var(--color-on-surface-variant)]">
                        {message.role === "user" ? "用户" : "Agent"}
                    </span>
                    {show_time && message.timestamp !== null && (
                        <span className="conversation-message-time font-code-md text-[length:var(--text-label-caps)] tabular-nums text-[var(--color-on-surface-muted)]">
                            {format_time_short(message.timestamp)}
                        </span>
                    )}
                </div>
                <div
                    ref={content_ref}
                    className={cn(
                        "conversation-message-content min-w-0",
                        !expanded && "single-line line-clamp-1",
                    )}
                >
                    <MarkdownMessage text={message.text} />
                </div>
            </div>
        </div>
    );
});
