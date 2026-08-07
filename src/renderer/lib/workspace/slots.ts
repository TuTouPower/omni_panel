import type { SessionHistoryLoc } from "../../../shared/types/ipc";
import type { TokenStatsSession } from "../../../shared/types/token-stats";
import { agent_friendly } from "../session-history/markdown";

/** t224 工作台槽位模型：固定 8 槽，槽位顺序即网格顺序。 */

export const MAX_SLOTS = 8;

export const LAYOUT_OPTIONS = [1, 2, 3, 4, 6, 8] as const;
export type LayoutCount = (typeof LAYOUT_OPTIONS)[number];

/** 槽位可接受的最小列宽（含 gap 的粗略估计）。宽度不足时 effective_columns 降档。 */
export const MIN_COLUMN_WIDTH = 375;

export interface SlotSession {
    readonly loc: SessionHistoryLoc;
    readonly title: string;
    readonly agent: string;
    readonly model: string;
    readonly cwd: string | null;
    readonly calls: number;
    readonly tokens: number;
    readonly opened_at: number;
}

/** 固定 8 个槽位的不可变状态；index 即槽位号。 */
export type SlotsState = readonly (SlotSession | null)[];

export function empty_slots(): SlotsState {
    return Array.from({ length: MAX_SLOTS }, () => null);
}

export function occupied_count(slots: SlotsState): number {
    return slots.reduce((acc, s) => (s === null ? acc : acc + 1), 0);
}

export function slot_at(slots: SlotsState, index: number): SlotSession | null {
    return slots[index] ?? null;
}

/** 目标槽为空才接受（已占用→拒绝，不覆盖）。 */
export function try_assign_slot(
    slots: SlotsState,
    index: number,
    session: SlotSession,
): { next: SlotsState; accepted: boolean } {
    if (index < 0 || index >= MAX_SLOTS || slots[index] !== null) {
        return { next: slots, accepted: false };
    }
    const next = slots.map((s, i) => (i === index ? session : s));
    return { next, accepted: true };
}

/** 装入第一个空槽；无空槽（超位）拒绝。 */
export function try_add_slot(
    slots: SlotsState,
    session: SlotSession,
): { next: SlotsState; accepted: boolean; index: number | null } {
    const empty_index = slots.findIndex((s) => s === null);
    if (empty_index === -1) {
        return { next: slots, accepted: false, index: null };
    }
    const r = try_assign_slot(slots, empty_index, session);
    return { next: r.next, accepted: r.accepted, index: r.accepted ? empty_index : null };
}

export function remove_slot(slots: SlotsState, index: number): SlotsState {
    if (index < 0 || index >= MAX_SLOTS) return slots;
    return slots.map((s, i) => (i === index ? null : s));
}

/** 交换两个槽位内容（拖拽换位：顺序同步到网格）。 */
export function move_slot(slots: SlotsState, from: number, to: number): SlotsState {
    if (from === to || from < 0 || from >= MAX_SLOTS || to < 0 || to >= MAX_SLOTS) {
        return slots;
    }
    const next = [...slots];
    const tmp = next[from] ?? null;
    next[from] = next[to] ?? null;
    next[to] = tmp;
    return next;
}

export function clear_slots(): SlotsState {
    return empty_slots();
}

export function find_slot_by_loc(slots: SlotsState, loc: SessionHistoryLoc): number | null {
    const idx = slots.findIndex(
        (s) =>
            s !== null &&
            s.loc.source === loc.source &&
            s.loc.env === loc.env &&
            s.loc.session_id === loc.session_id,
    );
    return idx === -1 ? null : idx;
}

/** 从 TokenStatsSession 派生槽位元数据：标题 fallback session_id、tokens 四维和、agent 友好名。 */
export function session_meta(sess: TokenStatsSession, opened_at: number): SlotSession {
    return {
        loc: { source: sess.source, env: sess.env, session_id: sess.id },
        title: sess.title ?? sess.id,
        agent: agent_friendly(sess.source),
        model: sess.model,
        cwd: sess.directory,
        calls: sess.calls,
        tokens:
            sess.input_tokens +
            sess.output_tokens +
            sess.cache_read_tokens +
            sess.cache_write_tokens,
        opened_at,
    };
}

/** 网格列数：受布局档位上限约束，容器宽度不足时降档到能容纳的列数。 */
export function effective_columns(layout: LayoutCount, container_width: number): number {
    const by_width = Math.max(1, Math.floor(container_width / MIN_COLUMN_WIDTH));
    return Math.min(layout, by_width);
}

/** rail 内的 token 缩写（1.2M / 34k / 823）。 */
export function format_tokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 10_000) return `${String(Math.round(n / 1000))}k`;
    return String(n);
}

/** source → rail agent 色左条的 CSS 变量名。agent_id 归一到 demo 变量名
 *  （claude_code→claude、kimi_code→kimi），与 markdown.agent_slug 展示口径一致。 */
export function vendor_id_for_source(source: string): string {
    if (source === "claude_code") return "claude";
    if (source === "kimi_code") return "kimi";
    if (source === "grok") return "grok";
    if (source === "opencode") return "opencode_go";
    return "overview";
}

const AGENT_COLOR_VAR: Record<string, string> = {
    claude_code: "--agent-claude",
    opencode: "--agent-opencode",
    kimi_code: "--agent-kimi",
    grok: "--agent-grok",
};

export function agent_accent(source: string): string {
    return `var(${AGENT_COLOR_VAR[source] ?? "--agent-opencode"}, var(--accent-lime))`;
}
