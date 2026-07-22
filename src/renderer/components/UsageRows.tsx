import { memo } from "react";
import type { CSSProperties, ReactNode } from "react";

import type { UsageBarColorScheme, UsageBarStyle } from "../../shared/types/config";
import type { MetricRecord } from "../../shared/schemas/plugin-output";
import type { ProviderUsageAccount, ProviderUsagePeriod } from "../lib/provider-usage";
import { format_usage_period_label } from "../lib/provider-usage";
import { format_reset_time, relative_time } from "../lib/utils";
import { bar_fill_color, DEFAULT_USAGE_BAR_COLOR_SCHEME } from "../lib/usage-colors";
import { Icon } from "./Icon";

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
    /** t043: 该 (provider, accountKey, raw_label) 是否监控即将重置。 */
    watched?: boolean | undefined;
    /** t043: 切换该 period 的即将重置监控。 */
    on_toggle_watched?: (() => void) | undefined;
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

export const UsageBarRow = memo(function UsageBarRow({
    period,
    index,
    colorScheme = DEFAULT_USAGE_BAR_COLOR_SCHEME,
    barStyle = "thin",
    labelMap,
    forcePercent = false,
    watched = false,
    on_toggle_watched,
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
            {on_toggle_watched && (
                <button
                    className="sp-ic bar-watch"
                    title="监控该数据标签的即将重置"
                    aria-label="监控该数据标签的即将重置"
                    aria-pressed={watched}
                    onClick={on_toggle_watched}
                >
                    <Icon name="bell" size={15} style={{ opacity: watched ? 1 : 0.35 }} />
                </button>
            )}
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
    /** t046: 当前 account 下已监控的 raw_label 集合。 */
    watched_labels?: ReadonlySet<string> | undefined;
    /** t046: 切换某 raw_label 的即将重置监控。 */
    on_toggle_watched?: ((raw_label: string) => void) | undefined;
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
    watched_labels,
    on_toggle_watched,
}: AccountUsageRowProps) {
    const display_label = desensitizeRemarks ? "" : account.accountLabel;
    return (
        <div className="acct-item">
            <div className="ai-head">
                {beforeName}
                <span className="ai-dot" />
                {display_label ? <span className="ai-name">{display_label}</span> : null}
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
                        forcePercent={forcePercent}
                        labelMap={labelMap}
                        watched={watched_labels?.has(period.raw_label) ?? false}
                        on_toggle_watched={
                            on_toggle_watched
                                ? () => {
                                      on_toggle_watched(period.raw_label);
                                  }
                                : undefined
                        }
                    />
                ))}
            </div>
        </div>
    );
}

export type UsageBarDisplayStyle = MetricRecord["displayStyle"];
