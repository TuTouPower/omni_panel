import type { UsageProvider } from "../../shared/schemas/plugin-output";
import type { ProviderUsageGroup } from "../lib/provider-usage";
import type { UsageBarColorScheme } from "../lib/usage-colors";
import { ProviderCard } from "./ProviderCard";

export interface ProviderError {
    displayName: string;
    error: string;
}

interface ProviderOverviewProps {
    groups: ProviderUsageGroup[];
    visibleProviders: UsageProvider[];
    providerErrors: Map<UsageProvider, ProviderError>;
    onRefreshProvider: (provider: UsageProvider) => void;
    expandedProviders?: Record<string, boolean> | undefined;
    onToggleExpandProvider?: ((provider: UsageProvider) => void) | undefined;
    disabledProviders?: Set<string> | undefined;
    onToggleDisableProvider?: ((provider: UsageProvider) => void) | undefined;
    onDeleteProvider?: ((provider: UsageProvider) => void) | undefined;
    draggingProvider?: UsageProvider | null | undefined;
    overProvider?: UsageProvider | null | undefined;
    onDragStart?: ((provider: UsageProvider) => void) | undefined;
    onDragEnter?: ((provider: UsageProvider) => void) | undefined;
    onDragEnd?: (() => void) | undefined;
    refreshingProviders?: Set<string> | undefined;
    barColorScheme?: UsageBarColorScheme | undefined;
}

export function ProviderOverview({
    groups,
    visibleProviders,
    providerErrors,
    onRefreshProvider,
    expandedProviders,
    onToggleExpandProvider,
    disabledProviders,
    onToggleDisableProvider,
    onDeleteProvider,
    draggingProvider,
    overProvider,
    onDragStart,
    onDragEnter,
    onDragEnd,
    refreshingProviders,
    barColorScheme,
}: ProviderOverviewProps) {
    const groupsByProvider = new Map(groups.map((group) => [group.provider, group]));

    return (
        <>
            {visibleProviders.map((provider) => {
                return (
                    <ProviderCard
                        key={provider}
                        provider={provider}
                        group={groupsByProvider.get(provider)}
                        connectorError={providerErrors.get(provider)}
                        onRefresh={onRefreshProvider}
                        disabled={disabledProviders?.has(provider) ?? false}
                        expanded={
                            expandedProviders ? (expandedProviders[provider] ?? false) : undefined
                        }
                        onToggleExpand={onToggleExpandProvider}
                        onToggleDisable={onToggleDisableProvider}
                        onDelete={onDeleteProvider}
                        dragging={draggingProvider === provider}
                        dragOver={overProvider === provider && draggingProvider !== provider}
                        onDragStart={onDragStart}
                        onDragEnter={onDragEnter}
                        onDragEnd={onDragEnd}
                        refreshing={refreshingProviders?.has(provider)}
                        barColorScheme={barColorScheme}
                    />
                );
            })}
        </>
    );
}
