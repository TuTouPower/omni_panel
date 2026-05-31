import type { UsageProvider } from "../../shared/schemas/plugin-output";
import type { ProviderUsageGroup } from "../lib/provider-usage";
import { ProviderCard } from "./ProviderCard";

interface ProviderOverviewProps {
    groups: ProviderUsageGroup[];
    visibleProviders: UsageProvider[];
    onSelectProvider: (provider: UsageProvider) => void;
    onRefreshProvider: (provider: UsageProvider) => void;
}

export function ProviderOverview({
    groups,
    visibleProviders,
    onSelectProvider,
    onRefreshProvider,
}: ProviderOverviewProps) {
    const groupsByProvider = new Map(groups.map((group) => [group.provider, group]));

    return (
        <>
            {visibleProviders.map((provider) => (
                <ProviderCard
                    key={provider}
                    provider={provider}
                    group={groupsByProvider.get(provider)}
                    onSelect={onSelectProvider}
                    onRefresh={onRefreshProvider}
                />
            ))}
        </>
    );
}
