import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function relativeTime(isoDate: string): string {
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
