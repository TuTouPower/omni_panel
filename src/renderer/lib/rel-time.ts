/**
 * Format a timestamp as a Chinese relative time string.
 *
 * Examples: "刚刚", "1 分钟前", "2 小时前", "3 天前"
 */
export function format_rel_time(iso_or_empty: string): string {
    if (!iso_or_empty) return "";

    const ts = new Date(iso_or_empty).getTime();
    if (!Number.isFinite(ts)) return "";

    const now = Date.now();
    const diff_sec = Math.max(0, Math.floor((now - ts) / 1000));

    if (diff_sec < 60) return "刚刚";

    const diff_min = Math.floor(diff_sec / 60);
    if (diff_min < 60) return `${String(diff_min)} 分钟前`;

    const diff_hr = Math.floor(diff_min / 60);
    if (diff_hr < 24) return `${String(diff_hr)} 小时前`;

    const diff_day = Math.floor(diff_hr / 24);
    return `${String(diff_day)} 天前`;
}
