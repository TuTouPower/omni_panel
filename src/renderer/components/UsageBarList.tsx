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
    /** 与 periods 等长：概览风险色平均覆盖，未提供时按常规取色。 */
    fillColors?: readonly (string | undefined)[] | undefined;
}

export function UsageBarList({
    periods,
    className,
    colorScheme = DEFAULT_USAGE_BAR_COLOR_SCHEME,
    barStyle = "thin",
    labelMap,
    forcePercent = false,
    fillColors,
}: UsageBarListProps) {
    return (
        <div
            className={
                className ??
                (barStyle === "capsule"
                    ? "mt-3 flex flex-col gap-2"
                    : "mt-3 flex flex-col gap-[9px]")
            }
            data-testid="usage-bars"
        >
            {periods.map((period, idx) => (
                <UsageBarRow
                    key={period.id}
                    period={period}
                    index={idx}
                    colorScheme={colorScheme}
                    barStyle={barStyle}
                    labelMap={labelMap}
                    forcePercent={forcePercent}
                    fillColor={fillColors?.[idx]}
                />
            ))}
        </div>
    );
}
