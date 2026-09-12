import { agent_friendly, format_date } from "../../lib/session-history/markdown";
import { session_tokens } from "../../lib/session-library/filter";
import type { TokenStatsSession } from "../../../shared/types/token-stats";

export { agent_friendly, format_date, session_tokens };

export function relative_date(ts: number): string {
    const now = Date.now();
    const day_ms = 24 * 3600 * 1000;
    const days = Math.floor((now - ts) / day_ms);
    if (days < 1) return "今天";
    if (days < 7) return `${String(days)} 天前`;
    return format_date(ts);
}

export function agent_abbrev(source: string): string {
    if (source === "claude_code") return "C";
    if (source === "opencode") return "OC";
    if (source === "kimi_code") return "K";
    if (source === "grok") return "G";
    return source.slice(0, 2).toUpperCase();
}

/** 会话主键（f008：跨 source/env 同 id 须区分）。 */
export function key_of(s: { source: string; env: string; id: string }): string {
    return `${s.source}|${s.env}|${s.id}`;
}

export function format_tokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 10_000) return `${String(Math.round(n / 1000))}k`;
    return n.toLocaleString("en-US");
}

/**
 * t470 AC-003：会话 tokens 展示。antigravity 无用量源（s035），存量记 0
 * 但展示为“未知”，不把 0 当真实用量；其余来源沿用 `N tokens`。
 */
export function format_session_tokens(s: TokenStatsSession): string {
    if (s.source === "antigravity") return "未知";
    return `${format_tokens(session_tokens(s))} tokens`;
}
