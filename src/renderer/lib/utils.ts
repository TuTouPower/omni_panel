import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function relative_time(isoDate: string): string {
    const diff = Date.now() - new Date(isoDate).getTime();
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

/** Format resetAt ISO string as "今天 13:10" or "5/18 21:00". */
export function format_reset_time(isoDate: string): string {
    const d = new Date(isoDate);
    const now = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const time = `${hh}:${mm}`;
    if (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
    ) {
        return `今天 ${time}`;
    }
    return `${String(d.getMonth() + 1)}/${String(d.getDate())} ${time}`;
}
