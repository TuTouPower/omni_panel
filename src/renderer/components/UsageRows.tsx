import type { CSSProperties, ReactNode } from "react";

import type { UsageBarColorScheme, UsageBarStyle } from "../../shared/types/config";
import type { MetricRecord } from "../../shared/schemas/plugin-output";
import type { ProviderUsageAccount, ProviderUsagePeriod } from "../lib/provider-usage";
import { format_usage_period_label } from "../lib/provider-usage";
import { format_reset_time, relative_time } from "../lib/utils";
import {
    bar_fill_color,
    DEFAULT_USAGE_BAR_COLOR_SCHEME,
    usage_window_elapsed,
} from "../lib/usage-colors";

interface UsageBarRowProps {
    period: Pick<
        ProviderUsagePeriod,
        "id" | "name" | "used" | "limit" | "displayStyle" | "resetAt"
    >;
    index: number;
    colorScheme?: UsageBarColorScheme | undefined;
    barStyle?: UsageBarStyle | undefined;
    labelMap?: Readonly<Record<string, string>> | undefined;
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

function percent(used: number, limit: number): number {
    if (limit <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
}

export function UsageBarRow({
    period,
    index,
    colorScheme = DEFAULT_USAGE_BAR_COLOR_SCHEME,
    barStyle = "thin",
    labelMap,
}: UsageBarRowProps) {
    const label = format_usage_period_label(period.name, labelMap);
    const elapsed = usage_window_elapsed(period.name, period.resetAt);
    const used = period.used;
    const has_value = used !== null;
    const pct = has_value ? percent(used, period.limit) : 0;
    const fill_color = bar_fill_color(colorScheme, { pct, idx: index, elapsed });
    const track_style =
        barStyle === "capsule" ? ({ "--bar-fill": fill_color } as CSSProperties) : undefined;
    const is_ratio = has_value && period.displayStyle === "ratio" && period.limit > 0;
    const value = has_value
        ? is_ratio
            ? `${String(used)}/${String(period.limit)}`
            : `${String(pct)}%`
        : "";
    const reset_time =
        !has_value || is_ratio || !period.resetAt ? "" : format_reset_time(period.resetAt);
    const { date, clock } = split_reset_time(reset_time);

    return (
        <div
            className={`bar-row ${is_ratio ? "frac" : ""} ${barStyle === "capsule" ? "capsule" : ""}`}
        >
            <span className="bar-lbl" title={label}>
                {label}
            </span>
            <div className="track" style={track_style}>
                <div
                    className="fill"
                    style={{
                        width: `${String(pct)}%`,
                        background: fill_color,
                    }}
                />
                {barStyle === "capsule" && (
                    <>
                        <span className="bar-capsule-value bar-capsule-value-dark">{value}</span>
                        <span
                            className="bar-capsule-value bar-capsule-value-light"
                            style={{ clipPath: `inset(0 ${String(100 - pct)}% 0 0)` }}
                        >
                            {value}
                        </span>
                    </>
                )}
            </div>
            {barStyle === "thin" && <span className="bar-pct">{value}</span>}
            <span className="bar-reset">{date}</span>
            <span className="bar-clock">{clock}</span>
        </div>
    );
}

interface AccountUsageRowProps {
    account: ProviderUsageAccount;
    beforeName?: ReactNode;
    afterHeader?: ReactNode;
    barColorScheme?: UsageBarColorScheme | undefined;
    barStyle?: UsageBarStyle | undefined;
    labelMap?: Readonly<Record<string, string>> | undefined;
}

export function AccountUsageRow({
    account,
    beforeName,
    afterHeader,
    barColorScheme,
    barStyle,
    labelMap,
}: AccountUsageRowProps) {
    return (
        <div className="acct-item">
            <div className="ai-head">
                {beforeName}
                <span className="ai-dot" />
                <span className="ai-name">{account.accountLabel}</span>
                <span className="ai-time">
                    {account.updatedAt ? relative_time(account.updatedAt) : ""}
                </span>
                {afterHeader}
            </div>
            <div className="ai-bars">
                {account.periods.map((period, index) => (
                    <UsageBarRow
                        key={period.id}
                        period={period}
                        index={index}
                        colorScheme={barColorScheme}
                        barStyle={barStyle}
                        labelMap={labelMap}
                    />
                ))}
            </div>
        </div>
    );
}

export type UsageBarDisplayStyle = MetricRecord["displayStyle"];
