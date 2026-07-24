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
    n: number;
    idx: (ts: number) => number;
    startOf: (i: number) => number;
    label: (i: number) => string;
} {
    const next_boundary = (timestamp: number) => {
        const date = new Date(timestamp);
        if (gran === "hour") {
            date.setMinutes(0, 0, 0);
            date.setHours(date.getHours() + 1);
        } else {
            date.setHours(0, 0, 0, 0);
            date.setDate(date.getDate() + 1);
        }
        return date.getTime();
    };
    const starts = [start];
    let boundary = next_boundary(start);
    while (boundary < end) {
        starts.push(boundary);
        boundary = next_boundary(boundary);
    }
    const n = starts.length;
    const idx = (ts: number) => {
        if (ts <= start) return 0;
        if (ts >= end) return n - 1;

        let low = 0;
        let high = n;
        while (low < high) {
            const mid = Math.floor((low + high) / 2);
            const mid_start = starts[mid];
            if (mid_start !== undefined && mid_start <= ts) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }
        return Math.max(0, low - 1);
    };
    const startOf = (i: number) => starts[i] ?? start;
    const label = (i: number) => {
        const date = new Date(startOf(i));
        const pad = (value: number) => String(value).padStart(2, "0");
        return gran === "hour"
            ? `${String(date.getMonth() + 1)}/${String(date.getDate())} ${pad(date.getHours())}:00`
            : `${String(date.getMonth() + 1)}/${String(date.getDate())}`;
    };
    return { n, idx, startOf, label };
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
