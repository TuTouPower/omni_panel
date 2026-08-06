import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { HistoryMessageLike } from "../../../shared/types/ipc";
import {
    compute_message_offsets,
    compute_visible_window,
} from "../../lib/workspace/pane";

interface VirtualMessageListProps {
    readonly messages: readonly HistoryMessageLike[];
    readonly scrollElement: HTMLDivElement | null;
    readonly estimateHeight: number;
    readonly overscan: number;
    readonly renderItem: (message: HistoryMessageLike, index: number) => React.ReactNode;
    readonly scrollToId?: string | null;
}

interface PrependCorrection {
    readonly target_id: string;
    readonly estimated_offset: number;
}

function get_resize_observer(
    on_change: (entries: ResizeObserverEntry[]) => void,
): ResizeObserver | null {
    if (typeof ResizeObserver === "undefined") return null;
    return new ResizeObserver(on_change);
}

/** t237 动态高度虚拟消息列表。
 *  容器滚动与大小监听、ResizeObserver 测量行高、prepend 滚动补偿、scrollToId 定位。 */
export function VirtualMessageList({
    messages,
    scrollElement,
    estimateHeight,
    overscan,
    renderItem,
    scrollToId,
}: VirtualMessageListProps) {
    const [heights, set_heights] = useState<Map<string, number>>(new Map());
    const [scroll_top, set_scroll_top] = useState(0);
    const [client_height, set_client_height] = useState(0);

    const prev_messages_ref = useRef<readonly HistoryMessageLike[]>([]);
    const prepend_correction_ref = useRef<PrependCorrection | null>(null);
    const last_scroll_to_id_ref = useRef<string | null>(null);

    const item_elements_ref = useRef<Map<string, HTMLDivElement>>(new Map());
    const item_ref_creators_ref = useRef<Map<string, (el: HTMLDivElement | null) => void>>(
        new Map(),
    );
    const ro_ref = useRef<ResizeObserver | null>(null);

    const visible_window = useMemo(
        () =>
            compute_visible_window(
                messages,
                scroll_top,
                client_height,
                heights,
                estimateHeight,
                overscan,
            ),
        [messages, scroll_top, client_height, heights, estimateHeight, overscan],
    );

    function get_ro(): ResizeObserver | null {
        ro_ref.current ??= get_resize_observer((entries) => {
            set_heights((prev) => {
                const next = new Map(prev);
                for (const entry of entries) {
                    const id = entry.target.getAttribute("data-virtual-id");
                    if (id) next.set(id, entry.contentRect.height);
                }
                return next;
            });
        });
        return ro_ref.current;
    }

    const get_item_ref = useCallback((id: string) => {
        let cb = item_ref_creators_ref.current.get(id);
        cb ??= (el: HTMLDivElement | null) => {
            const ro = get_ro();
            const map = item_elements_ref.current;
            const prev = map.get(id);
            if (prev === el) return;
            if (prev) {
                ro?.unobserve(prev);
                map.delete(id);
            }
            if (el) {
                map.set(id, el);
                ro?.observe(el);
            }
        };
        return cb;
    }, []);

    useEffect(() => {
        const elements = item_elements_ref.current;
        const creators = item_ref_creators_ref.current;
        return () => {
            ro_ref.current?.disconnect();
            ro_ref.current = null;
            elements.clear();
            creators.clear();
        };
    }, []);

    // 监听容器滚动与大小变化，更新 scrollTop / clientHeight。
    useLayoutEffect(() => {
        if (!scrollElement) return;
        const element = scrollElement;
        function update() {
            set_scroll_top(element.scrollTop);
            set_client_height(element.clientHeight);
        }
        update();
        element.addEventListener("scroll", update, { passive: true });
        let ro: ResizeObserver | null = null;
        if (typeof ResizeObserver !== "undefined") {
            ro = new ResizeObserver(update);
            ro.observe(element);
        }
        function on_window_resize() {
            update();
        }
        globalThis.window.addEventListener("resize", on_window_resize);
        return () => {
            element.removeEventListener("scroll", update);
            ro?.disconnect();
            globalThis.window.removeEventListener("resize", on_window_resize);
        };
    }, [scrollElement]);

    // prepend 后先按估计高度补偿 scrollTop，待测量后再校正误差。
    useLayoutEffect(() => {
        const el = scrollElement;
        const prev = prev_messages_ref.current;
        prev_messages_ref.current = messages;
        if (!el || prev.length === 0 || messages.length <= prev.length) return;
        const old_first_id = prev[0]?.id;
        const new_first_id = messages[0]?.id;
        if (!old_first_id || !new_first_id || old_first_id === new_first_id) return;

        const new_offsets = compute_message_offsets(messages, heights, estimateHeight);
        const idx = messages.findIndex((m) => m.id === old_first_id);
        if (idx < 0) return;
        const new_offset = new_offsets[idx] ?? 0;
        el.scrollTop += new_offset;
        prepend_correction_ref.current = { target_id: old_first_id, estimated_offset: new_offset };
    }, [messages, heights, estimateHeight, scrollElement]);

    useLayoutEffect(() => {
        const el = scrollElement;
        const pending = prepend_correction_ref.current;
        if (!el || !pending) return;
        const idx = messages.findIndex((m) => m.id === pending.target_id);
        if (idx < 0) {
            prepend_correction_ref.current = null;
            return;
        }
        const actual_offset = compute_message_offsets(messages, heights, estimateHeight)[idx] ?? 0;
        const delta = pending.estimated_offset - actual_offset;
        if (Math.abs(delta) > 0.5) {
            el.scrollTop -= delta;
        }
        prepend_correction_ref.current = null;
    }, [heights, messages, estimateHeight, scrollElement]);

    // 大纲/外部触发 scrollToId：滚动到目标消息顶部。
    useLayoutEffect(() => {
        const el = scrollElement;
        if (!scrollToId || scrollToId === last_scroll_to_id_ref.current || !el) return;
        last_scroll_to_id_ref.current = scrollToId;
        const idx = messages.findIndex((m) => m.id === scrollToId);
        if (idx < 0) return;
        const offsets = compute_message_offsets(messages, heights, estimateHeight);
        el.scrollTop = offsets[idx] ?? 0;
    }, [scrollToId, messages, heights, estimateHeight, scrollElement]);

    return (
        <div className="virtual-message-list">
            <div style={{ height: visible_window.top_spacer }} />
            {messages.slice(visible_window.start, visible_window.end).map((m, i) => {
                const index = visible_window.start + i;
                return (
                    <div key={m.id} data-virtual-id={m.id} ref={get_item_ref(m.id)}>
                        {renderItem(m, index)}
                    </div>
                );
            })}
            <div style={{ height: visible_window.bottom_spacer }} />
        </div>
    );
}
