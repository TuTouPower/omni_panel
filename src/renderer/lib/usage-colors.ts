export type UsageBarColorScheme = "risk-current" | "risk-projected" | "nine-cycle";

export const DEFAULT_USAGE_BAR_COLOR_SCHEME: UsageBarColorScheme = "risk-current";

const USAGE_COLORS = [
    "#5B8CFF", // 1 主蓝
    "#8B72F8", // 2 主紫
    "#46C7C7", // 3 主青
    "#7EA2FF", // 4 扩展蓝
    "#A18CFF", // 5 扩展紫
    "#72D4D1", // 6 扩展青
    "#9CB8FF", // 7 浅蓝灰
    "#B6A7FF", // 8 浅紫灰
    "#A7D8D8", // 9 淡青灰
];

export function usage_color(idx: number): string {
    const n = USAGE_COLORS.length;
    return USAGE_COLORS[((idx % n) + n) % n] ?? "#5B8CFF";
}

function risk_current_level(pct: number): "green" | "yellow" | "orange" | "red" {
    if (pct >= 95) return "red";
    if (pct > 85) return "orange";
    if (pct > 60) return "yellow";
    return "green";
}

function risk_projected_level(
    pct: number,
    elapsed?: number,
): "green" | "yellow" | "orange" | "red" {
    if (!(elapsed !== undefined && elapsed > 0)) return risk_current_level(pct);
    const projected = pct / 100 / elapsed;
    if (pct >= 95 || projected >= 1) return "red";
    if (pct > 85 || projected >= 0.9) return "orange";
    if (pct > 60 || projected >= 0.75) return "yellow";
    return "green";
}

export function usage_window_elapsed(
    period_name: string,
    reset_at: string | null | undefined,
    now_ms = Date.now(),
): number | undefined {
    if (!reset_at) return undefined;
    const reset_ms = Date.parse(reset_at);
    if (!Number.isFinite(reset_ms)) return undefined;
    const name = period_name.toLowerCase();
    const hour = 60 * 60 * 1000;
    const day = 24 * hour;
    const duration =
        name.includes("5小时") || name.includes("5 小时") || name.includes("5h")
            ? 5 * hour
            : name.includes("一周") ||
                name.includes("每周") ||
                name.includes("周") ||
                name.includes("week")
              ? 7 * day
              : name.includes("月") || name.includes("month")
                ? 30 * day
                : name.includes("天") || name.includes("每日") || name.includes("day")
                  ? day
                  : undefined;
    if (duration === undefined) return undefined;
    const remaining = reset_ms - now_ms;
    return Math.min(1, Math.max(0, 1 - remaining / duration));
}

export function bar_fill_color(
    scheme: UsageBarColorScheme | undefined,
    { pct, idx, elapsed }: { pct: number; idx: number; elapsed?: number | undefined },
): string {
    if (scheme === "nine-cycle") return usage_color(idx);
    if (scheme === "risk-projected") return `var(--risk-${risk_projected_level(pct, elapsed)})`;
    return `var(--risk-${risk_current_level(pct)})`;
}
