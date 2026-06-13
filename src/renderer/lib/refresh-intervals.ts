export const REFRESH_INTERVAL_OPTIONS = [
    { label: "1 分钟", seconds: 60 },
    { label: "5 分钟", seconds: 300 },
    { label: "15 分钟", seconds: 900 },
    { label: "30 分钟", seconds: 1800 },
    { label: "45 分钟", seconds: 2700 },
    { label: "60 分钟", seconds: 3600 },
    { label: "2 小时", seconds: 7200 },
    { label: "3 小时", seconds: 10800 },
    { label: "4 小时", seconds: 14400 },
    { label: "6 小时", seconds: 21600 },
    { label: "9 小时", seconds: 32400 },
    { label: "24 小时", seconds: 86400 },
    { label: "仅手动", seconds: 172800 },
] as const;

export type RefreshIntervalLabel = (typeof REFRESH_INTERVAL_OPTIONS)[number]["label"];

export function refresh_seconds_to_label(seconds: number): RefreshIntervalLabel {
    for (const opt of REFRESH_INTERVAL_OPTIONS) {
        if (seconds <= opt.seconds) return opt.label;
    }
    return "仅手动";
}

export function refresh_label_to_seconds(label: string): number {
    return REFRESH_INTERVAL_OPTIONS.find((opt) => opt.label === label)?.seconds ?? 300;
}
