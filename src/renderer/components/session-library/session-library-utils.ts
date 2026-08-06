import { agent_friendly, format_date } from "../../lib/session-history/markdown";
import { session_tokens } from "../../lib/session-library/filter";

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
