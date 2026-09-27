import { useMemo } from "react";
import type {
    OverviewWindow,
    ProviderUsageAccount,
    ProviderUsageGroup,
} from "../lib/provider-usage";
import type { UsageBarColorScheme, UsageBarStyle } from "../../shared/types/config";
import { overview_fill_color } from "../lib/usage-colors";
import { UsageBarList } from "./UsageBarList";
import { AccountUsageRow } from "./UsageRows";
import { Skeleton } from "./ui/Skeleton";

interface ProviderCardOverviewProps {
    isRefreshing: boolean;
    overviewPeriods: OverviewWindow[];
    barColorScheme?: UsageBarColorScheme | undefined;
    barStyle?: UsageBarStyle | undefined;
    forcePercent?: boolean | undefined;
}

export function ProviderCardOverview({
    isRefreshing,
    overviewPeriods,
    barColorScheme,
    barStyle,
    forcePercent,
}: ProviderCardOverviewProps) {
    /**
     * 风险色模式：概览条填充色取各子账号风险色的 RGB 平均
     *（宽度仍用 sum(used)/sum(limit) 聚合 pct）。nine-cycle 不做平均，
     * 交给 UsageBarRow 按位置取色；同色成员直接复用原 token。
     */
    const fill_colors = useMemo(
        () =>
            barColorScheme === "nine-cycle"
                ? undefined
                : overviewPeriods.map((period, idx) =>
                      overview_fill_color(
                          barColorScheme,
                          { pct: period.percent, idx, elapsed: undefined },
                          period.members,
                      ),
                  ),
        [overviewPeriods, barColorScheme],
    );
    if (isRefreshing && !overviewPeriods.length) {
        return (
            <div className="mt-3 flex flex-col gap-[9px]">
                <div className="grid grid-cols-[42px_1fr] items-center gap-2.5">
                    <Skeleton className="h-3 w-10" />
                    <Skeleton className="h-3 w-full" />
                </div>
                <div className="grid grid-cols-[42px_1fr] items-center gap-2.5">
                    <Skeleton className="h-3 w-10" />
                    <Skeleton className="h-3 w-full" />
                </div>
            </div>
        );
    }
    if (!overviewPeriods.length)
        return (
            <div className="mt-3 flex items-center gap-[9px] text-[length:var(--text-body-md)] text-[var(--color-on-surface-muted)]">
                暂无有效用量数据
            </div>
        );
    return (
        <UsageBarList
            periods={overviewPeriods}
            colorScheme={barColorScheme}
            barStyle={barStyle}
            forcePercent={forcePercent}
            fillColors={fill_colors}
        />
    );
}

interface ProviderCardAccountDetailProps {
    group: ProviderUsageGroup;
    barColorScheme?: UsageBarColorScheme | undefined;
    barStyle?: UsageBarStyle | undefined;
    labelMapForAccount: (
        account: ProviderUsageAccount,
    ) => Readonly<Record<string, string>> | undefined;
    desensitizeRemarks?: boolean | undefined;
    forcePercent?: boolean | undefined;
}

export function ProviderCardAccountDetail({
    group,
    barColorScheme,
    barStyle,
    labelMapForAccount,
    desensitizeRemarks,
    forcePercent,
}: ProviderCardAccountDetailProps) {
    return (
        <div
            className="mt-[14px] flex flex-col motion-safe:animate-[maDrawer_0.22s_cubic-bezier(0.2,0.8,0.3,1)]"
            data-testid="acct-detail"
        >
            {group.accounts.map((account) => (
                <AccountUsageRow
                    key={account.id}
                    account={account}
                    barColorScheme={barColorScheme}
                    barStyle={barStyle}
                    labelMap={labelMapForAccount(account)}
                    desensitizeRemarks={desensitizeRemarks}
                    forcePercent={forcePercent}
                />
            ))}
        </div>
    );
}
