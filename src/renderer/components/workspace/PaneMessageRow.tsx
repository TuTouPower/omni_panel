import { memo, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import type { HistoryMessageLike } from "../../../shared/types/ipc";
import { format_time_short } from "../../lib/session-history/markdown";
import { cn } from "../../lib/utils";
import { Checkbox } from "../ui/Checkbox";
import { MarkdownMessage } from "./MarkdownMessage";

export interface PaneMessageRowProps {
    readonly message: HistoryMessageLike;
    readonly selected: boolean;
    /** t427: 是否显示本行角色标签（组首 true；同 role 连续组内 false）。 */
    readonly show_role_label: boolean;
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
    show_role_label,
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
                // t427: py-1 是行内 padding，保留作块间透明间隔——user 背景在
                // 内容容器上，padding 区无背景，相邻底色块间可见统一间距。
                "group flex gap-2 py-1",
                selected && "selected",
                compact && "compact",
                expanded && "expanded",
            )}
            data-testid="conversation-message-row"
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
                className="mt-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                data-testid="conversation-message-check"
                aria-label={`选择消息 ${message.text.slice(0, 24) || "(空)"}`}
                checked={selected}
                readOnly
                onClick={(e) => {
                    on_toggle(message.id, e.shiftKey);
                }}
            />
            <div
                className={cn(
                    "min-w-0 flex-1",
                    message.role === "user" && "rounded-md bg-[var(--color-primary-container)]",
                )}
                data-testid="conversation-message-body"
                onClick={on_body_click}
            >
                <div
                    className={cn("items-center gap-2", compact ? "inline-flex" : "mb-1 flex")}
                    data-testid="conversation-message-meta"
                >
                    {show_role_label && (
                        <span className="text-[length:var(--text-label-md)] font-semibold text-[var(--color-on-surface-variant)]">
                            {message.role === "user" ? "用户" : "Agent"}
                        </span>
                    )}
                    {expanded && message.timestamp !== null && (
                        <span
                            className="font-code-md text-[length:var(--text-label-caps)] tabular-nums text-[var(--color-on-surface-muted)]"
                            data-testid="conversation-message-time"
                        >
                            {format_time_short(message.timestamp)}
                        </span>
                    )}
                </div>
                <div
                    ref={content_ref}
                    className={cn("min-w-0", !expanded && "single-line line-clamp-1")}
                    data-testid="conversation-message-content"
                >
                    <MarkdownMessage text={message.text} />
                </div>
            </div>
        </div>
    );
});
