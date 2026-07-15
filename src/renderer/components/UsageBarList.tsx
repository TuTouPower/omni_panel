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
}

export function UsageBarList({
    periods,
    className = "bars",
    colorScheme = DEFAULT_USAGE_BAR_COLOR_SCHEME,
    barStyle = "thin",
    labelMap,
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
                />
            ))}
        </div>
    );
}
