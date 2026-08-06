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
