/**
 * Format a token count using K/M/B abbreviations, truncating (not rounding)
 * to one decimal place to match Claude Code /stats convention.
 */
export function fmtTok(n: number): string {
    const value = Math.max(0, Number.isFinite(n) ? n : 0);
    if (value >= 1_000_000_000) return `${(Math.floor(value / 100_000_000) / 10).toFixed(1)}B`;
    if (value >= 1_000_000) return `${(Math.floor(value / 100_000) / 10).toFixed(1)}M`;
    if (value >= 1_000) return `${(Math.floor(value / 100) / 10).toFixed(1)}K`;
    return String(Math.floor(value));
}

/** Format an integer with K/M/B abbreviations (same scale as fmtTok). */
export function fmtInt(n: number): string {
    return fmtTok(n);
}

/**
 * Format a timestamp as a friendly relative time:
 * - "今天 HH:mm" for today
 * - "昨天 HH:mm" for yesterday
 * - "明天 HH:mm" for tomorrow
 * - "后天 HH:mm" for the day after tomorrow
 * - "M/D HH:mm" for other dates
 */
export function fmtTime(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

    const same_day = (a: Date, b: Date): boolean =>
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();
    if (same_day(d, now)) return `今天 ${hm}`;

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (same_day(d, yesterday)) return `昨天 ${hm}`;

    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    if (same_day(d, tomorrow)) return `明天 ${hm}`;

    const day_after = new Date(now);
    day_after.setDate(now.getDate() + 2);
    if (same_day(d, day_after)) return `后天 ${hm}`;

    return `${String(d.getMonth() + 1)}/${String(d.getDate())} ${hm}`;
}

/** Convert a timestamp to a <input type="datetime-local"> value. */
export function toLocalInput(ts: number): string {
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Format a duration in milliseconds as a Chinese relative time:
 * - < 1 min → "刚刚"
 * - < 1 h → "N 分钟前"
 * - < 24 h → "N 小时前"
 * - otherwise → "N 天前"
 */
export function fmtRelativeTime(ms: number): string {
    const value = Math.max(0, Number.isFinite(ms) ? ms : 0);
    const minutes = Math.floor(value / 60000);
    if (minutes < 1) return "刚刚";
    if (minutes < 60) return `${String(minutes)} 分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${String(hours)} 小时前`;
    const days = Math.floor(hours / 24);
    return `${String(days)} 天前`;
}

/** Shorten a directory path to its basename, with a fallback for null. */
export function shortDir(d: string | null): string {
    if (!d) return "(unknown)";
    const base =
        d
            .replace(/[/\\]+$/, "")
            .split(/[/\\]/)
            .pop() ?? "";
    return base.length > 16 ? `${base.slice(0, 15)}…` : base;
}
