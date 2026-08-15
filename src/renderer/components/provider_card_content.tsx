import type {
    OverviewWindow,
    ProviderUsageAccount,
    ProviderUsageGroup,
} from "../lib/provider-usage";
import type { UsageBarColorScheme, UsageBarStyle } from "../../shared/types/config";
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
