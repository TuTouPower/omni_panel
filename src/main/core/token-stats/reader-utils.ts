/** Shared helpers for token-stats readers. */

/**
 * Local calendar date (YYYY-MM-DD) using the system timezone, so per-day
 * bucketing matches the user's local day.
 */
export function calendar_date_of(ts: number): string {
    const d = new Date(ts);
    const pad = (x: number) => String(x).padStart(2, "0");
    return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Coerce a finite positive number, defaulting to 0 for non-numbers / non-finite / <= 0. */
export function num(v: unknown): number {
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}
