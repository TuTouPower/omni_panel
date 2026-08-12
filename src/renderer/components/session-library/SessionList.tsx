import { useCallback, useEffect, useRef } from "react";
import type { UIEvent } from "react";
import type { TokenStatsSession } from "../../../shared/types/token-stats";
import { SessionCard } from "./SessionCard";
import { SessionRow } from "./SessionRow";
import { key_of } from "./session-library-utils";

/** 触底阈值：距滚动容器底部 ≤ 该值时触发加载下一页（t328 无限滚动）。 */
const SCROLL_END_THRESHOLD = 120;

interface SessionListProps {
    readonly view_mode: "grid" | "list";
    readonly sessions: readonly TokenStatsSession[];
    readonly summaries: Readonly<Record<string, string>>;
    readonly selected_ids: ReadonlySet<string>;
    readonly on_toggle: (s: TokenStatsSession) => void;
    readonly on_preview: (s: TokenStatsSession) => void;
    readonly on_open: (s: TokenStatsSession) => void;
    /** 复制续接命令成功后提示（t326 透传给 SessionCard）。 */
    readonly on_show_toast?: (message: string) => void;
    /** 滚动容器触底回调（t328 无限滚动）：滚到底部附近时通知父组件加载下一页。 */
    readonly on_scroll_to_bottom: () => void;
}

export function SessionList({
    view_mode,
    sessions,
    summaries,
    selected_ids,
    on_toggle,
    on_preview,
    on_open,
    on_show_toast,
    on_scroll_to_bottom,
}: SessionListProps) {
    const handleToggle = useCallback(
        (s: TokenStatsSession) => {
            on_toggle(s);
        },
        [on_toggle],
    );
    const handlePreview = useCallback(
        (s: TokenStatsSession) => {
            on_preview(s);
        },
        [on_preview],
    );
    const handleOpen = useCallback(
        (s: TokenStatsSession) => {
            on_open(s);
        },
        [on_open],
    );
    const handle_scroll = (e: UIEvent<HTMLDivElement>): void => {
        const el = e.currentTarget;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_END_THRESHOLD) {
            on_scroll_to_bottom();
        }
    };

    // f001: 首屏内容不溢出（无滚动条）时无 scroll 事件，挂载后主动加载一次填满。
    // 溢出场景靠用户滚动触发（onScroll），此处不预取。
    // clientHeight > 0 前置：jsdom 无布局（0）时跳过，避免单测挂载误触发。
    const grid_ref = useRef<HTMLDivElement | null>(null);
    const list_ref = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        const el = view_mode === "grid" ? grid_ref.current : list_ref.current;
        if (el && el.clientHeight > 0 && el.scrollHeight <= el.clientHeight) {
            on_scroll_to_bottom();
        }
        // 仅挂载时检查；on_scroll_to_bottom 由父 load_more 守卫（has_more/inflight）。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (view_mode === "grid") {
        return (
            <div
                ref={grid_ref}
                className="library-grid grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(280px,1fr))] content-start items-start auto-rows-max gap-3 overflow-y-auto px-[18px] py-3.5"
                onScroll={handle_scroll}
            >
                {sessions.map((s) => (
                    <SessionCard
                        key={`${s.source}|${s.env}|${s.id}`}
                        s={s}
                        selected={selected_ids.has(key_of(s))}
                        on_toggle={handleToggle}
                        on_preview={handlePreview}
                        on_open={handleOpen}
                        show_toast={on_show_toast}
                    />
                ))}
            </div>
        );
    }
    return (
        <div
            ref={list_ref}
            className="library-list flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-[18px] pb-3.5 pt-2"
            onScroll={handle_scroll}
        >
            {sessions.map((s) => (
                <SessionRow
                    key={`${s.source}|${s.env}|${s.id}`}
                    s={s}
                    summary={summaries[key_of(s)] ?? ""}
                    selected={selected_ids.has(key_of(s))}
                    on_toggle={handleToggle}
                    on_preview={handlePreview}
                    on_open={handleOpen}
                />
            ))}
        </div>
    );
}
