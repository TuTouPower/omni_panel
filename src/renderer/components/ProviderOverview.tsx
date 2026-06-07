import type { UsageProvider } from "../../shared/schemas/plugin-output";
import type { ProviderUsageAccount, ProviderUsageGroup } from "../lib/provider-usage";
import type { UsageBarColorScheme, UsageBarStyle } from "../../shared/types/config";
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
    onToggleDisableProvider?: ((provider: UsageProvider) => void) | undefined;
    onEditAccount?: ((account: ProviderUsageAccount) => void) | undefined;
    draggingProvider?: UsageProvider | null | undefined;
    overProvider?: UsageProvider | null | undefined;
    onDragStart?: ((provider: UsageProvider) => void) | undefined;
    onDragEnter?: ((provider: UsageProvider) => void) | undefined;
    onDragOver?: ((provider: UsageProvider, clientY: number, rect: DOMRect) => void) | undefined;
    onDragEnd?: (() => void) | undefined;
    refreshingProviders?: Set<string> | undefined;
    barColorScheme?: UsageBarColorScheme | undefined;
    barStyle?: UsageBarStyle | undefined;
    labelMap?: Readonly<Record<string, string>> | undefined;
}

export function ProviderOverview({
    groups,
    visibleProviders,
    providerErrors,
    onRefreshProvider,
    expandedProviders,
    onToggleExpandProvider,
    onToggleDisableProvider,
    onEditAccount,
    draggingProvider,
    overProvider,
    onDragStart,
    onDragEnter,
    onDragOver,
    onDragEnd,
    refreshingProviders,
    barColorScheme,
    barStyle,
    labelMap,
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
                        expanded={
                            expandedProviders ? (expandedProviders[provider] ?? false) : undefined
                        }
                        onToggleExpand={onToggleExpandProvider}
                        onToggleDisable={onToggleDisableProvider}
                        onEditAccount={onEditAccount}
                        dragging={draggingProvider === provider}
                        dragOver={overProvider === provider && draggingProvider !== provider}
                        onDragStart={onDragStart}
                        onDragEnter={onDragEnter}
                        onDragOver={onDragOver}
                        onDragEnd={onDragEnd}
                        refreshing={refreshingProviders?.has(provider)}
                        barColorScheme={barColorScheme}
                        barStyle={barStyle}
                        labelMap={labelMap}
                    />
                );
            })}
        </>
    );
}
