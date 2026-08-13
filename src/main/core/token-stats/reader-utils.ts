/** Shared helpers for token-stats readers. */

/**
 * token-stats 归日 (YYYY-MM-DD)。t348: 按 UTC+8 计算（服务端 SQL 固定 UTC+8
 * 聚合，token-stats-store.ts +28800000），与 schema `date` 注释「UTC+8 日期」
 * 及渲染端 bucket 边界口径一致——非 UTC+8 机器不落错日。
 */
export function calendar_date_of(ts: number): string {
    const shifted = new Date(ts + 8 * 60 * 60 * 1000);
    const pad = (x: number) => String(x).padStart(2, "0");
    return `${String(shifted.getUTCFullYear())}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** Coerce a finite positive number, defaulting to 0 for non-numbers / non-finite / <= 0. */
export function num(v: unknown): number {
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}
