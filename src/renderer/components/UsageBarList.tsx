import type { UsageBarColorScheme, UsageBarStyle } from "../../shared/types/config";
import type { ProviderUsagePeriod } from "../lib/provider-usage";
import { DEFAULT_USAGE_BAR_COLOR_SCHEME } from "../lib/usage-colors";
import { UsageBarRow } from "./UsageRows";

type BarPeriod = Pick<
    ProviderUsagePeriod,
    "id" | "name" | "raw_label" | "used" | "limit" | "displayStyle" | "resetAt" | "cycleDurationMs"
>;

interface UsageBarListProps {
    periods: readonly BarPeriod[];
    className?: string | undefined;
    colorScheme?: UsageBarColorScheme | undefined;
    barStyle?: UsageBarStyle | undefined;
    labelMap?: Readonly<Record<string, string>> | undefined;
    forcePercent?: boolean | undefined;
    /** t043: 当前 account 下已监控的 raw_label 集合。 */
    watched_labels?: ReadonlySet<string> | undefined;
    /** t043: 切换某个 raw_label 的即将重置监控。 */
    on_toggle_watched?: ((raw_label: string) => void) | undefined;
}

export function UsageBarList({
    periods,
    className = "bars",
    colorScheme = DEFAULT_USAGE_BAR_COLOR_SCHEME,
    barStyle = "thin",
    labelMap,
    forcePercent = false,
    watched_labels,
    on_toggle_watched,
}: UsageBarListProps) {
    return (
        <div className={className}>
            {periods.map((period, idx) => (
                <UsageBarRow
                    key={period.id}
                    period={period}
                    index={idx}
                    colorScheme={colorScheme}
                    barStyle={barStyle}
                    labelMap={labelMap}
                    forcePercent={forcePercent}
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
    );
}
