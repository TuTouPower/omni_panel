import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function relative_time(timestamp: string | number): string {
    if (!timestamp) return "";
    const ts = typeof timestamp === "number" ? timestamp : new Date(timestamp).getTime();
    if (!Number.isFinite(ts)) return "";
    const diff = Date.now() - ts;
    if (diff < 0) return "刚刚";
    const seconds = Math.floor(diff / 1000);
    if (seconds < 10) return "刚刚";
    if (seconds < 60) return `${String(seconds)} 秒前`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${String(minutes)} 分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${String(hours)} 小时前`;
    const days = Math.floor(hours / 24);
    return `${String(days)} 天前`;
}

/** Format resetAt epoch-ms or ISO string as "今天 13:10" / "明天 13:10" / "后天 13:10" or "5/18 21:00". */
export function format_reset_time(timestamp: string | number): string {
    const d = typeof timestamp === "number" ? new Date(timestamp) : new Date(timestamp);
    const now = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const time = `${hh}:${mm}`;
    const same_day = (a: Date, b: Date): boolean =>
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();
    if (same_day(d, now)) {
        return `今天 ${time}`;
    }
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    if (same_day(d, tomorrow)) {
        return `明天 ${time}`;
    }
    const day_after = new Date(now);
    day_after.setDate(now.getDate() + 2);
    if (same_day(d, day_after)) {
        return `后天 ${time}`;
    }
    return `${String(d.getMonth() + 1)}/${String(d.getDate())} ${time}`;
}
