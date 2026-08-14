/**
 * token-stats UTC+8 时区 helper（t348）。服务端 SQL 固定 UTC+8 聚合
 * （token-stats-store.ts +28800000），渲染端 bucket 边界/小时标签/热力图
 * 一律按 UTC+8 计算，避免非 UTC+8 机器错桶、小时轴错标。
 * 约定：`date` 字段为 UTC+8 日期字符串（YYYY-MM-DD），timestamp 为 epoch ms。
 */

export const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;

/** UTC+8 毫秒对齐的日期边界（当天 00:00 UTC+8）。 */
export function utc8_day_start(ts: number): number {
    // 对齐到 UTC 日界后加 8h：把 ts 转 UTC+8 日期零点的 epoch。
    return Math.floor((ts + UTC8_OFFSET_MS) / 86_400_000) * 86_400_000 - UTC8_OFFSET_MS;
}

/** UTC+8 对齐的小时边界（整点 UTC+8）。 */
export function utc8_hour_start(ts: number): number {
    return Math.floor((ts + UTC8_OFFSET_MS) / 3_600_000) * 3_600_000 - UTC8_OFFSET_MS;
}

/** UTC+8 下一天边界。 */
export function utc8_next_day(ts: number): number {
    return utc8_day_start(ts) + 86_400_000;
}

/** UTC+8 下一小时边界。 */
export function utc8_next_hour(ts: number): number {
    return utc8_hour_start(ts) + 3_600_000;
}

/** UTC+8 时区下 epoch ms 的日期（YYYY-MM-DD）。 */
export function utc8_date_str(ts: number): string {
    const shifted = new Date(ts + UTC8_OFFSET_MS);
    const pad = (v: number) => String(v).padStart(2, "0");
    return `${String(shifted.getUTCFullYear())}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** UTC+8 时区下 epoch ms 的小时（0-23）。 */
export function utc8_hour(ts: number): number {
    return new Date(ts + UTC8_OFFSET_MS).getUTCHours();
}

/** UTC+8 时区下 epoch ms 的星期（0=周日，与 getDay 同约定）。 */
export function utc8_weekday(ts: number): number {
    return new Date(ts + UTC8_OFFSET_MS).getUTCDay();
}
