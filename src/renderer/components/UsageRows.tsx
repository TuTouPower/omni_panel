import { memo } from "react";
import type { CSSProperties, ReactNode } from "react";

import type { UsageBarColorScheme, UsageBarStyle } from "../../shared/types/config";
import type { MetricRecord } from "../../shared/schemas/plugin-output";
import type { ProviderUsageAccount, ProviderUsagePeriod } from "../lib/provider-usage";
import { format_usage_period_label } from "../lib/provider-usage";
import { format_reset_time, relative_time } from "../lib/utils";
import { bar_fill_color, DEFAULT_USAGE_BAR_COLOR_SCHEME } from "../lib/usage-colors";

interface UsageBarRowProps {
    period: Pick<
        ProviderUsagePeriod,
        | "id"
        | "name"
        | "raw_label"
        | "used"
        | "limit"
        | "displayStyle"
        | "resetAt"
        | "cycleDurationMs"
    >;
    index: number;
    colorScheme?: UsageBarColorScheme | undefined;
    barStyle?: UsageBarStyle | undefined;
    labelMap?: Readonly<Record<string, string>> | undefined;
    forcePercent?: boolean | undefined;
}

export function split_reset_time(value: string): { date: string; clock: string } {
    const trimmed = value.trim();
    if (!trimmed) return { date: "", clock: "" };

    const [date = "", clock = ""] = trimmed.split(/\s+/, 2);
    const numeric_date = /^(\d{1,2})\/(\d{1,2})$/.exec(date);
    const month = numeric_date?.[1];
    const day = numeric_date?.[2];
    if (month && day) {
        return {
            date: `${month.padStart(2, "0")}.${day.padStart(2, "0")}`,
            clock,
        };
    }

    return { date, clock };
}

function percent(used: number, limit: number | null): number {
    if (limit === null || limit <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
}

const GRID_THIN = "grid grid-cols-[4ic_minmax(0,1fr)_5ch_5ch_5ch_auto] items-center gap-x-1.5";
const GRID_CAPSULE = "grid grid-cols-[4ic_minmax(0,1fr)_5ch_5ch_auto] items-center gap-x-1.5";

const META_CLS =
    "min-w-0 whitespace-nowrap text-right text-[12px] tabular-nums text-[var(--color-on-surface-muted)]";

export const UsageBarRow = memo(function UsageBarRow({
    period,
    index,
    colorScheme = DEFAULT_USAGE_BAR_COLOR_SCHEME,
    barStyle = "thin",
    labelMap,
    forcePercent = false,
}: UsageBarRowProps) {
    const label = format_usage_period_label(period.raw_label, period.name, labelMap);
    const elapsed =
        period.resetAt && period.cycleDurationMs
            ? Math.min(1, Math.max(0, 1 - (period.resetAt - Date.now()) / period.cycleDurationMs))
            : undefined;
    const used = period.used;
    const has_value = used !== null;
    const pct = has_value ? percent(used, period.limit) : 0;
    const fill_color = bar_fill_color(colorScheme, { pct, idx: index, elapsed });
    const track_style =
        barStyle === "capsule" ? ({ "--bar-fill": fill_color } as CSSProperties) : undefined;
    const is_ratio =
        !forcePercent &&
        has_value &&
        period.displayStyle === "ratio" &&
        period.limit !== null &&
        period.limit > 0;
    // t097: ratio 但无有效 limit 时，显示原始 used 数值而非 0%
    const no_limit_ratio =
        !forcePercent && has_value && period.displayStyle === "ratio" && !is_ratio;
    const value = has_value
        ? is_ratio
            ? `${String(used)}/${String(period.limit)}`
            : no_limit_ratio
              ? String(used)
              : `${String(pct)}%`
        : "";
    const reset_time =
        !has_value || is_ratio || !period.resetAt ? "" : format_reset_time(period.resetAt);
    const { date, clock } = split_reset_time(reset_time);
    const is_capsule = barStyle === "capsule";

    return (
        <div
            className={is_capsule ? GRID_CAPSULE : GRID_THIN}
            data-testid="bar-row"
            data-variant={is_capsule ? "capsule" : "thin"}
            data-ratio={is_ratio ? "true" : undefined}
        >
            <span
                className="min-w-0 truncate text-[12.5px] text-[var(--color-on-surface-variant)]"
                title={label}
                data-testid="bar-lbl"
            >
                {label}
            </span>
            <div
                className={
                    "relative overflow-hidden rounded-full " +
                    (is_capsule
                        ? "h-[22px] bg-[color-mix(in_srgb,var(--bar-fill)_16%,transparent)] isolate"
                        : "h-1.5 bg-[var(--color-surface-raised)]")
                }
                data-testid="bar-track"
                style={track_style}
            >
                <div
                    className="h-full rounded-full transition-[width] duration-[500ms] ease-[cubic-bezier(0.3,0.8,0.4,1)]"
                    data-testid="bar-fill"
                    style={{
                        width: `${String(pct)}%`,
                        background: fill_color,
                    }}
                />
                {is_capsule && (
                    <>
                        <span
                            className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center text-[11px] font-bold tabular-nums text-[var(--color-on-surface)]"
                            data-testid="bar-capsule-value-dark"
                        >
                            {value}
                        </span>
                        <span
                            className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center text-[11px] font-bold tabular-nums text-white"
                            data-testid="bar-capsule-value-light"
                            style={{ clipPath: `inset(0 ${String(100 - pct)}% 0 0)` }}
                        >
                            {value}
                        </span>
                    </>
                )}
            </div>
            {!is_capsule && (
                <span
                    className="min-w-0 whitespace-nowrap text-right text-[12.5px] font-semibold tabular-nums text-[var(--color-on-surface)]"
                    data-testid="bar-pct"
                >
                    {value}
                </span>
            )}
            <span className={META_CLS} data-testid="bar-reset">
                {date}
            </span>
            <span className={META_CLS} data-testid="bar-clock">
                {clock}
            </span>
        </div>
    );
});

interface AccountUsageRowProps {
    account: ProviderUsageAccount;
    beforeName?: ReactNode;
    afterHeader?: ReactNode;
    barColorScheme?: UsageBarColorScheme | undefined;
    barStyle?: UsageBarStyle | undefined;
    labelMap?: Readonly<Record<string, string>> | undefined;
    desensitizeRemarks?: boolean | undefined;
    forcePercent?: boolean | undefined;
}

export function AccountUsageRow({
    account,
    beforeName,
    afterHeader,
    barColorScheme,
    barStyle,
    labelMap,
    desensitizeRemarks = false,
    forcePercent = false,
}: AccountUsageRowProps) {
    const display_label = desensitizeRemarks ? "" : account.accountLabel;
    return (
        <div className="border-t-[0.5px] border-t-[var(--color-hairline)] pb-1 pt-3.5 first:border-t-0 first:pt-0">
            <div className="mb-2.5 flex items-center gap-2">
                {beforeName}
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-success)] ring-[3px] ring-[color-mix(in_srgb,var(--color-success)_16%,transparent)]" />
                {display_label ? (
                    <span className="text-[13px] font-semibold tracking-[-0.01em] text-[var(--color-on-surface)]">
                        {display_label}
                    </span>
                ) : null}
                <span
                    className="ml-auto shrink-0 text-[11.5px] text-[var(--color-on-surface-muted)]"
                    data-testid="ai-time"
                >
                    {/* t174: 同 ProviderAccountRow——相对时间取 per-账号 observedAt */}
                    {account.observedAt
                        ? relative_time(account.observedAt)
                        : account.updatedAt
                          ? relative_time(account.updatedAt)
                          : ""}
                </span>
                {afterHeader}
            </div>
            <div className={"flex flex-col " + (barStyle === "capsule" ? "gap-[7px]" : "gap-2")}>
                {account.periods.map((period, index) => (
                    <UsageBarRow
                        key={period.id}
                        period={period}
                        index={index}
                        colorScheme={barColorScheme}
                        barStyle={barStyle}
                        forcePercent={forcePercent}
                        labelMap={labelMap}
                    />
                ))}
            </div>
        </div>
    );
}

export type UsageBarDisplayStyle = MetricRecord["displayStyle"];
