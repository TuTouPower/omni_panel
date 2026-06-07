export const REFRESH_INTERVAL_OPTIONS = [
    { label: "1 分钟", seconds: 60 },
    { label: "5 分钟", seconds: 300 },
    { label: "15 分钟", seconds: 900 },
    { label: "30 分钟", seconds: 1800 },
    { label: "仅手动", seconds: 86400 },
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
