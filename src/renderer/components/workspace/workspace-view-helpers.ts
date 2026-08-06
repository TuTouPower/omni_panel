import type { HistoryMessageLike, SessionHistoryLoc } from "../../../shared/types/ipc";

export type Loc = SessionHistoryLoc;

export const FALLBACK_MS = 30000;

export function loc_key(loc: Loc): string {
    return `${loc.source}|${loc.env}|${loc.session_id}`;
}

export function selection_key(loc: Loc, message_id: string): string {
    return `${loc_key(loc)}|${message_id}`;
}

export function merge_tail(
    existing: readonly HistoryMessageLike[],
    incoming: readonly HistoryMessageLike[],
): readonly HistoryMessageLike[] {
    const seen = new Set(existing.map((m) => m.id));
    const fresh = incoming.filter((m) => !seen.has(m.id));
    if (fresh.length === 0) return existing;
    return [...existing, ...fresh];
}

/** 从 URL query `loc` 读初始定位参数（主进程 route_query 传入，t211 逻辑）。 */
export function initial_loc(): Loc | null {
    const raw = new URLSearchParams(window.location.search).get("loc");
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Partial<Loc>;
        if (
            typeof parsed.source === "string" &&
            typeof parsed.env === "string" &&
            typeof parsed.session_id === "string"
        ) {
            return { source: parsed.source, env: parsed.env, session_id: parsed.session_id };
        }
    } catch {
        // 忽略解析失败，空窗打开。
    }
    return null;
}
