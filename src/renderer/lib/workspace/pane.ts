import type { HistoryMessageLike, SessionHistoryLoc } from "../../../shared/types/ipc";

/** t225 pane 纯函数：时间分隔线、大纲摘要、消息计数。 */

/** pane 会话数据（t224 前 HistoryColumnData 迁此）。 */
export interface PaneData {
    readonly loc: SessionHistoryLoc;
    readonly title: string;
    readonly openedAt: number;
    readonly messages: readonly HistoryMessageLike[];
    readonly next_cursor: unknown;
    readonly loading_older: boolean;
    readonly status: "loading" | "ready" | "missing";
}

export const TIME_DIVIDER_MS = 10 * 60 * 1000;

/** 相邻消息时间跨度超 10 分钟插入时间分隔线；任一时间缺失或倒序不插。 */
export function should_insert_divider(prev_ts: number | null, cur_ts: number | null): boolean {
    if (prev_ts === null || cur_ts === null) return false;
    return cur_ts - prev_ts > TIME_DIVIDER_MS;
}

/** 大纲摘要：压缩空白 + 截断到 max（含省略号）；空文本返回占位。 */
export function summarize(text: string, max = 48): string {
    const flat = text.replace(/\s+/g, " ").trim();
    if (flat.length === 0) return "(空)";
    if (flat.length <= max) return flat;
    return `${flat.slice(0, Math.max(0, max - 1))}…`;
}

export function message_counts(messages: readonly HistoryMessageLike[]): {
    user: number;
    assistant: number;
} {
    let user = 0;
    let assistant = 0;
    for (const m of messages) {
        if (m.role === "user") {
            user += 1;
        } else {
            assistant += 1;
        }
    }
    return { user, assistant };
}

/** 距底小于阈值视为「在底部」（回到底部按钮显示判定）。 */
export function is_near_bottom(
    scroll_top: number,
    scroll_height: number,
    client_height: number,
    threshold = 120,
): boolean {
    return scroll_height - client_height - scroll_top <= threshold;
}

/** t237 虚拟列表：根据已测量高度与估计高度计算每条消息的顶部偏移。
 *  返回数组长度 = messages.length + 1，末尾元素为总高度。 */
export function compute_message_offsets(
    messages: readonly { readonly id: string }[],
    heights: ReadonlyMap<string, number>,
    estimate_height: number,
): number[] {
    const offsets = new Array<number>(messages.length + 1);
    offsets[0] = 0;
    for (let i = 0; i < messages.length; i += 1) {
        const m = messages[i];
        if (!m) continue;
        const h = heights.get(m.id) ?? estimate_height;
        const prev = offsets[i] ?? 0;
        offsets[i + 1] = prev + h;
    }
    return offsets;
}

export interface VisibleWindow {
    readonly start: number;
    readonly end: number;
    readonly top_spacer: number;
    readonly bottom_spacer: number;
    readonly offsets: readonly number[];
    readonly total_height: number;
}

/** t237 虚拟列表：计算当前可视窗口 + 上下缓冲区的索引与 spacer 高度。
 *  clientHeight <= 0 时（jsdom 等无真实布局环境）返回完整范围，便于测试断言。 */
export function compute_visible_window(
    messages: readonly { readonly id: string }[],
    scroll_top: number,
    client_height: number,
    heights: ReadonlyMap<string, number>,
    estimate_height: number,
    overscan: number,
): VisibleWindow {
    const offsets = compute_message_offsets(messages, heights, estimate_height);
    const total_height = offsets[messages.length] ?? 0;
    if (client_height <= 0 || messages.length === 0) {
        return {
            start: 0,
            end: messages.length,
            top_spacer: 0,
            bottom_spacer: 0,
            offsets,
            total_height,
        };
    }
    const viewport_start = scroll_top - overscan;
    const viewport_end = scroll_top + client_height + overscan;

    let start = 0;
    while (start < messages.length && (offsets[start + 1] ?? 0) < viewport_start) {
        start += 1;
    }
    let end = start;
    while (end < messages.length && (offsets[end] ?? 0) < viewport_end) {
        end += 1;
    }
    return {
        start,
        end,
        top_spacer: offsets[start] ?? 0,
        bottom_spacer: total_height - (offsets[end] ?? 0),
        offsets,
        total_height,
    };
}
