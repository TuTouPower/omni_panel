import type { AgentSessionUsage, Granularity, Metric, SessionRow } from "./types";

/** Sum all token kinds for a single record. */
export function sumTokens(r: AgentSessionUsage): number {
    return r.input_tokens + r.output_tokens + r.cache_read_tokens + r.cache_write_tokens;
}

/** Aggregate value for the selected metric. */
export function metricValue(records: AgentSessionUsage[], metric: Metric): number {
    if (metric === "tokens") {
        return records.reduce((sum, r) => sum + sumTokens(r), 0);
    }
    if (metric === "sessions") {
        return new Set(records.map((r) => r.session_id)).size;
    }
    return records.length;
}

/** Group an array by a string key function. */
export function groupBy<T>(arr: T[], fn: (x: T) => string): Record<string, T[]> {
    const result: Record<string, T[]> = {};
    for (const item of arr) {
        const key = fn(item);
        (result[key] ??= []).push(item);
    }
    return result;
}

/**
 * Split a totals map into the top N keys and the rest.
 * Zero-value keys are excluded.
 */
export function topGroups(
    totals: Record<string, number>,
    n: number,
): { top: string[]; rest: string[] } {
    const sorted = Object.entries(totals)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1]);
    return {
        top: sorted.slice(0, n).map(([k]) => k),
        rest: sorted.slice(n).map(([k]) => k),
    };
}

/** Cache hit rate: cache_read / (cache_read + input). */
export function hitRateOf(records: AgentSessionUsage[]): number {
    const cr = records.reduce((sum, r) => sum + r.cache_read_tokens, 0);
    const inp = records.reduce((sum, r) => sum + r.input_tokens + r.cache_read_tokens, 0);
    return inp ? cr / inp : 0;
}

/** Time bucketizer for bar charts. */
export function bucketize(
    start: number,
    end: number,
    gran: Granularity,
): {
    step: number;
    n: number;
    idx: (ts: number) => number;
    label: (i: number) => string;
} {
    const step = gran === "hour" ? 3600000 : 86400000;
    const n = Math.max(1, Math.ceil((end - start) / step));
    const idx = (ts: number) => Math.min(n - 1, Math.max(0, Math.floor((ts - start) / step)));
    const label = (i: number) => {
        const d = new Date(start + i * step);
        const pad = (x: number) => String(x).padStart(2, "0");
        return gran === "hour"
            ? `${String(d.getMonth() + 1)}/${String(d.getDate())} ${pad(d.getHours())}:00`
            : `${String(d.getMonth() + 1)}/${String(d.getDate())}`;
    };
    return { step, n, idx, label };
}

/** Aggregate records into session rows for the detail table. */
export function sessionRows(records: AgentSessionUsage[]): SessionRow[] {
    const bySession = groupBy(records, (r) => r.session_id);
    return Object.entries(bySession).map(([session_id, rs]) => {
        const meta = rs[0] ?? {
            title: null,
            slug: null,
            directory: null,
            agent: "claude-code",
            version: null,
            parent_session_id: null,
        };
        const tokens = rs.reduce((sum, r) => sum + sumTokens(r), 0);
        const cacheRead = rs.reduce((sum, r) => sum + r.cache_read_tokens, 0);
        const inputWithCache = rs.reduce((sum, r) => sum + r.input_tokens + r.cache_read_tokens, 0);
        return {
            session_id,
            title: meta.title ?? "(无标题)",
            slug: meta.slug,
            directory: meta.directory ?? "—",
            agent: meta.agent,
            version: meta.version,
            sub: meta.parent_session_id !== null,
            models: [...new Set(rs.map((r) => r.model))],
            calls: rs.length,
            tokens,
            cacheRate: inputWithCache ? cacheRead / inputWithCache : 0,
            lastTs: Math.max(...rs.map((r) => r.timestamp)),
        };
    });
}

/** Select records that fall in the previous equal-length window. */
export function prevRangeRecords(
    records: AgentSessionUsage[],
    current: { start: number; end: number },
): AgentSessionUsage[] {
    const duration = current.end - current.start;
    const prevStart = current.start - duration;
    const prevEnd = current.start;
    return records.filter((r) => r.timestamp >= prevStart && r.timestamp < prevEnd);
}
