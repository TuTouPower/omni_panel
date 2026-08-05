import { useLayoutEffect, useRef } from "react";
import type { HistoryMessageLike, SessionHistoryLoc } from "../../../shared/types/ipc";
import { agent_friendly } from "../../lib/session-history/markdown";
import { HistoryMessageRow } from "./HistoryMessageRow";

export interface HistoryColumnData {
    readonly loc: SessionHistoryLoc;
    readonly title: string;
    readonly openedAt: number;
    readonly messages: readonly HistoryMessageLike[];
    readonly next_cursor: unknown;
    readonly loading_older: boolean;
    readonly status: "loading" | "ready" | "missing";
}

export interface HistoryColumnProps {
    readonly column: HistoryColumnData;
    readonly selected_count: number;
    readonly is_selected: (messageId: string) => boolean;
    readonly on_close: () => void;
    readonly on_toggle: (messageId: string) => void;
    readonly on_select_all: () => void;
    readonly on_clear_select: () => void;
    readonly on_load_older: () => void;
}

const OLDER_THRESHOLD_PX = 120;

/**
 * 会话栏（t211 决策 3）：栏头（agent + 标题 + 关闭 ×）+ 消息列表，内容区独立滚动。
 * 滚动到顶部触发向上分页；前置加载后保持滚动锚点（scrollTop 补偿）。
 */
export function HistoryColumn({
    column,
    selected_count,
    is_selected,
    on_close,
    on_toggle,
    on_select_all,
    on_clear_select,
    on_load_older,
}: HistoryColumnProps) {
    const scroll_ref = useRef<HTMLDivElement | null>(null);
    const prev_first_id_ref = useRef<string | null>(null);
    const prev_height_ref = useRef<number | null>(null);
    const first_id = column.messages[0]?.id ?? null;

    // 前置（load older）后补偿 scrollTop，保持视口不跳；追加（新消息到尾部）不补偿，
    // 保持「新增不打断当前滚动位置」。
    useLayoutEffect(() => {
        const el = scroll_ref.current;
        const prev_height = prev_height_ref.current;
        const is_prepend =
            first_id !== null &&
            prev_first_id_ref.current !== null &&
            first_id !== prev_first_id_ref.current;
        prev_first_id_ref.current = first_id;
        if (el) {
            const prev_scroll_height = prev_height;
            prev_height_ref.current = el.scrollHeight;
            if (is_prepend && prev_scroll_height !== null && el.scrollHeight > prev_scroll_height) {
                el.scrollTop += el.scrollHeight - prev_scroll_height;
            }
        }
    }, [column.messages, first_id]);

    function handle_scroll(): void {
        const el = scroll_ref.current;
        if (!el) return;
        if (el.scrollTop <= OLDER_THRESHOLD_PX && column.next_cursor && !column.loading_older) {
            on_load_older();
        }
    }

    return (
        <section
            className="history-column"
            data-loc-key={`${column.loc.source}|${column.loc.env}|${column.loc.session_id}`}
            aria-label={`会话 ${column.title}`}
        >
            <header className="history-column-head">
                <span className="history-col-agent">{agent_friendly(column.loc.source)}</span>
                <span className="history-col-title" title={column.title}>
                    {column.title}
                </span>
                <span className="history-col-select">已选 {selected_count} 条</span>
                <button type="button" className="history-col-action" onClick={on_select_all}>
                    全选本栏
                </button>
                <button type="button" className="history-col-action" onClick={on_clear_select}>
                    清除本栏
                </button>
                <button
                    type="button"
                    className="history-col-close"
                    aria-label="关闭会话栏"
                    onClick={on_close}
                >
                    ×
                </button>
            </header>
            {column.status === "missing" ? (
                <div className="history-empty">该会话的原始记录文件不存在或已删除</div>
            ) : (
                <div className="history-msgs" ref={scroll_ref} onScroll={handle_scroll}>
                    {column.status === "loading" && column.messages.length === 0 && (
                        <div className="history-loading">加载中…</div>
                    )}
                    {column.messages.map((m) => (
                        <HistoryMessageRow
                            key={m.id}
                            message={m}
                            selected={is_selected(m.id)}
                            onToggle={() => {
                                on_toggle(m.id);
                            }}
                        />
                    ))}
                    {column.loading_older && <div className="history-loading">加载更早…</div>}
                    {!column.next_cursor && column.messages.length > 0 && (
                        <div className="history-end">— 已到最早消息 —</div>
                    )}
                </div>
            )}
        </section>
    );
}
