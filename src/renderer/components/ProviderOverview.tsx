import type { UsageProvider } from "../../shared/schemas/plugin-output";
import type { ProviderUsageGroup } from "../lib/provider-usage";
import { ProviderCard } from "./ProviderCard";

export interface ProviderError {
    displayName: string;
    error: string;
}

interface ProviderOverviewProps {
    groups: ProviderUsageGroup[];
    visibleProviders: UsageProvider[];
    providerErrors: Map<UsageProvider, ProviderError>;
    onSelectProvider: (provider: UsageProvider) => void;
    onRefreshProvider: (provider: UsageProvider) => void;
    /** Currently expanded providers in the overview (in-place expand). */
    expandedProviders?: Record<string, boolean>;
    /** Called when a provider card chevron is toggled. */
    onToggleExpandProvider?: (provider: UsageProvider) => void;
}

export function ProviderOverview({
    groups,
    visibleProviders,
    providerErrors,
    onSelectProvider,
    onRefreshProvider,
    expandedProviders,
    onToggleExpandProvider,
}: ProviderOverviewProps) {
    const groupsByProvider = new Map(groups.map((group) => [group.provider, group]));

    return (
        <>
            {visibleProviders.map((provider) => (
                <ProviderCard
                    key={provider}
                    provider={provider}
                    group={groupsByProvider.get(provider)}
                    connectorError={providerErrors.get(provider)}
                    onSelect={onSelectProvider}
                    onRefresh={onRefreshProvider}
                    expanded={
                        expandedProviders ? (expandedProviders[provider] ?? false) : undefined
                    }
                    onToggleExpand={onToggleExpandProvider}
                />
            ))}
        </>
    );
}
